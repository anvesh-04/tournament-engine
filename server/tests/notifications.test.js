const { test, suite, run, assert } = require("./harness");
const {
  isNotifiableChange,
  buildRescheduleMessage,
} = require("../services/notifications");

const match = {
  matchRefId: "RR3",
  teamA: "Ravens",
  teamB: "Hawks",
};

suite("notifications: which changes are worth telling players about");

test("a time slot change is notifiable", () => {
  assert.strictEqual(isNotifiableChange([{ field: "timeSlot", from: 2, to: 5 }]), true);
});

test("a court change is notifiable", () => {
  assert.strictEqual(isNotifiableChange([{ field: "court", from: 0, to: 1 }]), true);
});

test("a recorded winner alone is NOT notifiable", () => {
  // A result does not change where or when anyone has to be. Emailing on
  // every result would bury the mails that actually matter.
  assert.strictEqual(
    isNotifiableChange([{ field: "winner", from: null, to: "Ravens" }]),
    false
  );
});

test("an empty or missing change list is not notifiable", () => {
  assert.strictEqual(isNotifiableChange([]), false);
  assert.strictEqual(isNotifiableChange(undefined), false);
});

test("a mixed batch containing a timetable change is notifiable", () => {
  assert.strictEqual(
    isNotifiableChange([
      { field: "winner", from: null, to: "Ravens" },
      { field: "court", from: 0, to: 2 },
    ]),
    true
  );
});

suite("notifications: message wording");

test("a time slot move names both the old and the new slot", () => {
  const msg = buildRescheduleMessage({
    tournamentName: "Spring Cup",
    match,
    changes: [{ field: "timeSlot", from: 2, to: 5 }],
  });
  assert.ok(msg.includes("Spring Cup"));
  assert.ok(msg.includes("Ravens vs Hawks"));
  assert.ok(msg.includes("time slot 2 to 5"));
  assert.ok(msg.includes("RR3"));
});

test("a combined slot and court move mentions both", () => {
  const msg = buildRescheduleMessage({
    tournamentName: "Spring Cup",
    match,
    changes: [
      { field: "timeSlot", from: 2, to: 5 },
      { field: "court", from: 0, to: 1 },
    ],
  });
  assert.ok(msg.includes("time slot 2 to 5"));
  assert.ok(msg.includes("court 0 to 1"));
});

test("a previously unassigned slot reads as 'unassigned', not 'null'", () => {
  const msg = buildRescheduleMessage({
    tournamentName: "Spring Cup",
    match,
    changes: [{ field: "timeSlot", from: null, to: 3 }],
  });
  assert.ok(msg.includes("unassigned to 3"), msg);
  assert.ok(!msg.includes("null"), msg);
});

test("slot 0 is reported as 0, not swallowed as a falsy value", () => {
  // Guards against a truthiness check turning a real slot 0 into "unassigned".
  const msg = buildRescheduleMessage({
    tournamentName: "Spring Cup",
    match,
    changes: [{ field: "court", from: 0, to: 2 }],
  });
  assert.ok(msg.includes("court 0 to 2"), msg);
});

test("a winner-only change produces no message at all", () => {
  const msg = buildRescheduleMessage({
    tournamentName: "Spring Cup",
    match,
    changes: [{ field: "winner", from: null, to: "Ravens" }],
  });
  assert.strictEqual(msg, null);
});

test("an unresolved knockout fixture still produces a usable message", () => {
  const msg = buildRescheduleMessage({
    tournamentName: "Knockout Cup",
    match: { matchRefId: "M4", teamA: null, teamB: null },
    changes: [{ field: "timeSlot", from: null, to: 6 }],
  });
  assert.ok(msg.includes("TBD vs TBD"), msg);
});

run();
