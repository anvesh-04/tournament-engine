const crypto = require("crypto");
const { applyMatchUpdates, describeChange } = require("./matchUpdates");

/**
 * AI ADMIN COMMANDS — SCHEMA, VALIDATION AND PLANNING
 * ---------------------------------------------------
 * The LLM's entire job is to map one sentence of English onto ONE of the
 * fixed actions defined below, with concrete arguments. It never writes SQL,
 * never sees the database, and never produces a change that is applied as-is.
 *
 * Everything downstream of the model treats its output as untrusted input:
 *
 *   1. validateAction() checks the JSON against this hand-written schema.
 *      Unknown action names, unknown fields, and wrong types are rejected
 *      outright — the model cannot invent a new capability by naming one.
 *   2. planAction() turns the validated action into a concrete list of match
 *      updates, and runs them through services/matchUpdates.js — the SAME
 *      conflict checking the human PATCH endpoint uses. A plan that would
 *      double-book a team fails here, exactly as it would for a human admin.
 *   3. The route shows the resulting plan to the admin and applies nothing
 *      until they confirm it.
 *
 * There is deliberately no code path in this file that saves anything.
 */

/**
 * The fixed action set. Adding a capability means adding it here, with its
 * argument types — not widening what the model is allowed to say.
 *
 * `fields` maps each argument to { type, required }. Types are checked
 * literally; "slot" means a non-negative integer.
 */
const ACTION_SCHEMA = {
  reschedule_match: {
    description: "Move one specific match to a different time slot and/or court.",
    fields: {
      tournamentId: { type: "id", required: true },
      matchRefId: { type: "string", required: true },
      timeSlot: { type: "slot", required: false },
      court: { type: "slot", required: false },
    },
    // At least one of these must be present, or the action does nothing.
    requiresOneOf: ["timeSlot", "court"],
  },

  reschedule_bulk_by_sport: {
    description:
      "Move every match currently in one time slot to a different time slot, across all tournaments in a sport.",
    fields: {
      sportId: { type: "id", required: true },
      fromTimeSlot: { type: "slot", required: true },
      toTimeSlot: { type: "slot", required: true },
    },
  },

  swap_court: {
    description:
      "Swap the courts of two matches that are in the same tournament and the same time slot.",
    fields: {
      tournamentId: { type: "id", required: true },
      matchRefIdA: { type: "string", required: true },
      matchRefIdB: { type: "string", required: true },
    },
  },
};

const ACTION_NAMES = Object.keys(ACTION_SCHEMA);

/** A 24-character hex string, the shape of a MongoDB ObjectId. */
const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

function checkFieldType(value, type) {
  switch (type) {
    case "id":
      return typeof value === "string" && OBJECT_ID_PATTERN.test(value);
    case "string":
      return typeof value === "string" && value.trim().length > 0;
    case "slot":
      return Number.isInteger(value) && value >= 0;
    default:
      return false;
  }
}

/**
 * Validates raw model output against ACTION_SCHEMA.
 * @returns { ok: true, action } | { ok: false, error }
 */
function validateAction(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "The action must be a JSON object." };
  }

  const { action } = raw;
  if (!ACTION_NAMES.includes(action)) {
    return {
      ok: false,
      error: `Unknown action "${action}". Supported actions: ${ACTION_NAMES.join(", ")}.`,
    };
  }

  const spec = ACTION_SCHEMA[action];
  const args = raw.args;
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return { ok: false, error: `Action "${action}" is missing its args object.` };
  }

  // Reject anything not in the schema rather than ignoring it. A silently
  // dropped field is a command that did something other than what it said.
  const allowed = Object.keys(spec.fields);
  const unknown = Object.keys(args).filter((k) => !allowed.includes(k));
  if (unknown.length > 0) {
    return {
      ok: false,
      error: `Action "${action}" does not accept: ${unknown.join(", ")}.`,
    };
  }

  const clean = {};
  for (const [field, rule] of Object.entries(spec.fields)) {
    const value = args[field];
    if (value === undefined || value === null) {
      if (rule.required) {
        return { ok: false, error: `Action "${action}" requires "${field}".` };
      }
      continue;
    }
    if (!checkFieldType(value, rule.type)) {
      return {
        ok: false,
        error: `Action "${action}": "${field}" must be ${
          rule.type === "slot" ? "a whole number of 0 or more" : `a valid ${rule.type}`
        }.`,
      };
    }
    clean[field] = value;
  }

  if (spec.requiresOneOf && !spec.requiresOneOf.some((f) => clean[f] !== undefined)) {
    return {
      ok: false,
      error: `Action "${action}" needs at least one of: ${spec.requiresOneOf.join(", ")}.`,
    };
  }

  return { ok: true, action: { action, args: clean } };
}

