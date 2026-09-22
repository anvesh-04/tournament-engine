const express = require("express");
const router = express.Router();
const Sport = require("../models/Sport");
const User = require("../models/User");
const { requireAuth, requireRole, attachUserIfPresent } = require("../middleware/auth");
const { generateTemporaryPassword } = require("../services/invites");
const { notifyInvite } = require("../services/notifications");

/**
 * Sports are the top-level ownership boundary, so only a super-admin may
 * create them or decide who runs them. A sport-admin who could create sports
 * could simply create a new one and grant themselves everything.
 */

/**
 * Moves a user out of the sport-admin role without leaving an invalid record.
 *
 * The User model requires a sport-admin to have a sport, so clearing `sport`
 * alone would persist a document that fails its own validation on the next
 * save — and `findByIdAndUpdate` does not run validators, so nothing would
 * catch it. More importantly, the access check compares `user.sport` to the
 * resource's sport and never consults `Sport.adminUserId`; leaving the role
 * in place while keeping the sport would hand a replaced admin their old
 * powers back.
 *
 * So a replaced admin becomes a player of the sport they used to run: a valid
 * record, and no admin rights.
 */
async function demoteFormerAdmin(userId) {
  const user = await User.findById(userId);
  if (!user || user.role !== "sport-admin") return;
  user.role = "player";
  await user.save();
}

/** Promotes a user to sport-admin of a sport, keeping the record valid. */
async function promoteToSportAdmin(user, sportId) {
  user.role = "sport-admin";
  user.sport = sportId;
  // A sport-admin is not on a roster. Leaving a stale teamId would make them
  // show up in their own "my team" views as though they still played.
  user.teamId = null;
  await user.save();
  return user;
}

/**
 * GET /api/sports
 * Open to anonymous callers because the registration page needs to offer the
 * list of sports to join. Only names, ids and the admin's name are exposed.
 */
router.get("/", attachUserIfPresent, async (req, res) => {
  try {
    const sports = await Sport.find()
      .select("name adminUserId createdAt")
      .populate("adminUserId", "name email");
    res.json(sports);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/sports
 * Body: { name, adminUserId? }
 */
router.post("/", requireAuth, requireRole("super-admin"), async (req, res) => {
  try {
    const { name, adminUserId } = req.body;
    if (!name) return res.status(400).json({ error: "name is required." });

    if (await Sport.findOne({ name: name.trim() })) {
      return res.status(409).json({ error: "A sport with that name already exists." });
    }

    const sport = new Sport({ name, adminUserId: null });
    await sport.save();

    if (adminUserId) {
      const user = await User.findById(adminUserId);
      if (!user) return res.status(400).json({ error: "That user does not exist." });
      await promoteToSportAdmin(user, sport._id);
      sport.adminUserId = user._id;
      await sport.save();
    }

    res.status(201).json(await sport.populate("adminUserId", "name email"));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * PATCH /api/sports/:id
 * Body: { name?, adminUserId? }
 *
 * Passing adminUserId: null removes the current admin without naming a
 * replacement, which leaves the sport running under super-admins only.
 */
router.patch("/:id", requireAuth, requireRole("super-admin"), async (req, res) => {
  try {
    const sport = await Sport.findById(req.params.id);
    if (!sport) return res.status(404).json({ error: "Sport not found." });

    const { name, adminUserId } = req.body;
    if (name) sport.name = name;

    if (adminUserId !== undefined) {
      const replacingSomeoneElse =
        sport.adminUserId && String(sport.adminUserId) !== String(adminUserId);

      if (replacingSomeoneElse) await demoteFormerAdmin(sport.adminUserId);

      if (adminUserId) {
        const user = await User.findById(adminUserId);
        if (!user) return res.status(400).json({ error: "That user does not exist." });
        if (user.sport && String(user.sport) !== String(sport._id)) {
          return res.status(409).json({
            error:
              "That account already belongs to a different sport. Move it out of that sport first.",
          });
        }
        await promoteToSportAdmin(user, sport._id);
        sport.adminUserId = user._id;
      } else {
        sport.adminUserId = null;
      }
    }

    await sport.save();
    res.json(await sport.populate("adminUserId", "name email"));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/sports/:id/admin
 * Body: { name, email }
 *
 * Invites someone who has no account yet and makes them this sport's admin,
 * mirroring the player invite on the teams route. The temporary password is
 * returned ONLY when the email could not be delivered — otherwise the
 * super-admin would be holding a working credential for someone else's
 * account with no reason to.
 */
router.post("/:id/admin", requireAuth, requireRole("super-admin"), async (req, res) => {
  try {
    const { name, email } = req.body;
    if (!name || !email) {
      return res.status(400).json({ error: "name and email are required." });
    }

    const sport = await Sport.findById(req.params.id);
    if (!sport) return res.status(404).json({ error: "Sport not found." });

    const normalisedEmail = String(email).toLowerCase().trim();
    if (await User.findOne({ email: normalisedEmail })) {
      return res.status(409).json({
        error:
          "An account with that email already exists. Assign it from the existing accounts instead.",
      });
    }

    const temporaryPassword = generateTemporaryPassword();
    const user = new User({
      name,
      email: normalisedEmail,
      passwordHash: await User.hashPassword(temporaryPassword),
      role: "sport-admin",
      sport: sport._id,
      mustChangePassword: true,
    });
    await user.save();

    if (sport.adminUserId) await demoteFormerAdmin(sport.adminUserId);
    sport.adminUserId = user._id;
    await sport.save();

    const invite = await notifyInvite({
      user,
      sportName: sport.name,
      temporaryPassword,
      loginUrl: process.env.CLIENT_URL ? `${process.env.CLIENT_URL}/login` : null,
    });

    res.status(201).json({
      user,
      sport: await sport.populate("adminUserId", "name email"),
      inviteEmailSent: invite.sent,
      temporaryPassword: invite.sent ? undefined : temporaryPassword,
      inviteFailureReason: invite.sent ? undefined : invite.reason,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
