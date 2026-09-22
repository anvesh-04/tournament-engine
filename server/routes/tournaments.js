const express = require("express");
const router = express.Router();
const Tournament = require("../models/Tournament");
const Sport = require("../models/Sport");
const { generateRoundRobinSchedule } = require("../algorithms/graphColoring");
const { generateKnockoutSchedule } = require("../algorithms/topologicalSort");
const { computeStandings } = require("../services/standings");
const { applyMatchUpdate, httpStatusFor } = require("../services/matchUpdates");
const { notifyMatchChange } = require("../services/notifications");
const Notification = require("../models/Notification");
const {
  requireAuth,
  requireRole,
  requireSportAccess,
  attachUserIfPresent,
} = require("../middleware/auth");

/**
 * Resolves the sport a tournament belongs to, for the ownership middleware.
 * Returns null for a tournament with no sport, which requireSportAccess
 * treats as super-admin-only.
 */
async function sportOfTournament(req) {
  const tournament = await Tournament.findById(req.params.id).select("sportId");
  return tournament ? tournament.sportId : null;
}

/**
 * Reads are left open to unauthenticated callers, and writes are not.
 * This is deliberate: fixtures are public information (they are pinned on a
 * noticeboard), and the already-deployed client reads them without a token.
 * Everything that MUTATES a tournament requires a signed-in admin scoped to
 * the tournament's sport.
 */

/**
 * POST /api/tournaments
 * Body: { name, format, numCourts, teamNames, sportId? }
 *
 * A sport-admin may only create tournaments under their own sport — any
 * sportId they send is ignored in favour of their assigned one, so a crafted
 * request body cannot place a tournament in someone else's sport.
 */
