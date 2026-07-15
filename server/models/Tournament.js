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
    teams: [teamSchema],
    matches: [matchSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Tournament", tournamentSchema);
