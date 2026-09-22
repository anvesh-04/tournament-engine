const express = require("express");
const router = express.Router();
const Team = require("../models/Team");
const Tournament = require("../models/Tournament");
const Notification = require("../models/Notification");
const { computeStandings } = require("../services/standings");
const { requireAuth } = require("../middleware/auth");

/**
 * The player's own view. Everything here is read-only and scoped to the
 * caller: a player can see their own team's fixtures and their own
 * notifications, and nothing else. There is no route in this file that writes
 * to a tournament.
 */

/**
 * GET /api/me/matches
 * Every match involving the caller's team, across the tournaments in their
 * sport, plus the standings for any round-robin tournament they are in.
 */
router.get("/matches", requireAuth, async (req, res) => {
  try {
    const team = req.user.teamId ? await Team.findById(req.user.teamId) : null;
    if (!team) {
      return res.json({
        team: null,
        tournaments: [],
        note: "You are not on a team yet. Your sport admin can add you to one.",
      });
    }

    // Only tournaments in the player's own sport are considered, so a team
    // name that also exists in another sport can never leak fixtures here.
    const tournaments = await Tournament.find({ sportId: team.sportId });

    const mine = tournaments
      .map((tournament) => {
        const matches = tournament.matches.filter(
          (m) => m.teamA === team.name || m.teamB === team.name
        );
        if (matches.length === 0) return null;

        return {
          tournamentId: tournament._id,
          tournamentName: tournament.name,
          format: tournament.format,
          matches: matches
            .map((m) => ({
              matchRefId: m.matchRefId,
              round: m.round,
              teamA: m.teamA,
              teamB: m.teamB,
              opponent: m.teamA === team.name ? m.teamB : m.teamA,
              timeSlot: m.timeSlot,
              court: m.court,
              status: m.status,
              winner: m.winner,
              // Stated explicitly so the UI never has to re-derive the result.
              result: !m.winner ? null : m.winner === team.name ? "WON" : "LOST",
            }))
            .sort((a, b) => (a.timeSlot ?? Infinity) - (b.timeSlot ?? Infinity)),
          // Standings only exist for round-robin; knockout progress is the bracket.
          standings:
            tournament.format === "round-robin" ? computeStandings(tournament) : null,
        };
      })
      .filter(Boolean);

    res.json({
      team: { _id: team._id, name: team.name, sportId: team.sportId },
      tournaments: mine,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/me/notifications
 * The caller's notifications, newest first, with the unread count that drives
 * the in-app indicator.
 */
router.get("/notifications", requireAuth, async (req, res) => {
  try {
    const [notifications, unreadCount] = await Promise.all([
      Notification.find({ userId: req.user._id })
        .sort({ createdAt: -1 })
        .limit(Number(req.query.limit) || 50),
      Notification.countDocuments({ userId: req.user._id, read: false }),
    ]);

    res.json({ notifications, unreadCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/me/notifications/read
 * Body: { ids?: string[] } — marks the given notifications read, or all of
 * them when no ids are supplied.
 *
 * The userId filter is part of the query, not checked afterwards, so a caller
 * cannot mark someone else's notifications read by guessing ids.
 */
router.post("/notifications/read", requireAuth, async (req, res) => {
  try {
    const filter = { userId: req.user._id, read: false };
    if (Array.isArray(req.body.ids) && req.body.ids.length > 0) {
      filter._id = { $in: req.body.ids };
    }

    const { modifiedCount } = await Notification.updateMany(filter, { read: true });
    const unreadCount = await Notification.countDocuments({
      userId: req.user._id,
      read: false,
    });

    res.json({ markedRead: modifiedCount, unreadCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
