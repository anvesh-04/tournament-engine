const mongoose = require("mongoose");

/**
 * A Team belongs to exactly one Sport and holds the roster of player Users.
 *
 * Note this is distinct from the embedded `teams[]` on a Tournament, which is
 * just a list of names the scheduling algorithms operate on. Keeping the two
 * separate is deliberate: the algorithms in server/algorithms/ take plain
 * string team ids and must stay that way, and a Tournament's roster is a
 * snapshot at fixture-generation time that should not silently change when
 * someone renames a Team afterwards.
 */
const teamSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    sportId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Sport",
      required: true,
    },
    players: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

// Team names only need to be unique within their own sport — a "Falcons" in
// cricket and a "Falcons" in football are different teams.
teamSchema.index({ sportId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model("Team", teamSchema);
