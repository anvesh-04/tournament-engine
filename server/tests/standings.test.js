const { test, suite, run, assert } = require("./harness");
const { computeStandings, isScorable } = require("../services/standings");

const team = (...names) => names.map((name) => ({ name }));

/** Small helper so each test reads as the scenario, not as object literals. */
function match(teamA, teamB, { winner = null, status = "SCHEDULED" } = {}) {
  return { matchRefId: `RR${Math.random()}`, teamA, teamB, winner, status };
}

function completed(teamA, teamB, winner) {
  return match(teamA, teamB, { winner, status: "COMPLETED" });
}

suite("standings: scorable-match filter");

test("a COMPLETED match with a real winner is scorable", () => {
  assert.strictEqual(isScorable(completed("A", "B", "A")), true);
});

test("a SCHEDULED match is not scorable even if a winner leaked in", () => {
  assert.strictEqual(isScorable(match("A", "B", { winner: "A" })), false);
});

test("a COMPLETED match with no winner is not scorable", () => {
  assert.strictEqual(isScorable(match("A", "B", { status: "COMPLETED" })), false);
});

test("a BYE match (auto-advanced, teamB null) is never scorable", () => {
  // This is the exact shape topologicalSort.js emits for an auto-advance.
  const bye = { teamA: "A", teamB: null, winner: "A", status: "COMPLETED" };
  assert.strictEqual(isScorable(bye), false);
});

test("a winner who is neither participant is rejected as corrupt", () => {
  assert.strictEqual(isScorable(completed("A", "B", "C")), false);
});

suite("standings: points and aggregation");

test("every registered team appears even with zero matches played", () => {
  const rows = computeStandings({ teams: team("A", "B", "C"), matches: [] });
  assert.strictEqual(rows.length, 3);
  assert.deepStrictEqual(
    rows.map((r) => r.team),
    ["A", "B", "C"]
  );
  assert.ok(rows.every((r) => r.played === 0 && r.points === 0));
});

test("a win is worth 3 points and a loss 0", () => {
  const rows = computeStandings({
    teams: team("A", "B"),
    matches: [completed("A", "B", "A")],
  });
  const a = rows.find((r) => r.team === "A");
  const b = rows.find((r) => r.team === "B");
  assert.deepStrictEqual(a, { team: "A", played: 1, wins: 1, losses: 0, points: 3 });
  assert.deepStrictEqual(b, { team: "B", played: 1, wins: 0, losses: 1, points: 0 });
});

test("results accumulate across several matches", () => {
  const rows = computeStandings({
    teams: team("A", "B", "C"),
    matches: [
      completed("A", "B", "A"),
      completed("A", "C", "A"),
      completed("B", "C", "B"),
    ],
  });
  assert.deepStrictEqual(rows, [
    { team: "A", played: 2, wins: 2, losses: 0, points: 6 },
    { team: "B", played: 2, wins: 1, losses: 1, points: 3 },
    { team: "C", played: 2, wins: 0, losses: 2, points: 0 },
  ]);
});

test("unplayed matches contribute nothing", () => {
  const rows = computeStandings({
    teams: team("A", "B"),
    matches: [match("A", "B"), match("A", "B", { status: "PENDING" })],
  });
  assert.ok(rows.every((r) => r.played === 0));
});

test("a BYE auto-advance does not award points", () => {
  // Regression guard: the knockout builder marks BYE matches COMPLETED with a
  // winner. If standings ever ran over knockout data, that must not score.
  const rows = computeStandings({
    teams: team("A", "B"),
    matches: [{ teamA: "A", teamB: null, winner: "A", status: "COMPLETED" }],
  });
  assert.strictEqual(rows.find((r) => r.team === "A").points, 0);
  assert.strictEqual(rows.find((r) => r.team === "A").played, 0);
});

suite("standings: ordering");

test("sorted by points descending", () => {
  const rows = computeStandings({
    teams: team("Low", "High", "Mid"),
    matches: [
      completed("High", "Low", "High"),
      completed("High", "Mid", "High"),
      completed("Mid", "Low", "Mid"),
    ],
  });
  assert.deepStrictEqual(rows.map((r) => r.team), ["High", "Mid", "Low"]);
});

test("equal points are broken by wins, then by fewer games played", () => {
  // Zeta: 1 win from 1 game. Alpha: 1 win + 1 loss from 2 games.
  // Same points and same wins, so the team that got there in fewer games leads.
  const rows = computeStandings({
    teams: team("Alpha", "Zeta", "Other"),
    matches: [
      completed("Zeta", "Other", "Zeta"),
      completed("Alpha", "Other", "Alpha"),
      completed("Alpha", "Other", "Other"),
    ],
  });
  assert.deepStrictEqual(rows.slice(0, 2).map((r) => r.team), ["Zeta", "Alpha"]);
});

test("fully tied teams are ordered by name for a stable table", () => {
  const rows = computeStandings({ teams: team("Zebra", "Apple", "Mango"), matches: [] });
  assert.deepStrictEqual(rows.map((r) => r.team), ["Apple", "Mango", "Zebra"]);
});

test("a result for a team no longer in teams[] is still counted", () => {
  const rows = computeStandings({
    teams: team("A"),
    matches: [completed("A", "Removed", "Removed")],
  });
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows.find((r) => r.team === "Removed").points, 3);
});

test("missing teams/matches arrays do not throw", () => {
  assert.deepStrictEqual(computeStandings({}), []);
});

run();
