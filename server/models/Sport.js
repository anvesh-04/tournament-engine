const mongoose = require("mongoose");

/**
 * A Sport is the ownership boundary for the whole system: every Team,
 * Tournament and sport-admin hangs off exactly one Sport, and the RBAC check
 * in services/auth.js (canAccessSport) is entirely a comparison against this
 * document's id.
 */
const sportSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },

    // The sport-admin who owns this sport. Nullable so a super-admin can
    // create the sport first and assign an admin afterwards, which is the
    // order the setup flow actually happens in.
    adminUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Sport", sportSchema);
