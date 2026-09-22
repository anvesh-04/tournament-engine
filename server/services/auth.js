/**
 * AUTH CORE
 * ---------
 * Deliberately split from the Express middleware so the decision logic is a
 * set of pure functions that can be unit-tested without spinning up a server
 * or a database. The middleware in ../middleware/auth.js is a thin adapter
 * that maps these results onto req/res.
 */
const jwt = require("jsonwebtoken");

const JWT_EXPIRES_IN = "7d";

/**
 * The signing secret. There is no development fallback on purpose: a default
 * secret that silently works locally is a default secret that silently ships,
 * and every token it ever signed is forgeable by anyone who reads the repo.
 * Failing loudly at startup is the cheaper error.
 */
function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "JWT_SECRET is not set. Generate one (e.g. `openssl rand -hex 32`) and put it in server/.env."
    );
  }
  return secret;
}

/**
 * Builds the JWT payload. Only identity and scope go in — never the password
 * hash, and never anything the client is trusted to send back as authority.
 * Scope is re-read from the database on every request anyway (see
 * requireAuth), so a token issued before a role change cannot outlive it.
 */
function buildTokenPayload(user) {
  return {
    sub: String(user._id),
    role: user.role,
    sport: user.sport ? String(user.sport) : null,
    teamId: user.teamId ? String(user.teamId) : null,
  };
}

function issueToken(user) {
  return jwt.sign(buildTokenPayload(user), getSecret(), {
    expiresIn: JWT_EXPIRES_IN,
  });
}

/** Returns the decoded payload, or null if the token is missing/invalid/expired. */
function verifyToken(token) {
  if (!token) return null;
  try {
    return jwt.verify(token, getSecret());
  } catch {
    return null;
  }
}

/** Pulls a bearer token out of an Authorization header. */
function extractBearerToken(authorizationHeader) {
  if (!authorizationHeader || typeof authorizationHeader !== "string") return null;
  const [scheme, token] = authorizationHeader.split(" ");
  if (!token || scheme.toLowerCase() !== "bearer") return null;
  return token.trim() || null;
}

/**
 * SPORT OWNERSHIP — the core of the multi-sport access rule.
 *
 * @param user     { role, sport } — as loaded from the database, not the token.
 * @param sportId  the sport of the resource being touched.
 * @returns boolean
 *
 * Rules:
 *   super-admin           — every sport.
 *   sport-admin / player  — only their own assigned sport.
 *
 * A null/undefined sportId returns false for anyone but a super-admin. That
 * is the important case: an unscoped resource must NOT fall through to "allow"
 * just because there is nothing to compare against.
 */
function canAccessSport(user, sportId) {
  if (!user || !user.role) return false;
  if (user.role === "super-admin") return true;
  if (!sportId || !user.sport) return false;
  return String(user.sport) === String(sportId);
}

/** Roles permitted to create or modify tournament data. */
const WRITE_ROLES = ["super-admin", "sport-admin"];

function canWrite(user) {
  return !!user && WRITE_ROLES.includes(user.role);
}

module.exports = {
  JWT_EXPIRES_IN,
  buildTokenPayload,
  issueToken,
  verifyToken,
  extractBearerToken,
  canAccessSport,
  canWrite,
  WRITE_ROLES,
};