router.post("/", requireAuth, requireRole("super-admin", "sport-admin"), async (req, res) => {
  try {
    const { name, format, numCourts, teamNames } = req.body;

    if (!name || !format || !teamNames || teamNames.length < 2) {
      return res.status(400).json({
        error: "name, format, and at least 2 teamNames are required",
      });
    }

    let sportId;
    if (req.user.role === "sport-admin") {
      sportId = req.user.sport;
    } else {
      sportId = req.body.sportId || null;
      if (sportId && !(await Sport.findById(sportId))) {
        return res.status(400).json({ error: "That sport does not exist." });
      }
    }

    const tournament = new Tournament({
      name,
      format,
      numCourts: numCourts || 1,
      sportId,
      createdBy: req.user._id,
      teams: teamNames.map((n) => ({ name: n })),
      matches: [],
    });

    await tournament.save();
    res.status(201).json(tournament);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/tournaments/:id/generate-fixtures
 * Runs the appropriate algorithm (graph coloring or Kahn's topological sort)
 * based on the tournament's format, and saves the resulting matches.
 */
router.post(
  "/:id/generate-fixtures",
  requireAuth,
  requireRole("super-admin", "sport-admin"),
  requireSportAccess(sportOfTournament),
  async (req, res) => {
    try {
      const tournament = await Tournament.findById(req.params.id);
      if (!tournament) return res.status(404).json({ error: "Tournament not found" });

      const teamNames = tournament.teams.map((t) => t.name);
      let matches = [];

      if (tournament.format === "round-robin") {
        const rawSchedule = generateRoundRobinSchedule(teamNames, tournament.numCourts);
        matches = rawSchedule.map((m, idx) => ({
          matchRefId: `RR${idx}`,
          round: 1, // round-robin doesn't use sequential rounds; all "round 1" conceptually
          teamA: m.teamA,
          teamB: m.teamB,
          timeSlot: m.timeSlot,
          court: m.court,
          dependsOn: [],
          status: "SCHEDULED",
        }));
      } else if (tournament.format === "knockout") {
        const rawSchedule = generateKnockoutSchedule(teamNames);
        matches = rawSchedule.map((m) => ({
          matchRefId: m.id,
          round: m.round,
          teamA: m.teamA,
          teamB: m.teamB,
          winner: m.winner,
          dependsOn: m.dependsOn,
          status: m.status,
        }));
      } else {
        return res.status(400).json({ error: "Unknown tournament format" });
      }

      tournament.matches = matches;
      await tournament.save();
      res.json(tournament);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * GET /api/tournaments
 * A sport-admin or player sees only their own sport's tournaments. A
 * super-admin, or an anonymous caller, sees all of them.
 */
router.get("/", attachUserIfPresent, async (req, res) => {
  try {
    const filter = {};
    if (req.user && req.user.role !== "super-admin" && req.user.sport) {
      filter.sportId = req.user.sport;
    }
    const tournaments = await Tournament.find(filter).select(
      "name format numCourts sportId createdAt"
    );
    res.json(tournaments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/tournaments/:id/standings
 * Round-robin leaderboard: wins/losses/points per team, best first.
 * Knockout tournaments are rejected rather than returning an empty table,
 * because an empty table reads as "nobody has scored yet" when the real
 * answer is "standings do not apply to this format — read the bracket".
 */
router.get("/:id/standings", async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) return res.status(404).json({ error: "Tournament not found" });

    if (tournament.format !== "round-robin") {
      return res.status(400).json({
        error:
          "Standings apply to round-robin tournaments only. For a knockout tournament, the bracket shows who is still in.",
      });
    }

    res.json({
      tournamentId: tournament._id,
      tournamentName: tournament.name,
      pointsPerWin: 3,
      pointsPerLoss: 0,
      standings: computeStandings(tournament),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/tournaments/:id
 * Registered last among the GETs so the more specific /:id/standings route
 * is matched first.
 */
router.get("/:id", async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) return res.status(404).json({ error: "Tournament not found" });
    res.json(tournament);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/tournaments/:id/matches/:matchRefId
 * Edits a single match (time slot, court, or recording a winner).
 * Body: { timeSlot?, court?, winner? }
 *
 * The scheduling rules are NOT implemented here. They live in
 * services/matchUpdates.js, which is the single validated path every caller
 * — this endpoint and the AI admin-command endpoint alike — has to go
 * through. This handler only translates the service's outcome into HTTP and
 * fires the resulting notifications.
 */
router.patch(
  "/:id/matches/:matchRefId",
  requireAuth,
  requireRole("super-admin", "sport-admin"),
  requireSportAccess(sportOfTournament),
  async (req, res) => {
    try {
      const tournament = await Tournament.findById(req.params.id);
      if (!tournament) return res.status(404).json({ error: "Tournament not found" });

      const { timeSlot, court, winner } = req.body;
      const result = applyMatchUpdate(tournament, req.params.matchRefId, {
        timeSlot,
        court,
        winner,
      });

      if (!result.ok) {
        return res.status(httpStatusFor(result.outcome)).json({ error: result.error });
      }

      await tournament.save();

      // Best-effort and awaited: a player being told late is worse than the
      // admin's request taking an extra moment, and awaiting means the
      // response can honestly report how many people were reached.
      const notification = await notifyMatchChange({
        tournament,
        match: result.match,
        changes: result.changes,
      });

      res.json({ ...tournament.toObject(), notification });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * DELETE /api/tournaments/:id
 *
 * Removes a tournament, its embedded teams and its whole fixture list. There
 * is no soft-delete and no undo, so this sits behind the same RBAC as every
 * other write: an admin scoped to the tournament’s own sport, or a
 * super-admin.
 *
 * Notifications that pointed at this tournament go with it. A player being
 * told “your match moved to slot 5” for a tournament that no longer exists is
 * noise, and the record would dangle against a missing id.
 *
 * The response reports what was destroyed rather than an empty 204, so the
 * caller can show the admin a factual confirmation instead of guessing.
 */
router.delete(
  "/:id",
  requireAuth,
  requireRole("super-admin", "sport-admin"),
  requireSportAccess(sportOfTournament),
  async (req, res) => {
    try {
      const tournament = await Tournament.findById(req.params.id);
      if (!tournament) return res.status(404).json({ error: "Tournament not found" });

      const summary = {
        id: String(tournament._id),
        name: tournament.name,
        format: tournament.format,
        teams: tournament.teams.length,
        matches: tournament.matches.length,
        recordedResults: tournament.matches.filter((m) => m.winner).length,
      };

      const { deletedCount } = await Notification.deleteMany({
        tournamentId: tournament._id,
      });

      await tournament.deleteOne();

      res.json({ deleted: summary, notificationsRemoved: deletedCount });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

module.exports = router;
module.exports.sportOfTournament = sportOfTournament;
