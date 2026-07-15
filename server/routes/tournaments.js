const express = require("express");
const router = express.Router();
const Tournament = require("../models/Tournament");
const { generateRoundRobinSchedule } = require("../algorithms/graphColoring");
const { generateKnockoutSchedule } = require("../algorithms/topologicalSort");

/**
 * POST /api/tournaments
 * Creates a new tournament with teams, but does NOT generate fixtures yet.
 * Body: { name, format: 'round-robin' | 'knockout', numCourts, teamNames: string[] }
 */
router.post("/", async (req, res) => {
  try {
    const { name, format, numCourts, teamNames } = req.body;

    if (!name || !format || !teamNames || teamNames.length < 2) {
      return res.status(400).json({
        error: "name, format, and at least 2 teamNames are required",
      });
    }

    const tournament = new Tournament({
      name,
      format,
      numCourts: numCourts || 1,
      teams: teamNames.map((n) => ({ name: n })),
      matches: [],
    });

    await tournament.save();
    res.status(201).json(tournament);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/tournaments/:id/generate-fixtures
 * Runs the appropriate algorithm (graph coloring or Kahn's topological sort)
 * based on the tournament's format, and saves the resulting matches.
 */
router.post("/:id/generate-fixtures", async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) return res.status(404).json({ error: "Tournament not found" });

    const teamNames = tournament.teams.map((t) => t.name);
    let matches = [];

    if (tournament.format === "round-robin") {
      const rawSchedule = generateRoundRobinSchedule(teamNames, tournament.numCourts);
      matches = rawSchedule.map((m, idx) => ({
        matchRefId: `RR${idx}`,
        round: 1, // round-robin doesn't use sequential rounds; all "round 1" conceptually
        teamA: m.teamA,
        teamB: m.teamB,
        timeSlot: m.timeSlot,
        court: m.court,
        dependsOn: [],
        status: "SCHEDULED",
      }));
    } else if (tournament.format === "knockout") {
      const rawSchedule = generateKnockoutSchedule(teamNames);
      matches = rawSchedule.map((m) => ({
        matchRefId: m.id,
        round: m.round,
        teamA: m.teamA,
        teamB: m.teamB,
        winner: m.winner,
        dependsOn: m.dependsOn,
        status: m.status,
      }));
    } else {
      return res.status(400).json({ error: "Unknown tournament format" });
    }

    tournament.matches = matches;
    await tournament.save();
    res.json(tournament);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/tournaments/:id
 */
router.get("/:id", async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) return res.status(404).json({ error: "Tournament not found" });
    res.json(tournament);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/tournaments
 */
router.get("/", async (req, res) => {
  try {
    const tournaments = await Tournament.find().select("name format numCourts createdAt");
    res.json(tournaments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/tournaments/:id/matches/:matchRefId
 * Allows editing a single match (time slot, court, or recording a winner).
 * This powers the "real-time schedule modification" dashboard feature.
 * Body: { timeSlot?, court?, winner? }
 */
router.patch("/:id/matches/:matchRefId", async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) return res.status(404).json({ error: "Tournament not found" });

    const match = tournament.matches.find((m) => m.matchRefId === req.params.matchRefId);
    if (!match) return res.status(404).json({ error: "Match not found" });

    const { timeSlot, court, winner } = req.body;

    // Conflict check: if timeSlot/court is changing, make sure no other match
    // on the same court+timeSlot already has one of this match's teams.
    if (timeSlot !== undefined || court !== undefined) {
      const newTimeSlot = timeSlot !== undefined ? timeSlot : match.timeSlot;
      const newCourt = court !== undefined ? court : match.court;

      // Validate the court number is within the tournament's configured range.
      if (newCourt < 0 || newCourt >= tournament.numCourts) {
        return res.status(400).json({
          error: `Invalid court: this tournament only has courts 0 to ${tournament.numCourts - 1}.`,
        });
      }

      const conflict = tournament.matches.find(
        (m) =>
          m.matchRefId !== match.matchRefId &&
          m.timeSlot === newTimeSlot &&
          (m.teamA === match.teamA ||
            m.teamA === match.teamB ||
            m.teamB === match.teamA ||
            m.teamB === match.teamB)
      );

      if (conflict) {
        return res.status(409).json({
          error: `Conflict: a team in this match is already scheduled at time slot ${newTimeSlot} in match ${conflict.matchRefId}`,
        });
      }

      match.timeSlot = newTimeSlot;
      match.court = newCourt;
    }

    if (winner !== undefined) {
      match.winner = winner;
      match.status = "COMPLETED";

      // If knockout, propagate the winner into the dependent next-round match
      const dependentMatch = tournament.matches.find((m) =>
        m.dependsOn.includes(match.matchRefId)
      );
      if (dependentMatch) {
        if (!dependentMatch.teamA) dependentMatch.teamA = winner;
        else if (!dependentMatch.teamB) dependentMatch.teamB = winner;

        // If both slots of the dependent match are now filled, it's ready to schedule
        if (dependentMatch.teamA && dependentMatch.teamB) {
          dependentMatch.status = "SCHEDULED";
        }
      }
    }

    await tournament.save();
    res.json(tournament);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
