const express = require("express");
const router = express.Router();
const User = require("../models/User");
const { requireAuth, requireRole } = require("../middleware/auth");

/**
 * Account listing, for the super-admin screens that need to pick a person —
 * currently "who should run this sport".
 *
 * Super-admin only. A directory of every account and its role is exactly the
 * sort of thing that should not be readable by a player, and the password
 * hash is stripped by the model's toJSON regardless of what a route selects.
 */

/**
 * GET /api/users
 * Optional filters: ?role=player|sport-admin|super-admin  ?sportId=<id>
 */
router.get("/", requireAuth, requireRole("super-admin"), async (req, res) => {
  try {
    const filter = {};
    if (req.query.role) filter.role = req.query.role;
    if (req.query.sportId) filter.sport = req.query.sportId;

    const users = await User.find(filter)
      .sort({ name: 1 })
      .populate("sport", "name")
      .populate("teamId", "name");

    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