/**
 * Turns a validated action into concrete per-tournament update lists.
 *
 * @param action      a validated action
 * @param tournaments the tournament documents in scope (already fetched and
 *                    already access-checked by the caller)
 * @returns { ok: true, plan: [{ tournament, updates }] } | { ok: false, error }
 */
function planAction(action, tournaments) {
  const byId = new Map(tournaments.map((t) => [String(t._id), t]));

  switch (action.action) {
    case "reschedule_match": {
      const { tournamentId, matchRefId, timeSlot, court } = action.args;
      const tournament = byId.get(String(tournamentId));
      if (!tournament) return { ok: false, error: "That tournament was not found." };

      const changes = {};
      if (timeSlot !== undefined) changes.timeSlot = timeSlot;
      if (court !== undefined) changes.court = court;

      return { ok: true, plan: [{ tournament, updates: [{ matchRefId, changes }] }] };
    }

    case "reschedule_bulk_by_sport": {
      const { fromTimeSlot, toTimeSlot } = action.args;
      if (fromTimeSlot === toTimeSlot) {
        return { ok: false, error: "The source and target time slots are the same." };
      }

      const plan = [];
      for (const tournament of tournaments) {
        const updates = tournament.matches
          .filter((m) => m.timeSlot === fromTimeSlot)
          .map((m) => ({ matchRefId: m.matchRefId, changes: { timeSlot: toTimeSlot } }));
        if (updates.length > 0) plan.push({ tournament, updates });
      }

      if (plan.length === 0) {
        return {
          ok: false,
          error: `No matches are currently in time slot ${fromTimeSlot} for this sport.`,
        };
      }
      return { ok: true, plan };
    }

    case "swap_court": {
      const { tournamentId, matchRefIdA, matchRefIdB } = action.args;
      const tournament = byId.get(String(tournamentId));
      if (!tournament) return { ok: false, error: "That tournament was not found." };

      const a = tournament.matches.find((m) => m.matchRefId === matchRefIdA);
      const b = tournament.matches.find((m) => m.matchRefId === matchRefIdB);
      if (!a) return { ok: false, error: `Match ${matchRefIdA} was not found.` };
      if (!b) return { ok: false, error: `Match ${matchRefIdB} was not found.` };
      if (a.matchRefId === b.matchRefId) {
        return { ok: false, error: "Cannot swap a match with itself." };
      }
      if (a.court === b.court) {
        return { ok: false, error: "Those two matches are already on the same court." };
      }

      // A straight swap would transiently put A onto B's occupied court and
      // trip the court-conflict check. Parking A on a free court first keeps
      // every intermediate state legal, so the swap is validated by exactly
      // the same rules as any other move rather than needing an exemption.
      const parking = findFreeCourt(tournament, a.timeSlot, [a.court, b.court]);
      if (parking === null) {
        return {
          ok: false,
          error:
            "No spare court is free in that time slot to perform the swap. Move one match out first.",
        };
      }

      return {
        ok: true,
        plan: [
          {
            tournament,
            updates: [
              { matchRefId: a.matchRefId, changes: { court: parking } },
              { matchRefId: b.matchRefId, changes: { court: a.court } },
              { matchRefId: a.matchRefId, changes: { court: b.court } },
            ],
          },
        ],
      };
    }

    default:
      // Unreachable: validateAction rejects unknown names before this point.
      return { ok: false, error: `Unsupported action "${action.action}".` };
  }
}

/** Lowest court number not in use at `timeSlot`, ignoring `exclude`. */
function findFreeCourt(tournament, timeSlot, exclude = []) {
  const taken = new Set(
    tournament.matches.filter((m) => m.timeSlot === timeSlot).map((m) => m.court)
  );
  for (let court = 0; court < tournament.numCourts; court++) {
    if (!taken.has(court) && !exclude.includes(court)) return court;
  }
  return null;
}

/**
 * Executes a plan against the (in-memory) tournament documents and collects
 * what changed. NOTHING IS SAVED HERE — that is the caller's decision.
 *
 * Preview and confirm both call this. The preview discards the mutated
 * documents; the confirm saves them. Using one function for both is the point:
 * the admin is shown the result of the identical operation that will run.
 *
 * @returns { ok, tournaments, changes: [{tournamentId, tournamentName, matchRefId, description}] }
 *          or { ok: false, error }
 */
