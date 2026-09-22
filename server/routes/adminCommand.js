const express = require("express");
const router = express.Router();
const Tournament = require("../models/Tournament");
const { requireAuth, requireRole } = require("../middleware/auth");
const { canAccessSport } = require("../services/auth");
const { interpretCommand, isConfigured } = require("../services/llm");
const {
  ACTION_SCHEMA,
  validateAction,
  planAction,
  executePlan,
  summarisePlan,
  signPreview,
  verifyPreview,
  sportScopeOf,
} = require("../services/adminCommands");
const { notifyMatchChange } = require("../services/notifications");

/**
 * AI ADMIN COMMANDS — HTTP LAYER
 * ------------------------------
 * Two endpoints, and the split between them is the whole safety story:
 *
 *   POST /api/admin/command         — interpret, validate, simulate, PREVIEW.
 *                                     Changes nothing.
 *   POST /api/admin/command/confirm — re-validate, re-simulate, SAVE.
 *                                     Only reachable with a signed preview.
 *
 * Nothing the model produces is applied without an admin seeing a plain-English
 * description of the exact changes and explicitly confirming them.
 *
 * Both endpoints run the change through services/matchUpdates.js, the same
 * module the human PATCH endpoint uses, so the AI path cannot produce a
 * schedule the manual path would have rejected.
 */

/**
 * Loads every tournament the calling admin is allowed to act on.
 * A sport-admin sees only their own sport, which is what stops a command from
 * reaching another sport's fixtures no matter how it is phrased.
 */
async function loadTournamentsInScope(user) {
  if (user.role === "super-admin") return Tournament.find();
  if (!user.sport) return [];
  return Tournament.find({ sportId: user.sport });
}

/**
 * Confirms the action stays inside the caller's sport.
 *
 * The scope filter on loadTournamentsInScope already makes out-of-scope
 * tournaments unreachable, but an explicitly named sportId (the bulk action)
 * has to be checked directly — otherwise a sport-admin could name another
 * sport's id and get a confusing "no matches found" instead of a refusal.
 */
function checkActionScope(user, action) {
  const namedSport = sportScopeOf(action);
  if (namedSport && !canAccessSport(user, namedSport)) {
    return { ok: false, error: "You can only issue commands for your own sport." };
  }
  return { ok: true };
}

/**
 * Interprets and simulates a command, without saving.
 * Shared by both endpoints so the preview and the confirm are produced by
 * identical code — the admin cannot be shown one thing and have another applied.
 */
async function buildPlan(user, action) {
  const scope = checkActionScope(user, action);
  if (!scope.ok) return { ok: false, status: 403, error: scope.error };

  const tournaments = await loadTournamentsInScope(user);
  const planned = planAction(action, tournaments);
  if (!planned.ok) return { ok: false, status: 400, error: planned.error };

  const executed = executePlan(planned.plan);
  if (!executed.ok) {
    // A conflict here means the AI-proposed change was caught by exactly the
    // same check that would have rejected a human making the same edit.
    return {
      ok: false,
      status: executed.outcome === "CONFLICT" ? 409 : 400,
      error: executed.error,
    };
  }

  return { ok: true, executed };
}

/**
 * GET /api/admin/command/actions
 * The action set, so the UI can tell admins what is actually possible rather
 * than leaving them guessing at what phrasing will work.
 */
router.get(
  "/command/actions",
  requireAuth,
  requireRole("super-admin", "sport-admin"),
  (req, res) => {
    res.json({
      available: isConfigured(),
      actions: Object.entries(ACTION_SCHEMA).map(([name, spec]) => ({
        name,
        description: spec.description,
        fields: Object.keys(spec.fields),
      })),
    });
  }
);

/**
 * POST /api/admin/command
 * Body: { text }
 *
 * Returns a preview. Applies nothing.
 */
router.post(
  "/command",
  requireAuth,
  requireRole("super-admin", "sport-admin"),
  async (req, res) => {
    try {
      const { text } = req.body;
      if (!text || !String(text).trim()) {
        return res.status(400).json({ error: "Tell me what you would like to change." });
      }

      const tournaments = await loadTournamentsInScope(req.user);
      if (tournaments.length === 0) {
        return res
          .status(400)
          .json({ error: "There are no tournaments in your sport to change." });
      }

      const interpreted = await interpretCommand({ text, tournaments });
      if (!interpreted.ok) {
        return res.status(interpreted.unsupported ? 422 : 400).json({
          error: interpreted.error,
          unsupported: interpreted.unsupported || false,
        });
      }

      // The model's output is re-checked from scratch against the hand-written
      // schema. The API's strict-tool guarantee is convenience, not trust.
      const validated = validateAction(interpreted.raw);
      if (!validated.ok) {
        return res.status(400).json({ error: validated.error });
      }

      const built = await buildPlan(req.user, validated.action);
      if (!built.ok) {
        return res.status(built.status).json({ error: built.error, action: validated.action });
      }

      const { issuedAt, signature } = signPreview(validated.action, String(req.user._id));

      res.json({
        preview: {
          summary: summarisePlan(validated.action, built.executed.changes),
          changes: built.executed.changes.map((c) => c.description),
          detail: built.executed.changes,
          matchCount: built.executed.changes.length,
        },
        // Echoed back on confirm. The signature binds this exact action to
        // this admin, so the confirm cannot apply anything else.
        action: validated.action,
        issuedAt,
        signature,
        requiresConfirmation: true,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * POST /api/admin/command/confirm
 * Body: { action, issuedAt, signature }
 *
 * Applies a previously previewed command. The plan is rebuilt from the CURRENT
 * schedule rather than from anything cached at preview time, so a change made
 * by someone else in between is caught instead of being silently overwritten.
 */
router.post(
  "/command/confirm",
  requireAuth,
  requireRole("super-admin", "sport-admin"),
  async (req, res) => {
    try {
      const { action, issuedAt, signature } = req.body;

      const validated = validateAction(action);
      if (!validated.ok) return res.status(400).json({ error: validated.error });

      const verified = verifyPreview(
        validated.action,
        String(req.user._id),
        issuedAt,
        signature
      );
      if (!verified.ok) return res.status(400).json({ error: verified.error });

      const built = await buildPlan(req.user, validated.action);
      if (!built.ok) {
        return res.status(built.status).json({
          error: built.error,
          note: "The schedule has changed since this command was previewed.",
        });
      }

      // Only now is anything written.
      const { tournaments, changes } = built.executed;
      for (const tournament of tournaments) {
        await tournament.save();
      }

      // Phase 3 notifications, fired for each match that actually moved.
      const notified = [];
      const changedMatchKeys = new Set();
      for (const change of changes) {
        const key = `${change.tournamentId}:${change.matchRefId}`;
        if (changedMatchKeys.has(key)) continue;
        changedMatchKeys.add(key);

        const tournament = tournaments.find(
          (t) => String(t._id) === change.tournamentId
        );
        const match = tournament.matches.find((m) => m.matchRefId === change.matchRefId);
        const matchChanges = changes.filter(
          (c) => c.tournamentId === change.tournamentId && c.matchRefId === change.matchRefId
        );

        notified.push(
          await notifyMatchChange({ tournament, match, changes: matchChanges })
        );
      }

      res.json({
        applied: true,
        summary: summarisePlan(validated.action, changes),
        changes: changes.map((c) => c.description),
        playersNotified: notified.reduce((sum, n) => sum + n.notified, 0),
        emailsSent: notified.reduce((sum, n) => sum + n.emailsSent, 0),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

module.exports = router;
