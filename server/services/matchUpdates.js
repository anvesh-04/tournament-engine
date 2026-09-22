/**
 * THE SINGLE VALIDATED MATCH-UPDATE PATH
 * --------------------------------------
 * This module holds the conflict-checking and winner-propagation logic that
 * previously lived inline in routes/tournaments.js. The behaviour is
 * unchanged — it was lifted out verbatim and then covered with tests.
 *
 * It was extracted for one reason: the PATCH endpoint is no longer the only
 * caller. The AI admin-command feature (routes/adminCommand.js) also applies
 * schedule changes, and it MUST go through exactly this code rather than
 * writing to the database itself. If the AI path had its own update logic,
 * the conflict check would be one copy-paste away from drifting out of sync,
 * and an LLM-proposed change could land a double-booking that the human path
 * would have rejected with a 409.
 *
 * So: every write to a match's timeSlot, court or winner goes through
 * applyMatchUpdate(). Callers differ only in who is asking and what they do
 * with the result.
 *
 * These functions are pure with respect to the database: they mutate the
 * in-memory mongoose document and report what changed. Saving is the caller's
 * job, which is what lets the AI path run a dry-run preview (apply to a
 * throwaway copy, show the admin the diff, discard) using the identical rules
 * that the real write will use.
 */

/** Outcome codes, mapped to HTTP statuses by the route layer. */
const OUTCOME = {
  OK: "OK",
  MATCH_NOT_FOUND: "MATCH_NOT_FOUND",
  INVALID_COURT: "INVALID_COURT",
  CONFLICT: "CONFLICT",
  INVALID_WINNER: "INVALID_WINNER",
  NO_CHANGE: "NO_CHANGE",
};

const HTTP_STATUS_FOR_OUTCOME = {
  [OUTCOME.MATCH_NOT_FOUND]: 404,
  [OUTCOME.INVALID_COURT]: 400,
  [OUTCOME.CONFLICT]: 409,
  [OUTCOME.INVALID_WINNER]: 400,
};

function failure(outcome, error, extra = {}) {
  return { ok: false, outcome, error, ...extra };
}

/**
 * Finds a match in the tournament that would clash with `match` being placed
 * at `timeSlot` — i.e. any OTHER match in the same time slot that involves
 * one of this match's two teams. A team cannot be in two places at once.
 *
 * Note this checks the time slot only, not the court: two matches sharing a
 * team in the same slot are a conflict regardless of which courts they are on.
 */
function findTeamConflict(tournament, match, timeSlot) {
  if (timeSlot === null || timeSlot === undefined) return undefined;

  // Only real team names participate. Comparing raw fields would make two
  // unresolved knockout matches (teamA === null === teamA) look like they
  // share a team, producing a phantom 409 that no admin could clear.
  const ours = new Set([match.teamA, match.teamB].filter(Boolean));
  if (ours.size === 0) return undefined;

  return tournament.matches.find(
    (m) =>
      m.matchRefId !== match.matchRefId &&
      m.timeSlot === timeSlot &&
      ((m.teamA && ours.has(m.teamA)) || (m.teamB && ours.has(m.teamB)))
  );
}

/**
 * Finds another match already occupying the same court in the same time slot.
 * One physical court cannot host two simultaneous matches.
 */
function findCourtConflict(tournament, match, timeSlot, court) {
  // An unassigned slot or court is not an occupancy claim, so it cannot clash.
  if (timeSlot === null || timeSlot === undefined) return undefined;
  if (court === null || court === undefined) return undefined;

  return tournament.matches.find(
    (m) =>
      m.matchRefId !== match.matchRefId &&
      m.timeSlot === timeSlot &&
      m.court === court
  );
}

/**
 * Applies an update to one match, enforcing every scheduling rule.
 *
 * @param tournament   a mongoose Tournament document (mutated in place on success)
 * @param matchRefId   which match to change
 * @param changes      { timeSlot?, court?, winner? }
 * @returns on success { ok: true, match, changes: [{field, from, to}], propagatedTo? }
 *          on failure { ok: false, outcome, error, conflictingMatchRefId? }
 *
 * The caller is responsible for persisting the tournament. Nothing here saves.
 */
