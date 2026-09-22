process.env.JWT_SECRET = "test-secret-do-not-use-in-production";

const { test, suite, run, assert } = require("./harness");
const {
  validateAction,
  planAction,
  executePlan,
  summarisePlan,
  signPreview,
  verifyPreview,
  ACTION_NAMES,
} = require("../services/adminCommands");

const T1 = "64b7f1a2c3d4e5f6a7b8c9d0";
const T2 = "64b7f1a2c3d4e5f6a7b8c9d1";
const SPORT = "64b7f1a2c3d4e5f6a7b8c9df";

function tournament(_id, name, numCourts, matches) {
  return { _id, name, numCourts, sportId: SPORT, matches };
}

function m(matchRefId, teamA, teamB, timeSlot, court) {
  return {
    matchRefId, teamA, teamB, timeSlot, court,
    winner: null, status: "SCHEDULED", dependsOn: [],
  };
}

/** Two tournaments in one sport, both with matches in slot 0. */
function fixtures() {
  return [
    tournament(T1, "Cricket Cup", 2, [
      m("RR0", "Ravens", "Hawks", 0, 0),
      m("RR1", "Lions", "Bears", 0, 1),
      m("RR2", "Ravens", "Lions", 1, 0),
    ]),
    tournament(T2, "Cricket Plate", 2, [
      m("RR0", "Wolves", "Foxes", 0, 0),
      m("RR1", "Otters", "Stoats", 2, 1),
    ]),
  ];
}

const find = (t, id) => t.matches.find((x) => x.matchRefId === id);

suite("adminCommands: the action set is fixed");

test("only the three declared actions exist", () => {
  assert.deepStrictEqual(ACTION_NAMES.sort(), [
    "reschedule_bulk_by_sport",
    "reschedule_match",
    "swap_court",
  ]);
});

suite("adminCommands: validating untrusted model output");

test("a well-formed action is accepted and normalised", () => {
  const result = validateAction({
    action: "reschedule_match",
    args: { tournamentId: T1, matchRefId: "RR0", timeSlot: 5 },
  });
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.action.args, {
    tournamentId: T1,
    matchRefId: "RR0",
    timeSlot: 5,
  });
});

test("an invented action name is rejected", () => {
  // The whole point of the fixed schema: the model cannot grant itself a
  // capability by naming one.
  const result = validateAction({ action: "delete_tournament", args: { id: T1 } });
  assert.strictEqual(result.ok, false);
  assert.ok(result.error.includes("Unknown action"));
});

test("non-object output is rejected", () => {
  assert.strictEqual(validateAction(null).ok, false);
  assert.strictEqual(validateAction("reschedule_match").ok, false);
  assert.strictEqual(validateAction([{ action: "reschedule_match" }]).ok, false);
});

test("a missing args object is rejected", () => {
  assert.strictEqual(validateAction({ action: "reschedule_match" }).ok, false);
});

test("an unknown argument is rejected rather than silently dropped", () => {
  // A dropped field would mean the command did something other than it said.
  const result = validateAction({
    action: "reschedule_match",
    args: { tournamentId: T1, matchRefId: "RR0", timeSlot: 5, deleteEverything: true },
  });
  assert.strictEqual(result.ok, false);
  assert.ok(result.error.includes("deleteEverything"));
});

test("a missing required argument is rejected", () => {
  const result = validateAction({
    action: "reschedule_match",
    args: { matchRefId: "RR0", timeSlot: 5 },
  });
  assert.strictEqual(result.ok, false);
  assert.ok(result.error.includes("tournamentId"));
});

test("a malformed id is rejected", () => {
  const result = validateAction({
    action: "reschedule_match",
    args: { tournamentId: "'; DROP TABLE", matchRefId: "RR0", timeSlot: 5 },
  });
  assert.strictEqual(result.ok, false);
});

test("a non-integer or negative time slot is rejected", () => {
  for (const timeSlot of [-1, 2.5, "5", null, true]) {
    const result = validateAction({
      action: "reschedule_match",
      args: { tournamentId: T1, matchRefId: "RR0", timeSlot },
    });
    assert.strictEqual(result.ok, false, `expected ${JSON.stringify(timeSlot)} to be rejected`);
  }
});

test("a reschedule that specifies neither slot nor court is rejected", () => {
  const result = validateAction({
    action: "reschedule_match",
    args: { tournamentId: T1, matchRefId: "RR0" },
  });
  assert.strictEqual(result.ok, false);
  assert.ok(result.error.includes("at least one of"));
});

test("court alone is a valid reschedule", () => {
  const result = validateAction({
    action: "reschedule_match",
    args: { tournamentId: T1, matchRefId: "RR0", court: 1 },
  });
  assert.strictEqual(result.ok, true);
});

