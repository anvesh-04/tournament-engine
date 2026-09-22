// A secret must exist before services/auth is required, because getSecret()
// deliberately refuses to fall back to a default.
process.env.JWT_SECRET = "test-secret-do-not-use-in-production";

const { test, suite, run, assert } = require("./harness");
const {
  issueToken,
  verifyToken,
  extractBearerToken,
  buildTokenPayload,
  canAccessSport,
  canWrite,
} = require("../services/auth");
const { requireRole, requireSportAccess } = require("../middleware/auth");

const OID_A = "64b7f1a2c3d4e5f6a7b8c9d0";
const OID_B = "64b7f1a2c3d4e5f6a7b8c9d1";
const OID_TEAM = "64b7f1a2c3d4e5f6a7b8c9d2";

const superAdmin = { _id: "u1", role: "super-admin", sport: null, teamId: null };
const cricketAdmin = { _id: "u2", role: "sport-admin", sport: OID_A, teamId: null };
const footballAdmin = { _id: "u3", role: "sport-admin", sport: OID_B, teamId: null };
const cricketPlayer = { _id: "u4", role: "player", sport: OID_A, teamId: OID_TEAM };

/** Minimal express res double: records the status and body it was given. */
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

/** Runs a middleware and reports whether next() was called. */
async function runMiddleware(mw, req) {
  const res = mockRes();
  let nextCalled = false;
  await mw(req, res, () => {
    nextCalled = true;
  });
  return { res, nextCalled };
}

suite("auth: token payload");

test("the payload carries identity and scope, never the password hash", () => {
  const payload = buildTokenPayload({
    _id: "abc",
    role: "sport-admin",
    sport: OID_A,
    teamId: null,
    passwordHash: "$2a$10$somethingsecret",
  });
  assert.deepStrictEqual(payload, {
    sub: "abc",
    role: "sport-admin",
    sport: OID_A,
    teamId: null,
  });
  assert.strictEqual(JSON.stringify(payload).includes("$2a$"), false);
});

test("a signed token round-trips through verification", () => {
  const decoded = verifyToken(issueToken(cricketAdmin));
  assert.strictEqual(decoded.sub, "u2");
  assert.strictEqual(decoded.role, "sport-admin");
  assert.strictEqual(decoded.sport, OID_A);
});

test("a tampered token is rejected", () => {
  const token = issueToken(cricketAdmin);
  // Flip a character in the signature segment.
  const parts = token.split(".");
  parts[2] = parts[2].slice(0, -1) + (parts[2].slice(-1) === "a" ? "b" : "a");
  assert.strictEqual(verifyToken(parts.join(".")), null);
});

test("a token signed with a different secret is rejected", () => {
  const jwt = require("jsonwebtoken");
  const foreign = jwt.sign({ sub: "u2", role: "super-admin" }, "some-other-secret");
  assert.strictEqual(verifyToken(foreign), null);
});

test("garbage and missing tokens verify to null rather than throwing", () => {
  assert.strictEqual(verifyToken(null), null);
  assert.strictEqual(verifyToken(""), null);
  assert.strictEqual(verifyToken("not.a.jwt"), null);
});

suite("auth: bearer header parsing");

test("a well-formed Bearer header yields the token", () => {
  assert.strictEqual(extractBearerToken("Bearer abc123"), "abc123");
  assert.strictEqual(extractBearerToken("bearer abc123"), "abc123");
});

test("malformed or missing headers yield null", () => {
  assert.strictEqual(extractBearerToken(undefined), null);
  assert.strictEqual(extractBearerToken(""), null);
  assert.strictEqual(extractBearerToken("abc123"), null);
  assert.strictEqual(extractBearerToken("Basic abc123"), null);
  assert.strictEqual(extractBearerToken("Bearer "), null);
});

suite("auth: sport ownership");

test("a super-admin can access any sport", () => {
  assert.strictEqual(canAccessSport(superAdmin, OID_A), true);
  assert.strictEqual(canAccessSport(superAdmin, OID_B), true);
});

test("a sport-admin can access their own sport", () => {
  assert.strictEqual(canAccessSport(cricketAdmin, OID_A), true);
});

