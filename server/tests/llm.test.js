const { test, suite, run, assert } = require("./harness");
const { buildTools, buildScheduleSnapshot, UNSUPPORTED_TOOL, SYSTEM_PROMPT } = require("../services/llm");
const { ACTION_SCHEMA, ACTION_NAMES } = require("../services/adminCommands");

/**
 * These cover the request we SEND to the model — the schema it is constrained
 * by and the context it is given. They make no network calls; what comes back
 * is re-validated by adminCommands.validateAction, which has its own suite.
 */

suite("llm: the tool definitions mirror the action schema");

test("every action is exposed as a tool, plus the unsupported escape hatch", () => {
  const names = buildTools().map((t) => t.name);
  for (const action of ACTION_NAMES) {
    assert.ok(names.includes(action), `missing tool for ${action}`);
  }
  assert.ok(names.includes(UNSUPPORTED_TOOL));
  assert.strictEqual(names.length, ACTION_NAMES.length + 1);
});

test("every tool is strict and closed to extra properties", () => {
  // Without these the model could return arguments the schema never declared,
  // and validateAction would reject the whole command at the next step.
  for (const tool of buildTools()) {
    assert.strictEqual(tool.strict, true, `${tool.name} is not strict`);
    assert.strictEqual(
      tool.input_schema.additionalProperties,
      false,
      `${tool.name} allows extra properties`
    );
    assert.strictEqual(tool.input_schema.type, "object");
  }
});

test("required arguments match the action schema exactly", () => {
  for (const tool of buildTools()) {
    if (tool.name === UNSUPPORTED_TOOL) continue;
    const spec = ACTION_SCHEMA[tool.name];
    const expected = Object.entries(spec.fields)
      .filter(([, rule]) => rule.required)
      .map(([field]) => field)
      .sort();
    assert.deepStrictEqual(tool.input_schema.required.sort(), expected, tool.name);
  }
});

test("time slots are declared as non-negative integers", () => {
  const reschedule = buildTools().find((t) => t.name === "reschedule_match");
  assert.deepStrictEqual(reschedule.input_schema.properties.timeSlot, {
    type: "integer",
    minimum: 0,
  });
});

test("there is no tool for anything destructive", () => {
  // The fixed set is the capability boundary: if it is not here, the model
  // has no way to express it.
  const names = buildTools().map((t) => t.name).join(" ");
  for (const forbidden of ["delete", "remove", "drop", "create_user", "grant"]) {
    assert.ok(!names.includes(forbidden), `unexpected capability: ${forbidden}`);
  }
});

suite("llm: the schedule snapshot sent as context");

const tournaments = [
  {
    _id: "64b7f1a2c3d4e5f6a7b8c9d0",
    name: "Cricket Cup",
    format: "round-robin",
    numCourts: 2,
    sportId: "64b7f1a2c3d4e5f6a7b8c9df",
    matches: [
      { matchRefId: "RR0", teamA: "Ravens", teamB: "Hawks", timeSlot: 0, court: 0, status: "SCHEDULED" },
      { matchRefId: "RR1", teamA: null, teamB: null, timeSlot: null, court: null, status: "PENDING" },
    ],
  },
];

test("the snapshot carries the ids and placements the model needs", () => {
  const snapshot = buildScheduleSnapshot(tournaments);
  assert.ok(snapshot.includes("64b7f1a2c3d4e5f6a7b8c9d0"));
  assert.ok(snapshot.includes("RR0"));
  assert.ok(snapshot.includes("Ravens vs Hawks"));
  assert.ok(snapshot.includes("timeSlot=0"));
});

test("slot 0 is shown as 0, not as 'unassigned'", () => {
  // A truthiness bug here would tell the model there is no slot 0, and every
  // command about the first slot would be misinterpreted.
  const snapshot = buildScheduleSnapshot(tournaments);
  assert.ok(snapshot.includes("timeSlot=0 court=0"), snapshot);
});

test("unplaced matches are labelled rather than shown as null", () => {
  const snapshot = buildScheduleSnapshot(tournaments);
  assert.ok(snapshot.includes("TBD vs TBD"));
  assert.ok(snapshot.includes("timeSlot=unassigned"));
  assert.ok(!snapshot.includes("null"), snapshot);
});

test("an empty scope is stated plainly", () => {
  assert.ok(buildScheduleSnapshot([]).includes("No tournaments"));
});

test("a tournament with no fixtures yet is described, not omitted", () => {
  const snapshot = buildScheduleSnapshot([
    { _id: "x", name: "Empty Cup", format: "knockout", numCourts: 1, sportId: null, matches: [] },
  ]);
  assert.ok(snapshot.includes("Empty Cup"));
  assert.ok(snapshot.includes("no matches generated yet"));
});

test("no player names or emails are sent to the model", () => {
  // The snapshot is built from match fields only; nothing in it should be
  // able to carry personal data even if the tournament document grew one.
  const snapshot = buildScheduleSnapshot(tournaments);
  assert.ok(!snapshot.includes("@"));
});

suite("llm: system prompt guardrails");

test("the prompt forbids inventing ids and requires one tool call", () => {
  assert.ok(/never invent/i.test(SYSTEM_PROMPT));
  assert.ok(/exactly one tool/i.test(SYSTEM_PROMPT));
});

test("the prompt tells the model it is proposing, not applying", () => {
  assert.ok(/confirmation/i.test(SYSTEM_PROMPT));
  assert.ok(/only proposing/i.test(SYSTEM_PROMPT));
});

run();
