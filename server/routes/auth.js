const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Sport = require("../models/Sport");
const { issueToken } = require("../services/auth");
const { requireAuth } = require("../middleware/auth");

const MIN_PASSWORD_LENGTH = 8;

/**
 * GET /api/auth/bootstrap-status
 * Whether the database has no accounts yet, so the registration page knows
 * whether this sign-up becomes the super-admin.
 *
 * The client cannot infer this from the sport list: a database with users but
 * no sports would make the page offer a bootstrap sign-up that the server then
 * rejects for a missing sportId, with no sport available to choose. Only the
 * server knows, so the server says.
 */
router.get("/bootstrap-status", async (req, res) => {
  try {
    const count = await User.estimatedDocumentCount();
    res.json({ needsFirstAdmin: count === 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/auth/register
 * Body: { name, email, password, sportId? }
 *
 * Self-registration deliberately cannot mint a sport-admin or a super-admin.
 * If it could, the entire RBAC model would be decorative — anyone could POST
 * themselves an admin role. Elevated accounts are created by a super-admin
 * through /api/users (see routes/users.js), and players are normally invited
 * by their sport-admin.
 *
 * The one exception is bootstrapping: the very first account on an empty
 * database becomes the super-admin, because otherwise there is no way to
 * create the first privileged user at all.
 */
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, sportId } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: "name, email and password are required." });
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return res
        .status(400)
        .json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(409).json({ error: "An account with that email already exists." });
    }

    const isFirstEverUser = (await User.estimatedDocumentCount()) === 0;

    let role = "player";
    let sport = null;

    if (isFirstEverUser) {
      role = "super-admin";
    } else {
      // A self-registering player must name the sport they are joining.
      if (!sportId) {
        return res
          .status(400)
          .json({ error: "sportId is required: choose the sport you are registering under." });
      }
      const sportDoc = await Sport.findById(sportId);
      if (!sportDoc) return res.status(400).json({ error: "That sport does not exist." });
      sport = sportDoc._id;
    }

    const user = new User({
      name,
      email,
      passwordHash: await User.hashPassword(password),
      role,
      sport,
    });
    await user.save();

    res.status(201).json({ token: issueToken(user), user });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/auth/login
 * Body: { email, password }
 */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required." });
    }

    const user = await User.findOne({ email: String(email).toLowerCase().trim() });

    // One generic message for both "no such account" and "wrong password".
    // Distinguishing them turns the login form into an account-enumeration
    // oracle for anyone with a list of email addresses.
    const invalid = () => res.status(401).json({ error: "Invalid email or password." });

    if (!user) return invalid();
    if (!(await user.verifyPassword(password))) return invalid();

    res.json({ token: issueToken(user), user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/auth/me
 * Returns the current user. The client uses this on boot to restore a session
 * from a stored token, and to detect a token that has been invalidated by the
 * account being deleted or its role changed.
 */
router.get("/me", requireAuth, async (req, res) => {
  res.json({ user: req.user });
});

/**
 * POST /api/auth/change-password
 * Body: { currentPassword, newPassword }
 * Also clears the mustChangePassword flag set on invited accounts.
 */
router.post("/change-password", requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res
        .status(400)
        .json({ error: "currentPassword and newPassword are required." });
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return res
        .status(400)
        .json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
    }
    if (!(await req.user.verifyPassword(currentPassword))) {
      return res.status(401).json({ error: "Current password is incorrect." });
    }

    req.user.passwordHash = await User.hashPassword(newPassword);
    req.user.mustChangePassword = false;
    await req.user.save();

    // Re-issue so the client is not left holding a token minted before the change.
    res.json({ token: issueToken(req.user), user: req.user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.MIN_PASSWORD_LENGTH = MIN_PASSWORD_LENGTH;
