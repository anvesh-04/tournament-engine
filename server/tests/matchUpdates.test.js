const { test, suite, run, assert } = require("./harness");
const {
  OUTCOME,
  applyMatchUpdate,
  applyMatchUpdates,
  httpStatusFor,
} = require("../services/matchUpdates");

/**
 * Builds a plain-object stand-in for a mongoose Tournament document. The
 * service only ever reads tournament.matches / tournament.numCourts and
 * mutates match fields, so a plain object exercises the identical code path
 * without needing a database connection.
 */
function roundRobin(numCourts = 2) {
  return {
    numCourts,
    format: "round-robin",
    matches: [
      { matchRefId: "RR0", teamA: "Ravens", teamB: "Hawks", timeSlot: 0, court: 0, winner: null, status: "SCHEDULED", dependsOn: [] },
      { matchRefId: "RR1", teamA: "Lions", teamB: "Bears", timeSlot: 0, court: 1, winner: null, status: "SCHEDULED", dependsOn: [] },
      { matchRefId: "RR2", teamA: "Ravens", teamB: "Lions", timeSlot: 1, court: 0, winner: null, status: "SCHEDULED", dependsOn: [] },
      { matchRefId: "RR3", teamA: "Hawks", teamB: "Bears", timeSlot: 1, court: 1, winner: null, status: "SCHEDULED", dependsOn: [] },
    ],
  };
}

/** Two semifinals feeding a final, matching topologicalSort.js output shape. */
function knockout() {
  return {
    numCourts: 1,
    format: "knockout",
    matches: [
      { matchRefId: "M0", round: 1, teamA: "Ravens", teamB: "Hawks", timeSlot: null, court: null, winner: null, status: "SCHEDULED", dependsOn: [] },
      { matchRefId: "M1", round: 1, teamA: "Lions", teamB: "Bears", timeSlot: null, court: null, winner: null, status: "SCHEDULED", dependsOn: [] },
      { matchRefId: "M2", round: 2, teamA: null, teamB: null, timeSlot: null, court: null, winner: null, status: "PENDING", dependsOn: ["M0", "M1"] },
    ],
  };
}

const find = (t, id) => t.matches.find((m) => m.matchRefId === id);

suite("matchUpdates: lookup and no-op");

test("an unknown matchRefId is reported as not found", () => {
  const result = applyMatchUpdate(roundRobin(), "NOPE", { timeSlot: 3 });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.outcome, OUTCOME.MATCH_NOT_FOUND);
  assert.strictEqual(httpStatusFor(result.outcome), 404);
});

test("setting a match to the values it already has reports NO_CHANGE", () => {
  const t = roundRobin();
  const result = applyMatchUpdate(t, "RR0", { timeSlot: 0, court: 0 });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.outcome, OUTCOME.NO_CHANGE);
  assert.deepStrictEqual(result.changes, []);
});

suite("matchUpdates: court range validation");

test("a court beyond the tournament range is rejected", () => {
  const t = roundRobin(2);
  const result = applyMatchUpdate(t, "RR0", { timeSlot: 5, court: 2 });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.outcome, OUTCOME.INVALID_COURT);
  assert.strictEqual(httpStatusFor(result.outcome), 400);
});

test("a negative court is rejected", () => {
  const result = applyMatchUpdate(roundRobin(), "RR0", { timeSlot: 5, court: -1 });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.outcome, OUTCOME.INVALID_COURT);
});

test("a negative or fractional time slot is rejected", () => {
  assert.strictEqual(applyMatchUpdate(roundRobin(), "RR0", { timeSlot: -1 }).ok, false);
  assert.strictEqual(applyMatchUpdate(roundRobin(), "RR0", { timeSlot: 1.5 }).ok, false);
});

test("a rejected update leaves the match untouched", () => {
  const t = roundRobin(2);
  applyMatchUpdate(t, "RR0", { timeSlot: 9, court: 7 });
  assert.strictEqual(find(t, "RR0").timeSlot, 0);
  assert.strictEqual(find(t, "RR0").court, 0);
});

suite("matchUpdates: team double-booking (the 409 path)");

test("moving a match onto a slot where one of its teams already plays is a conflict", () => {
  // RR0 is Ravens vs Hawks at slot 0. RR2 is Ravens vs Lions at slot 1.
  // Moving RR0 to slot 1 would have Ravens playing twice at once.
  const t = roundRobin();
  const result = applyMatchUpdate(t, "RR0", { timeSlot: 1, court: 0 });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.outcome, OUTCOME.CONFLICT);
  assert.strictEqual(result.conflictingMatchRefId, "RR2");
  assert.strictEqual(httpStatusFor(result.outcome), 409);
});

test("the conflict is caught whichever side of the fixture the team is on", () => {
  // RR3 is Hawks vs Bears at slot 1; Bears also play in RR1 at slot 0.
  const t = roundRobin();
  const result = applyMatchUpdate(t, "RR3", { timeSlot: 0, court: 0 });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.outcome, OUTCOME.CONFLICT);
});

test("a move to a genuinely free slot succeeds and reports the diff", () => {
  const t = roundRobin();
  const result = applyMatchUpdate(t, "RR0", { timeSlot: 4, court: 1 });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.outcome, OUTCOME.OK);
  assert.deepStrictEqual(result.changes, [
    { field: "timeSlot", from: 0, to: 4 },
    { field: "court", from: 0, to: 1 },
  ]);
  assert.strictEqual(find(t, "RR0").timeSlot, 4);
});

test("changing court alone within the same slot is allowed when the court is free", () => {
  const t = roundRobin(3);
  const result = applyMatchUpdate(t, "RR0", { court: 2 });
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.changes, [{ field: "court", from: 0, to: 2 }]);
});

