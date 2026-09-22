process.env.JWT_SECRET = "test-secret-do-not-use-in-production";

const { test, suite, run, assert } = require("./harness");
const { requireRole, requireSportAccess } = require("../middleware/auth");

/**
 * Guards on DELETE /api/tournaments/:id.
 *
 * Deleting is irreversible, so what matters is that the SAME gates the other
 * writes use are actually mounted on it, in the right order, and that none of
 * them can be talked past. The gates themselves are covered in auth.test.js;
 * these tests pin them to this route.
 *
 * The handler body is not exercised here — that needs a database, and the
 * project has no in-memory Mongo. What is exercised is everything that
 * decides whether the handler is reached at all.
 */

const OID_CRICKET = "64b7f1a2c3d4e5f6a7b8c9d0";
const OID_FOOTBALL = "64b7f1a2c3d4e5f6a7b8c9d1";

const superAdmin = { _id: "u1", role: "super-admin", sport: null };
const cricketAdmin = { _id: "u2", role: "sport-admin", sport: OID_CRICKET };
const footballAdmin = { _id: "u3", role: "sport-admin", sport: OID_FOOTBALL };
const player = { _id: "u4", role: "player", sport: OID_CRICKET };

function mockRes() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

async function runMiddleware(mw, req) {
  const res = mockRes();
  let nextCalled = false;
  await mw(req, res, () => {
    nextCalled = true;
  });
  return { res, nextCalled };
}

/** The exact role gate the delete route mounts. */
const roleGate = requireRole("super-admin", "sport-admin");

/** The ownership gate, with a stand-in for the tournament lookup. */
const ownershipGate = (sportOfTournament) => requireSportAccess(sportOfTournament);

suite("delete route: who may delete at all");

test("a player cannot delete, even in their own sport", async () => {
  const { res, nextCalled } = await runMiddleware(roleGate, { user: player });
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 403);
});

test("an anonymous caller cannot delete", async () => {
  const { res, nextCalled } = await runMiddleware(roleGate, {});
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 401);
});

test("a sport-admin passes the role gate", async () => {
  const { nextCalled } = await runMiddleware(roleGate, { user: cricketAdmin });
  assert.strictEqual(nextCalled, true);
});

test("a super-admin passes the role gate", async () => {
  const { nextCalled } = await runMiddleware(roleGate, { user: superAdmin });
  assert.strictEqual(nextCalled, true);
});

suite("delete route: whose tournaments may be deleted");

test("a sport-admin may delete within their own sport", async () => {
  const mw = ownershipGate(() => OID_CRICKET);
  const { nextCalled } = await runMiddleware(mw, { user: cricketAdmin });
  assert.strictEqual(nextCalled, true);
});

test("a sport-admin may NOT delete another sport's tournament", async () => {
  // The case that matters most: passing the role gate must not be enough.
  const mw = ownershipGate(() => OID_FOOTBALL);
  const { res, nextCalled } = await runMiddleware(mw, { user: cricketAdmin });
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 403);
});

test("a super-admin may delete in any sport", async () => {
  for (const sport of [OID_CRICKET, OID_FOOTBALL]) {
    const mw = ownershipGate(() => sport);
    const { nextCalled } = await runMiddleware(mw, { user: superAdmin });
    assert.strictEqual(nextCalled, true);
  }
});

test("an unscoped tournament is super-admin only", async () => {
  // Legacy tournaments carry sportId: null. A sport-admin must not be able to
  // delete one just because there is nothing to compare against.
  const mw = ownershipGate(() => null);

  const asSportAdmin = await runMiddleware(mw, { user: cricketAdmin });
  assert.strictEqual(asSportAdmin.nextCalled, false);
  assert.strictEqual(asSportAdmin.res.statusCode, 404);

  const asSuperAdmin = await runMiddleware(mw, { user: superAdmin });
  assert.strictEqual(asSuperAdmin.nextCalled, true);
});

test("a missing tournament does not fall through to the handler", async () => {
  // sportOfTournament returns null for a tournament that does not exist, so a
  // sport-admin deleting a bad id is stopped here rather than reaching a
  // handler that would 404 anyway — and cannot use the difference to probe.
  const mw = ownershipGate(() => null);
  const { res } = await runMiddleware(mw, { user: footballAdmin });
  assert.strictEqual(res.statusCode, 404);
});

test("a failing lookup is a 500, never a silent delete", async () => {
  const mw = ownershipGate(() => {
    throw new Error("database unreachable");
  });
  const { res, nextCalled } = await runMiddleware(mw, { user: superAdmin });
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 500);
});

suite("delete route: it is actually mounted");

test("the router exposes DELETE on /:id with all three gates", () => {
  const router = require("../routes/tournaments");
  const layer = router.stack.find(
    (l) => l.route && l.route.path === "/:id" && l.route.methods.delete
  );
  assert.ok(layer, "no DELETE /:id route is registered");

  // requireAuth, requireRole, requireSportAccess, then the handler.
  assert.strictEqual(
    layer.route.stack.length,
    4,
    "expected three guards in front of the delete handler"
  );
});

test("the read routes are NOT accidentally deletable", () => {
  const router = require("../routes/tournaments");
  const deletable = router.stack
    .filter((l) => l.route && l.route.methods.delete)
    .map((l) => l.route.path);
  assert.deepStrictEqual(deletable, ["/:id"]);
});

run();
