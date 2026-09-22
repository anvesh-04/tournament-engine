const mongoose = require("mongoose");

const teamSchema = new mongoose.Schema({
  name: { type: String, required: true },
});

const matchSchema = new mongoose.Schema({
  matchRefId: { type: String, required: true }, // e.g. "M0" from the algorithm output
  round: { type: Number, required: true },
  teamA: { type: String, default: null },
  teamB: { type: String, default: null },
  winner: { type: String, default: null },
  dependsOn: [{ type: String }], // used only for knockout matches
  timeSlot: { type: Number, default: null },
  court: { type: Number, default: null },
  status: {
    type: String,
    enum: ["PENDING", "SCHEDULED", "COMPLETED"],
    default: "SCHEDULED",
  },
});

const tournamentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    format: { type: String, enum: ["round-robin", "knockout"], required: true },
    numCourts: { type: Number, required: true, default: 1 },

    // Ownership. sportId is what the RBAC sport-ownership check compares
    // against, so a tournament without one is only reachable by a
    // super-admin (see middleware/auth.js requireSportAccess). Both are
    // nullable so tournaments created before multi-sport existed still load
    // instead of failing validation on every save.
    sportId: { type: mongoose.Schema.Types.ObjectId, ref: "Sport", default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    teams: [teamSchema],
    matches: [matchSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Tournament", tournamentSchema);