test("a sport-admin CANNOT access another sport", () => {
  assert.strictEqual(canAccessSport(cricketAdmin, OID_B), false);
  assert.strictEqual(canAccessSport(footballAdmin, OID_A), false);
});

test("ObjectId and string forms of the same sport compare equal", () => {
  // Mongoose hands back ObjectId instances, not strings; a === comparison
  // would silently deny access to a legitimately-scoped admin.
  const asObjectId = { toString: () => OID_A };
  assert.strictEqual(canAccessSport({ role: "sport-admin", sport: asObjectId }, OID_A), true);
  assert.strictEqual(canAccessSport(cricketAdmin, asObjectId), true);
});

test("an unscoped resource does NOT fall through to allow", () => {
  assert.strictEqual(canAccessSport(cricketAdmin, null), false);
  assert.strictEqual(canAccessSport(cricketAdmin, undefined), false);
  assert.strictEqual(canAccessSport(cricketPlayer, null), false);
});

test("a sport-admin with no assigned sport is denied everything", () => {
  const orphan = { role: "sport-admin", sport: null };
  assert.strictEqual(canAccessSport(orphan, OID_A), false);
  assert.strictEqual(canAccessSport(orphan, null), false);
});

test("a missing or role-less user is denied", () => {
  assert.strictEqual(canAccessSport(null, OID_A), false);
  assert.strictEqual(canAccessSport({}, OID_A), false);
});

suite("auth: write permission");

test("admins may write, players may not", () => {
  assert.strictEqual(canWrite(superAdmin), true);
  assert.strictEqual(canWrite(cricketAdmin), true);
  assert.strictEqual(canWrite(cricketPlayer), false);
  assert.strictEqual(canWrite(null), false);
});

suite("auth: requireRole middleware");

test("an allowed role passes through", async () => {
  const { nextCalled } = await runMiddleware(requireRole("super-admin", "sport-admin"), {
    user: cricketAdmin,
  });
  assert.strictEqual(nextCalled, true);
});

test("a disallowed role gets 403", async () => {
  const { res, nextCalled } = await runMiddleware(requireRole("super-admin"), {
    user: cricketAdmin,
  });
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 403);
});

test("no authenticated user gets 401, not 403", async () => {
  const { res, nextCalled } = await runMiddleware(requireRole("super-admin"), {});
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 401);
});

suite("auth: requireSportAccess middleware");

test("a sport-admin passes for a resource in their own sport", async () => {
  const mw = requireSportAccess(() => OID_A);
  const { nextCalled } = await runMiddleware(mw, { user: cricketAdmin });
  assert.strictEqual(nextCalled, true);
});

test("a sport-admin is blocked from another sport with 403", async () => {
  const mw = requireSportAccess(() => OID_B);
  const { res, nextCalled } = await runMiddleware(mw, { user: cricketAdmin });
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 403);
});

test("a super-admin passes for any sport", async () => {
  for (const sportId of [OID_A, OID_B]) {
    const mw = requireSportAccess(() => sportId);
    const { nextCalled } = await runMiddleware(mw, { user: superAdmin });
    assert.strictEqual(nextCalled, true);
  }
});

test("an unresolvable sport is 404 for a sport-admin, not an accidental allow", async () => {
  const mw = requireSportAccess(() => null);
  const { res, nextCalled } = await runMiddleware(mw, { user: cricketAdmin });
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 404);
});

test("the resolver may be async", async () => {
  const mw = requireSportAccess(async () => OID_A);
  const { nextCalled } = await runMiddleware(mw, { user: cricketAdmin });
  assert.strictEqual(nextCalled, true);
});

test("a throwing resolver surfaces as 500, never as a silent pass", async () => {
  const mw = requireSportAccess(() => {
    throw new Error("database unreachable");
  });
  const { res, nextCalled } = await runMiddleware(mw, { user: cricketAdmin });
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 500);
});

test("the resolved sport is exposed to the handler", async () => {
  const mw = requireSportAccess(() => OID_A);
  const req = { user: cricketAdmin };
  await runMiddleware(mw, req);
  assert.strictEqual(req.resolvedSportId, OID_A);
});

run();
