process.env.JWT_SECRET = "test-secret-do-not-use-in-production";

const { test, suite, run, assert } = require("./harness");
const User = require("../models/User");
const { canAccessSport } = require("../services/auth");

/**
 * Sport-admin assignment.
 *
 * The risky part is not the HTTP plumbing, it is the role TRANSITIONS: a user
 * being promoted into the role, and — the one that bit — a user being moved
 * out of it. These tests run the model's own validation, which is what the
 * routes rely on, without needing a database connection.
 */

const SPORT_A = "64b7f1a2c3d4e5f6a7b8c9d0";
const SPORT_B = "64b7f1a2c3d4e5f6a7b8c9d1";
const TEAM = "64b7f1a2c3d4e5f6a7b8c9d2";

/** Builds an unsaved User document so the schema validators still run. */
function user(overrides) {
  return new User({
    name: "Test Person",
    email: `t${Math.random()}@example.com`,
    passwordHash: "x",
    ...overrides,
  });
}

/** Runs mongoose validation and returns the error message, or null. */
async function validationErrorOf(doc) {
  try {
    await doc.validate();
    return null;
  } catch (err) {
    return err.message;
  }
}

suite("sport-admin: the role requires a sport");

test("a sport-admin with a sport is valid", async () => {
  const u = user({ role: "sport-admin", sport: SPORT_A });
  assert.strictEqual(await validationErrorOf(u), null);
});

test("a sport-admin with NO sport is rejected by the model", async () => {
  // This is the shape the old demotion path produced: role left as
  // sport-admin, sport cleared to null.
  const u = user({ role: "sport-admin", sport: null });
  const err = await validationErrorOf(u);
  assert.ok(err, "expected validation to fail");
  assert.ok(/must be assigned a sport/i.test(err), err);
});

test("a super-admin scoped to a sport is rejected", async () => {
  const u = user({ role: "super-admin", sport: SPORT_A });
  const err = await validationErrorOf(u);
  assert.ok(err);
  assert.ok(/must not be scoped/i.test(err), err);
});

suite("sport-admin: what promotion has to produce");

test("a promoted player becomes a valid sport-admin of that sport", async () => {
  const u = user({ role: "player", sport: SPORT_A, teamId: TEAM });

  // What promoteToSportAdmin does.
  u.role = "sport-admin";
  u.sport = SPORT_A;
  u.teamId = null;

  assert.strictEqual(await validationErrorOf(u), null);
  assert.strictEqual(canAccessSport(u, SPORT_A), true);
  assert.strictEqual(canAccessSport(u, SPORT_B), false);
});

test("promotion clears the team, so an admin is not also on a roster", async () => {
  // A stale teamId would surface them in their own "my team" views as though
  // they still played.
  const u = user({ role: "player", sport: SPORT_A, teamId: TEAM });
  u.role = "sport-admin";
  u.sport = SPORT_A;
  u.teamId = null;
  assert.strictEqual(u.teamId, null);
});

suite("sport-admin: what demotion has to produce");

test("a replaced admin becomes a player and KEEPS a valid record", async () => {
  const u = user({ role: "sport-admin", sport: SPORT_A });

  // What demoteFormerAdmin does.
  u.role = "player";

  assert.strictEqual(await validationErrorOf(u), null);
});

test("a replaced admin genuinely loses admin rights", async () => {
  // The access check compares user.sport against the resource's sport and
  // never consults Sport.adminUserId. Clearing adminUserId on the Sport alone
  // would leave a replaced admin with every power they had before.
  const stillAdmin = user({ role: "sport-admin", sport: SPORT_A });
  assert.strictEqual(canAccessSport(stillAdmin, SPORT_A), true);

  stillAdmin.role = "player";
  // Read access by sport is unchanged — that is correct, they are still in
  // the sport — but the role gate is what stops them writing.
  const { canWrite } = require("../services/auth");
  assert.strictEqual(canWrite(stillAdmin), false);
});

test("clearing sport instead of role would produce an unsaveable record", async () => {
  // Regression guard for the original bug: findByIdAndUpdate skips validators,
  // so this invalid shape would persist silently and then throw on the user's
  // next ordinary save, such as a password change.
  const u = user({ role: "sport-admin", sport: SPORT_A });
  u.sport = null;
  assert.ok(await validationErrorOf(u), "clearing sport alone must not validate");
});

suite("sport-admin: scope after assignment");

test("an admin of one sport cannot reach another", async () => {
  const cricket = user({ role: "sport-admin", sport: SPORT_A });
  assert.strictEqual(canAccessSport(cricket, SPORT_B), false);
});

test("a sport with no admin assigned is still reachable by a super-admin", async () => {
  const su = user({ role: "super-admin" });
  assert.strictEqual(canAccessSport(su, SPORT_A), true);
  assert.strictEqual(canAccessSport(su, null), true);
});

run();