suite("matchUpdates: court double-booking");

test("two matches cannot occupy the same court in the same slot", () => {
  // RR1 (Lions vs Bears) already holds slot 0 / court 1. RR0 shares no team
  // with it, so only the court clash can catch this.
  const t = roundRobin();
  const result = applyMatchUpdate(t, "RR0", { timeSlot: 0, court: 1 });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.outcome, OUTCOME.CONFLICT);
  assert.strictEqual(result.conflictingMatchRefId, "RR1");
});

suite("matchUpdates: knockout matches with no timetable slot");

test("unresolved knockout matches are not treated as sharing a team", () => {
  // M2 has teamA === teamB === null. A naive equality check would match it
  // against any other null-team match and raise a phantom conflict.
  const t = knockout();
  t.matches.push({
    matchRefId: "M3", round: 2, teamA: null, teamB: null,
    timeSlot: 0, court: 0, winner: null, status: "PENDING", dependsOn: [],
  });
  const result = applyMatchUpdate(t, "M2", { timeSlot: 0, court: 0 });
  // Court 0 at slot 0 is genuinely taken by M3, so this is a court conflict,
  // NOT a team conflict between two null-team matches.
  assert.strictEqual(result.outcome, OUTCOME.CONFLICT);
  assert.ok(result.error.includes("court"));
});

test("a knockout match can be given a time slot even though it started null", () => {
  const t = knockout();
  const result = applyMatchUpdate(t, "M0", { timeSlot: 0, court: 0 });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(find(t, "M0").timeSlot, 0);
});

suite("matchUpdates: winners and bracket propagation");

test("recording a winner completes the match", () => {
  const t = roundRobin();
  const result = applyMatchUpdate(t, "RR0", { winner: "Ravens" });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(find(t, "RR0").winner, "Ravens");
  assert.strictEqual(find(t, "RR0").status, "COMPLETED");
});

test("a winner who is not in the match is rejected", () => {
  const t = roundRobin();
  const result = applyMatchUpdate(t, "RR0", { winner: "Lions" });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.outcome, OUTCOME.INVALID_WINNER);
  assert.strictEqual(find(t, "RR0").winner, null);
});

test("a knockout winner advances into the dependent match", () => {
  const t = knockout();
  const result = applyMatchUpdate(t, "M0", { winner: "Ravens" });
  assert.strictEqual(result.propagatedTo, "M2");
  assert.strictEqual(find(t, "M2").teamA, "Ravens");
  assert.strictEqual(find(t, "M2").status, "PENDING"); // still waiting on M1
});

test("the dependent match becomes schedulable once both feeders resolve", () => {
  const t = knockout();
  applyMatchUpdate(t, "M0", { winner: "Ravens" });
  applyMatchUpdate(t, "M1", { winner: "Bears" });
  const final = find(t, "M2");
  assert.strictEqual(final.teamA, "Ravens");
  assert.strictEqual(final.teamB, "Bears");
  assert.strictEqual(final.status, "SCHEDULED");
});

test("re-recording the same winner does not double-fill the next round", () => {
  // Regression guard: applying M0's winner twice must not put Ravens into
  // both slots of the final, which would show a team playing itself.
  const t = knockout();
  applyMatchUpdate(t, "M0", { winner: "Ravens" });
  applyMatchUpdate(t, "M0", { winner: "Ravens" });
  const final = find(t, "M2");
  assert.strictEqual(final.teamA, "Ravens");
  assert.strictEqual(final.teamB, null);
});

suite("matchUpdates: all-or-nothing batches");

test("a batch of independent moves all apply", () => {
  const t = roundRobin(2);
  const result = applyMatchUpdates(t, [
    { matchRefId: "RR0", changes: { timeSlot: 10, court: 0 } },
    { matchRefId: "RR1", changes: { timeSlot: 10, court: 1 } },
  ]);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.results.length, 2);
  assert.strictEqual(find(t, "RR0").timeSlot, 10);
  assert.strictEqual(find(t, "RR1").timeSlot, 10);
});

test("a batch that would double-book a court is rejected as a whole", () => {
  // Both moves target slot 10 / court 0. The second must be caught against
  // the state the first one produced, not against the original schedule.
  const t = roundRobin(2);
  const result = applyMatchUpdates(t, [
    { matchRefId: "RR0", changes: { timeSlot: 10, court: 0 } },
    { matchRefId: "RR1", changes: { timeSlot: 10, court: 0 } },
  ]);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.failure.matchRefId, "RR1");
  assert.strictEqual(result.failure.outcome, OUTCOME.CONFLICT);
});

test("a batch that would put one team in two places at once is rejected", () => {
  // Ravens are in RR0 and RR2. Sending both to slot 7 is a team clash.
  const t = roundRobin(2);
  const result = applyMatchUpdates(t, [
    { matchRefId: "RR0", changes: { timeSlot: 7, court: 0 } },
    { matchRefId: "RR2", changes: { timeSlot: 7, court: 1 } },
  ]);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.failure.outcome, OUTCOME.CONFLICT);
});

test("a failed batch names which update failed so a preview can explain it", () => {
  const t = roundRobin(2);
  const result = applyMatchUpdates(t, [
    { matchRefId: "RR0", changes: { timeSlot: 7, court: 0 } },
    { matchRefId: "RR1", changes: { timeSlot: 7, court: 9 } },
  ]);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.failure.matchRefId, "RR1");
  assert.strictEqual(result.failure.outcome, OUTCOME.INVALID_COURT);
  assert.strictEqual(result.results.length, 1); // the one that did apply
});

run();
