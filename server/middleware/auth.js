/**
 * Express adapters over the pure decision functions in ../services/auth.js.
 * Everything here maps a decision onto req/res; the decisions themselves live
 * in the service so they can be tested directly.
 */
const User = require("../models/User");
const { verifyToken, extractBearerToken, canAccessSport } = require("../services/auth");

/**
 * Verifies the JWT and loads the CURRENT user record onto req.user.
 *
 * The database read on every request is intentional. A JWT is a snapshot of
 * the user at signing time; if we trusted the token's role/sport claims, then
 * demoting a sport-admin or reassigning their sport would not take effect
 * until their token expired (up to 7 days later). Reading the record makes
 * revocation immediate, and also means a deleted user's token stops working.
 */
async function requireAuth(req, res, next) {
  try {
    const payload = verifyToken(extractBearerToken(req.headers.authorization));
    if (!payload) {
      return res.status(401).json({ error: "Authentication required." });
    }

    const user = await User.findById(payload.sub);
    if (!user) {
      return res.status(401).json({ error: "Account no longer exists." });
    }

    req.user = user;
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * requireRole("super-admin") or requireRole("super-admin", "sport-admin").
 * Must be mounted after requireAuth.
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required." });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `This action requires one of: ${allowedRoles.join(", ")}.`,
      });
    }
    next();
  };
}

/**
 * Sport-ownership gate. `resolveSportId(req)` returns (or resolves to) the
 * sport that the targeted resource belongs to; a sport-admin passes only when
 * that matches their own sport, a super-admin always passes.
 *
 * Returns 404 rather than 403 when the resource has no resolvable sport, so a
 * caller can't probe for the existence of other sports' tournaments by
 * distinguishing "forbidden" from "not found".
 */
function requireSportAccess(resolveSportId) {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Authentication required." });
      }

      const sportId = await resolveSportId(req);
      if (sportId === undefined || sportId === null) {
        if (req.user.role === "super-admin") return next();
        return res.status(404).json({ error: "Not found." });
      }

      if (!canAccessSport(req.user, sportId)) {
        return res.status(403).json({
          error: "You can only manage resources under your own sport.",
        });
      }

      req.resolvedSportId = sportId;
      next();
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };
}

/**
 * Attaches req.user when a valid token is present, but never rejects.
 * Used on read endpoints that must keep working for the existing unauthenticated
 * client while richer, role-aware behaviour is layered on for signed-in users.
 */
async function attachUserIfPresent(req, res, next) {
  try {
    const payload = verifyToken(extractBearerToken(req.headers.authorization));
    if (payload) {
      req.user = await User.findById(payload.sub);
    }
  } catch {
    // A bad token on an optional-auth route is simply an anonymous request.
  }
  next();
}

module.exports = { requireAuth, requireRole, requireSportAccess, attachUserIfPresent };
