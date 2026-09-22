const express = require("express");
const router = express.Router();
const Team = require("../models/Team");
const Sport = require("../models/Sport");
const User = require("../models/User");
const { requireAuth, requireRole, requireSportAccess } = require("../middleware/auth");
const { notifyInvite } = require("../services/notifications");
const { generateTemporaryPassword } = require("../services/invites");

/**
 * Teams and their player rosters, scoped to a sport.
 * A sport-admin manages teams under their own sport only; the sport-ownership
 * middleware enforces that on every route here.
 */

/** The sport a team belongs to, for the ownership middleware. */
async function sportOfTeam(req) {
  const team = await Team.findById(req.params.id).select("sportId");
  return team ? team.sportId : null;
}

/**
 * The sport a WRITE is targeting. A sport-admin is pinned to their own sport
 * regardless of what the request body says, so a crafted sportId cannot place
 * a team under another sport.
 */
function targetSport(req) {
  if (req.user.role === "sport-admin") return req.user.sport;
  return req.body.sportId || null;
}

/**
 * GET /api/teams
 * Lists teams in the caller's sport (all teams, for a super-admin).
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const filter = {};
    if (req.user.role !== "super-admin") {
      if (!req.user.sport) return res.json([]);
      filter.sportId = req.user.sport;
    } else if (req.query.sportId) {
      filter.sportId = req.query.sportId;
    }

    const teams = await Team.find(filter).populate("players", "name email");
    res.json(teams);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/teams
 * Body: { name, sportId? }  (sportId honoured for super-admin only)
 */
router.post(
  "/",
  requireAuth,
  requireRole("super-admin", "sport-admin"),
  requireSportAccess(targetSport),
  async (req, res) => {
    try {
      const { name } = req.body;
      if (!name) return res.status(400).json({ error: "name is required." });

      // A super-admin is not pinned to a sport, so they must name one. Without
      // this the missing value falls through to the lookup below and reports
      // "that sport does not exist" about a sport that was never given.
      const sportId = req.resolvedSportId;
      if (!sportId) {
        return res
          .status(400)
          .json({ error: "sportId is required: choose which sport this team belongs to." });
      }
      if (!(await Sport.findById(sportId))) {
        return res.status(400).json({ error: "That sport does not exist." });
      }

      const team = new Team({ name, sportId, players: [] });
      await team.save();
      res.status(201).json(team);
    } catch (err) {
      // The { sportId, name } unique index surfaces as a duplicate-key error.
      if (err.code === 11000) {
        return res
          .status(409)
          .json({ error: "A team with that name already exists in this sport." });
      }
      res.status(400).json({ error: err.message });
    }
  }
);

/**
 * POST /api/teams/:id/players
 * Body: { name, email }
 *
 * Invites a player: creates their account with a generated temporary password,
 * emails it to them, and adds them to the roster. The password is returned in
 * the response ONLY when the email could not be delivered — otherwise an
 * admin reading the API response would be holding a working credential for
 * someone else's account with no reason to.
 */
router.post(
  "/:id/players",
  requireAuth,
  requireRole("super-admin", "sport-admin"),
  requireSportAccess(sportOfTeam),
  async (req, res) => {
    try {
      const { name, email } = req.body;
      if (!name || !email) {
        return res.status(400).json({ error: "name and email are required." });
      }

      const team = await Team.findById(req.params.id);
      if (!team) return res.status(404).json({ error: "Team not found." });

      const normalisedEmail = String(email).toLowerCase().trim();
      let user = await User.findOne({ email: normalisedEmail });
      let temporaryPassword = null;

      if (user) {
        // An existing account from another sport is not silently reassigned —
        // that would pull them off their current team without anyone noticing.
        if (user.sport && String(user.sport) !== String(team.sportId)) {
          return res.status(409).json({
            error:
              "That email already belongs to an account in a different sport. Ask a super-admin to move it.",
          });
        }
        user.teamId = team._id;
        user.sport = team.sportId;
        await user.save();
      } else {
        temporaryPassword = generateTemporaryPassword();
        user = new User({
          name,
          email: normalisedEmail,
          passwordHash: await User.hashPassword(temporaryPassword),
          role: "player",
          sport: team.sportId,
          teamId: team._id,
          mustChangePassword: true,
        });
        await user.save();
      }

      if (!team.players.some((p) => String(p) === String(user._id))) {
        team.players.push(user._id);
        await team.save();
      }

      let invite = { sent: false, reason: "existing account, no invite needed" };
      if (temporaryPassword) {
        const sport = await Sport.findById(team.sportId).select("name");
        invite = await notifyInvite({
          user,
          sportName: sport ? sport.name : "your sport",
          temporaryPassword,
          loginUrl: process.env.CLIENT_URL ? `${process.env.CLIENT_URL}/login` : null,
        });
      }

      res.status(201).json({
        user,
        team,
        inviteEmailSent: invite.sent,
        // Only surfaced when delivery failed, so the admin can pass the
        // password on by another route rather than being locked out.
        temporaryPassword: temporaryPassword && !invite.sent ? temporaryPassword : undefined,
        inviteFailureReason: invite.sent ? undefined : invite.reason,
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

/**
 * DELETE /api/teams/:id/players/:userId
 * Removes a player from a roster. The account is left in place — deleting a
 * user would orphan their notifications and any history referring to them.
 */
router.delete(
  "/:id/players/:userId",
  requireAuth,
  requireRole("super-admin", "sport-admin"),
  requireSportAccess(sportOfTeam),
  async (req, res) => {
    try {
      const team = await Team.findById(req.params.id);
      if (!team) return res.status(404).json({ error: "Team not found." });

      team.players = team.players.filter((p) => String(p) !== String(req.params.userId));
      await team.save();
      await User.findByIdAndUpdate(req.params.userId, { teamId: null });

      res.json(team);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

module.exports = router;