suite("adminCommands: planning and the shared validation path");

test("a single reschedule plans one update", () => {
  const ts = fixtures();
  const { action } = validateAction({
    action: "reschedule_match",
    args: { tournamentId: T1, matchRefId: "RR0", timeSlot: 5, court: 0 },
  });
  const planned = planAction(action, ts);
  assert.strictEqual(planned.ok, true);
  assert.strictEqual(planned.plan.length, 1);

  const executed = executePlan(planned.plan);
  assert.strictEqual(executed.ok, true);
  assert.strictEqual(find(ts[0], "RR0").timeSlot, 5);
});

test("an AI reschedule that double-books a team is REJECTED by the shared checker", () => {
  // This is the guarantee the whole design rests on: the AI path cannot
  // produce a change the human PATCH endpoint would have refused.
  // Ravens play RR0 (slot 0) and RR2 (slot 1); moving RR0 to slot 1 clashes.
  const ts = fixtures();
  const { action } = validateAction({
    action: "reschedule_match",
    args: { tournamentId: T1, matchRefId: "RR0", timeSlot: 1, court: 1 },
  });
  const planned = planAction(action, ts);
  const executed = executePlan(planned.plan);

  assert.strictEqual(executed.ok, false);
  assert.strictEqual(executed.outcome, "CONFLICT");
  assert.ok(executed.error.includes("Cricket Cup"));
});

test("an out-of-range court from the AI is rejected", () => {
  const ts = fixtures();
  const { action } = validateAction({
    action: "reschedule_match",
    args: { tournamentId: T1, matchRefId: "RR0", timeSlot: 6, court: 5 },
  });
  const executed = executePlan(planAction(action, ts).plan);
  assert.strictEqual(executed.ok, false);
  assert.strictEqual(executed.outcome, "INVALID_COURT");
});

test("a plan referencing an out-of-scope tournament fails to plan", () => {
  const { action } = validateAction({
    action: "reschedule_match",
    args: { tournamentId: T2, matchRefId: "RR0", timeSlot: 5 },
  });
  // Only T1 was passed in scope, standing in for a sport-admin who may not
  // see T2 at all.
  const planned = planAction(action, [fixtures()[0]]);
  assert.strictEqual(planned.ok, false);
});

suite("adminCommands: bulk reschedule by sport");

test("a bulk move spans every tournament in the sport", () => {
  const ts = fixtures();
  const { action } = validateAction({
    action: "reschedule_bulk_by_sport",
    args: { sportId: SPORT, fromTimeSlot: 0, toTimeSlot: 5 },
  });
  const planned = planAction(action, ts);
  assert.strictEqual(planned.ok, true);
  assert.strictEqual(planned.plan.length, 2); // both tournaments have slot-0 matches

  const executed = executePlan(planned.plan);
  assert.strictEqual(executed.ok, true);
  assert.strictEqual(executed.changes.length, 3); // RR0, RR1 in T1; RR0 in T2
  assert.strictEqual(find(ts[0], "RR0").timeSlot, 5);
  assert.strictEqual(find(ts[1], "RR0").timeSlot, 5);
  assert.strictEqual(find(ts[0], "RR2").timeSlot, 1); // untouched
});

test("the preview summary states the real scope of the change", () => {
  const ts = fixtures();
  const { action } = validateAction({
    action: "reschedule_bulk_by_sport",
    args: { sportId: SPORT, fromTimeSlot: 0, toTimeSlot: 5 },
  });
  const executed = executePlan(planAction(action, ts).plan);
  const summary = summarisePlan(action, executed.changes);
  assert.ok(summary.includes("3 matches"), summary);
  assert.ok(summary.includes("time slot 5"), summary);
});

test("a bulk move onto an occupied slot is rejected, not half-applied", () => {
  // T1 slot 1 holds RR2 (Ravens vs Lions). Moving slot 0 -> 1 would put
  // Ravens in two matches at once.
  const ts = fixtures();
  const { action } = validateAction({
    action: "reschedule_bulk_by_sport",
    args: { sportId: SPORT, fromTimeSlot: 0, toTimeSlot: 1 },
  });
  const executed = executePlan(planAction(action, ts).plan);
  assert.strictEqual(executed.ok, false);
  assert.strictEqual(executed.outcome, "CONFLICT");
});

test("a bulk move affecting nothing is reported rather than silently succeeding", () => {
  const { action } = validateAction({
    action: "reschedule_bulk_by_sport",
    args: { sportId: SPORT, fromTimeSlot: 9, toTimeSlot: 10 },
  });
  const planned = planAction(action, fixtures());
  assert.strictEqual(planned.ok, false);
  assert.ok(planned.error.includes("No matches"));
});