function executePlan(plan) {
  const changes = [];
  const touched = [];

  for (const { tournament, updates } of plan) {
    const result = applyMatchUpdates(tournament, updates);

    if (!result.ok) {
      const f = result.failure;
      return {
        ok: false,
        error: `${tournament.name}: ${f.error}`,
        outcome: f.outcome,
        failedMatchRefId: f.matchRefId,
      };
    }

    for (const step of result.results) {
      for (const change of step.changes) {
        changes.push({
          tournamentId: String(tournament._id),
          tournamentName: tournament.name,
          matchRefId: step.matchRefId,
          field: change.field,
          from: change.from,
          to: change.to,
          description: describeChange(step.matchRefId, step.match, change),
        });
      }
    }
    touched.push(tournament);
  }

  if (changes.length === 0) {
    return { ok: false, error: "That command would not change anything." };
  }

  return { ok: true, tournaments: touched, changes };
}

/**
 * Collapses a change list into the one-line summary the admin confirms
 * against, e.g. "This will move 4 matches to time slot 5."
 */
function summarisePlan(action, changes) {
  const matchCount = new Set(changes.map((c) => `${c.tournamentId}:${c.matchRefId}`)).size;
  const matches = `${matchCount} match${matchCount === 1 ? "" : "es"}`;

  switch (action.action) {
    case "reschedule_bulk_by_sport":
      return `This will move ${matches} from time slot ${action.args.fromTimeSlot} to time slot ${action.args.toTimeSlot}.`;
    case "swap_court":
      return `This will swap the courts of ${action.args.matchRefIdA} and ${action.args.matchRefIdB}.`;
    case "reschedule_match": {
      const parts = [];
      if (action.args.timeSlot !== undefined)
        parts.push(`time slot ${action.args.timeSlot}`);
      if (action.args.court !== undefined) parts.push(`court ${action.args.court}`);
      return `This will move ${action.args.matchRefId} to ${parts.join(" and ")}.`;
    }
    default:
      return `This will change ${matches}.`;
  }
}

/**
 * PREVIEW SIGNING
 * ---------------
 * The confirm step re-sends the action it was shown. Signing it with a server
 * secret means the confirm endpoint can verify the admin is approving exactly
 * the action that was previewed, rather than trusting a client-supplied body
 * that could have been altered between the two calls.
 *
 * The signature is bound to the approving user, so one admin's preview cannot
 * be replayed by another, and carries a timestamp so a stale preview of a
 * schedule that has since moved on is refused rather than silently applied.
 */
const PREVIEW_TTL_MS = 10 * 60 * 1000; // 10 minutes

function previewSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set; cannot sign command previews.");
  return secret;
}

function canonical(action) {
  // Sorted keys so the same action always serialises identically.
  return JSON.stringify({
    action: action.action,
    args: Object.fromEntries(Object.entries(action.args).sort(([a], [b]) => a.localeCompare(b))),
  });
}

function signPreview(action, userId, issuedAt = Date.now()) {
  const payload = `${canonical(action)}|${userId}|${issuedAt}`;
  const signature = crypto
    .createHmac("sha256", previewSecret())
    .update(payload)
    .digest("hex");
  return { issuedAt, signature };
}

/** @returns { ok: true } | { ok: false, error } */
function verifyPreview(action, userId, issuedAt, signature) {
  if (!signature || !issuedAt) {
    return { ok: false, error: "This command was not previewed. Preview it first." };
  }
  if (Date.now() - Number(issuedAt) > PREVIEW_TTL_MS) {
    return {
      ok: false,
      error: "This preview has expired. Run the command again to see a fresh preview.",
    };
  }

  const expected = signPreview(action, userId, Number(issuedAt)).signature;
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(String(signature), "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return {
      ok: false,
      error: "This command does not match the one that was previewed.",
    };
  }
  return { ok: true };
}

/**
 * Which sport an action targets, for the RBAC ownership check. Returns
 * undefined when the sport has to be derived from a tournament the caller
 * must look up (the route does that).
 */
function sportScopeOf(action) {
  return action.action === "reschedule_bulk_by_sport" ? action.args.sportId : undefined;
}

module.exports = {
  ACTION_SCHEMA,
  ACTION_NAMES,
  PREVIEW_TTL_MS,
  validateAction,
  planAction,
  executePlan,
  summarisePlan,
  signPreview,
  verifyPreview,
  sportScopeOf,
  findFreeCourt,
};