function applyMatchUpdate(tournament, matchRefId, changes = {}) {
  const match = tournament.matches.find((m) => m.matchRefId === matchRefId);
  if (!match) {
    return failure(OUTCOME.MATCH_NOT_FOUND, `Match ${matchRefId} not found.`);
  }

  const { timeSlot, court, winner } = changes;
  const applied = [];

  if (timeSlot !== undefined || court !== undefined) {
    const newTimeSlot = timeSlot !== undefined ? timeSlot : match.timeSlot;
    const newCourt = court !== undefined ? court : match.court;

    // null is a legitimate value meaning "not placed on the timetable yet" —
    // that is the state every knockout match starts in — so only a value that
    // is actually present gets range-checked.
    if (newTimeSlot !== null && (!Number.isInteger(newTimeSlot) || newTimeSlot < 0)) {
      return failure(
        OUTCOME.INVALID_COURT,
        `Invalid time slot: must be a whole number of 0 or more, got ${newTimeSlot}.`
      );
    }

    if (
      newCourt !== null &&
      (!Number.isInteger(newCourt) || newCourt < 0 || newCourt >= tournament.numCourts)
    ) {
      return failure(
        OUTCOME.INVALID_COURT,
        `Invalid court: this tournament only has courts 0 to ${tournament.numCourts - 1}.`
      );
    }

    const teamClash = findTeamConflict(tournament, match, newTimeSlot);
    if (teamClash) {
      return failure(
        OUTCOME.CONFLICT,
        `Conflict: a team in this match is already scheduled at time slot ${newTimeSlot} in match ${teamClash.matchRefId}`,
        { conflictingMatchRefId: teamClash.matchRefId }
      );
    }

    const courtClash = findCourtConflict(tournament, match, newTimeSlot, newCourt);
    if (courtClash) {
      return failure(
        OUTCOME.CONFLICT,
        `Conflict: court ${newCourt} is already hosting match ${courtClash.matchRefId} at time slot ${newTimeSlot}`,
        { conflictingMatchRefId: courtClash.matchRefId }
      );
    }

    if (match.timeSlot !== newTimeSlot) {
      applied.push({ field: "timeSlot", from: match.timeSlot, to: newTimeSlot });
      match.timeSlot = newTimeSlot;
    }
    if (match.court !== newCourt) {
      applied.push({ field: "court", from: match.court, to: newCourt });
      match.court = newCourt;
    }
  }

  let propagatedTo = null;

  if (winner !== undefined) {
    // A winner must be one of the two teams actually in the match. Without
    // this the bracket could propagate a team that never played into the
    // next round, and standings would award points to a phantom team.
    if (winner !== match.teamA && winner !== match.teamB) {
      return failure(
        OUTCOME.INVALID_WINNER,
        `Invalid winner: "${winner}" is not a team in match ${matchRefId} (${match.teamA} vs ${match.teamB}).`
      );
    }

    if (match.winner !== winner) {
      applied.push({ field: "winner", from: match.winner, to: winner });
    }
    match.winner = winner;
    match.status = "COMPLETED";

    // Knockout only: feed the winner into the match that depends on this one.
    const dependentMatch = tournament.matches.find((m) =>
      (m.dependsOn || []).includes(match.matchRefId)
    );
    if (dependentMatch) {
      // Guard against re-recording a winner double-filling the next round.
      // Without it, correcting a result would push the corrected winner into
      // the free slot while the original winner stayed put, and the next
      // round would show two teams that never both advanced.
      const alreadyThere =
        dependentMatch.teamA === winner || dependentMatch.teamB === winner;

      if (!alreadyThere) {
        if (!dependentMatch.teamA) dependentMatch.teamA = winner;
        else if (!dependentMatch.teamB) dependentMatch.teamB = winner;
      }

      if (dependentMatch.teamA && dependentMatch.teamB) {
        dependentMatch.status = "SCHEDULED";
      }
      propagatedTo = dependentMatch.matchRefId;
    }
  }

  if (applied.length === 0) {
    return { ok: true, outcome: OUTCOME.NO_CHANGE, match, changes: [], propagatedTo };
  }

  return { ok: true, outcome: OUTCOME.OK, match, changes: applied, propagatedTo };
}

/**
 * Applies several match updates as an all-or-nothing batch.
 *
 * Used by the AI bulk actions (e.g. "move every cricket match to 5pm"). The
 * transactional semantics matter: a bulk reschedule that half-applies leaves
 * the schedule in a state no one asked for and that nobody reviewed. If any
 * single update is rejected, the whole batch is reported as failed and the
 * caller must discard the document without saving.
 *
 * Because each step validates against the tournament as mutated so far,
 * moving two matches into the same slot is caught here exactly as it would be
 * if a human had made the two edits one after the other.
 *
 * @param updates [{ matchRefId, changes }]
 * @returns { ok, results, failure? }
 */
function applyMatchUpdates(tournament, updates) {
  const results = [];

  for (const { matchRefId, changes } of updates) {
    const result = applyMatchUpdate(tournament, matchRefId, changes);
    if (!result.ok) {
      return { ok: false, results, failure: { matchRefId, ...result } };
    }
    results.push({ matchRefId, ...result });
  }

  return { ok: true, results };
}

/** Maps an outcome code to the HTTP status the route should return. */
function httpStatusFor(outcome) {
  return HTTP_STATUS_FOR_OUTCOME[outcome] || 500;
}

/** Human-readable one-liner for a change, used in previews and emails. */
function describeChange(matchRefId, match, change) {
  const where = `${match.teamA || "TBD"} vs ${match.teamB || "TBD"}`;
  const from = change.from === null || change.from === undefined ? "unset" : change.from;
  switch (change.field) {
    case "timeSlot":
      return `${matchRefId} (${where}): time slot ${from} -> ${change.to}`;
    case "court":
      return `${matchRefId} (${where}): court ${from} -> ${change.to}`;
    case "winner":
      return `${matchRefId} (${where}): winner recorded as ${change.to}`;
    default:
      return `${matchRefId} (${where}): ${change.field} ${from} -> ${change.to}`;
  }
}

module.exports = {
  OUTCOME,
  applyMatchUpdate,
  applyMatchUpdates,
  findTeamConflict,
  findCourtConflict,
  httpStatusFor,
  describeChange,
};