test("a bulk move to the same slot is rejected", () => {
  const { action } = validateAction({
    action: "reschedule_bulk_by_sport",
    args: { sportId: SPORT, fromTimeSlot: 0, toTimeSlot: 0 },
  });
  assert.strictEqual(planAction(action, fixtures()).ok, false);
});

suite("adminCommands: swapping courts");

test("two matches in the same slot swap courts", () => {
  const ts = [
    tournament(T1, "Cricket Cup", 3, [
      m("RR0", "Ravens", "Hawks", 0, 0),
      m("RR1", "Lions", "Bears", 0, 1),
    ]),
  ];
  const { action } = validateAction({
    action: "swap_court",
    args: { tournamentId: T1, matchRefIdA: "RR0", matchRefIdB: "RR1" },
  });
  const executed = executePlan(planAction(action, ts).plan);

  assert.strictEqual(executed.ok, true);
  assert.strictEqual(find(ts[0], "RR0").court, 1);
  assert.strictEqual(find(ts[0], "RR1").court, 0);
});

test("a swap with no free court to route through is refused with an explanation", () => {
  // Only 2 courts, both occupied in slot 0, so there is nowhere to park.
  const ts = [
    tournament(T1, "Cricket Cup", 2, [
      m("RR0", "Ravens", "Hawks", 0, 0),
      m("RR1", "Lions", "Bears", 0, 1),
    ]),
  ];
  const { action } = validateAction({
    action: "swap_court",
    args: { tournamentId: T1, matchRefIdA: "RR0", matchRefIdB: "RR1" },
  });
  const planned = planAction(action, ts);
  assert.strictEqual(planned.ok, false);
  assert.ok(planned.error.includes("No spare court"), planned.error);
});

test("swapping a match with itself is refused", () => {
  const { action } = validateAction({
    action: "swap_court",
    args: { tournamentId: T1, matchRefIdA: "RR0", matchRefIdB: "RR0" },
  });
  assert.strictEqual(planAction(action, fixtures()).ok, false);
});

test("an unknown match reference is refused", () => {
  const { action } = validateAction({
    action: "swap_court",
    args: { tournamentId: T1, matchRefIdA: "RR0", matchRefIdB: "NOPE" },
  });
  const planned = planAction(action, fixtures());
  assert.strictEqual(planned.ok, false);
  assert.ok(planned.error.includes("NOPE"));
});

suite("adminCommands: preview signing");

const sampleAction = {
  action: "reschedule_match",
  args: { tournamentId: T1, matchRefId: "RR0", timeSlot: 5 },
};

test("a preview signed for a user verifies for that user", () => {
  const { issuedAt, signature } = signPreview(sampleAction, "user-1");
  assert.strictEqual(verifyPreview(sampleAction, "user-1", issuedAt, signature).ok, true);
});

test("a confirm with altered arguments is refused", () => {
  // The admin approved slot 5; this confirm tries to apply slot 99.
  const { issuedAt, signature } = signPreview(sampleAction, "user-1");
  const tampered = {
    action: "reschedule_match",
    args: { tournamentId: T1, matchRefId: "RR0", timeSlot: 99 },
  };
  const result = verifyPreview(tampered, "user-1", issuedAt, signature);
  assert.strictEqual(result.ok, false);
  assert.ok(result.error.includes("does not match"));
});

test("another user cannot replay someone else's approved preview", () => {
  const { issuedAt, signature } = signPreview(sampleAction, "user-1");
  assert.strictEqual(verifyPreview(sampleAction, "user-2", issuedAt, signature).ok, false);
});

test("argument key order does not change the signature", () => {
  const { issuedAt, signature } = signPreview(sampleAction, "user-1");
  const reordered = {
    action: "reschedule_match",
    args: { timeSlot: 5, matchRefId: "RR0", tournamentId: T1 },
  };
  assert.strictEqual(verifyPreview(reordered, "user-1", issuedAt, signature).ok, true);
});

test("an expired preview is refused", () => {
  const longAgo = Date.now() - 11 * 60 * 1000;
  const { signature } = signPreview(sampleAction, "user-1", longAgo);
  const result = verifyPreview(sampleAction, "user-1", longAgo, signature);
  assert.strictEqual(result.ok, false);
  assert.ok(result.error.includes("expired"));
});

test("a confirm with no signature at all is refused", () => {
  const result = verifyPreview(sampleAction, "user-1", Date.now(), null);
  assert.strictEqual(result.ok, false);
  assert.ok(result.error.includes("not previewed"));
});

test("a garbage signature is refused without throwing", () => {
  const result = verifyPreview(sampleAction, "user-1", Date.now(), "zzzz");
  assert.strictEqual(result.ok, false);
});

run();
