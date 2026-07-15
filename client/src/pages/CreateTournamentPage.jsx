import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createTournament, generateFixtures } from "../api.js";

export default function CreateTournamentPage() {
  const [name, setName] = useState("");
  const [format, setFormat] = useState("round-robin");
  const [numCourts, setNumCourts] = useState(2);
  const [teamInput, setTeamInput] = useState("");
  const [teamNames, setTeamNames] = useState([]);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const addTeam = () => {
    const trimmed = teamInput.trim();
    if (!trimmed) return;
    if (teamNames.includes(trimmed)) {
      setError("That team name is already added.");
      return;
    }
    setTeamNames([...teamNames, trimmed]);
    setTeamInput("");
    setError(null);
  };

  const removeTeam = (t) => setTeamNames(teamNames.filter((x) => x !== t));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) return setError("Tournament name is required.");
    if (teamNames.length < 2) return setError("Add at least 2 teams.");
    if (format === "knockout" && teamNames.length < 2)
      return setError("Knockout format needs at least 2 teams.");

    setSubmitting(true);
    try {
      const tournament = await createTournament({
        name: name.trim(),
        format,
        numCourts: Number(numCourts),
        teamNames,
      });
      // Immediately run the algorithm to generate fixtures
      await generateFixtures(tournament._id);
      navigate(`/tournament/${tournament._id}`);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="panel" onSubmit={handleSubmit}>
      <div className="panel-title">New Tournament</div>
      {error && <div className="error-banner">{error}</div>}

      <label>Tournament name</label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Inter-Hostel Volleyball Cup"
      />

      <label>Format</label>
      <select value={format} onChange={(e) => setFormat(e.target.value)}>
        <option value="round-robin">Round Robin (everyone plays everyone)</option>
        <option value="knockout">Knockout (single elimination)</option>
      </select>

      <label>Number of courts available</label>
      <input
        type="number"
        min="1"
        value={numCourts}
        onChange={(e) => setNumCourts(e.target.value)}
      />

      <label>Teams</label>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={teamInput}
          onChange={(e) => setTeamInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTeam();
            }
          }}
          placeholder="Type a team name and press Enter"
        />
        <button type="button" className="secondary" onClick={addTeam}>
          Add
        </button>
      </div>

      <div className="team-tag-list">
        {teamNames.map((t) => (
          <div className="team-tag" key={t}>
            {t}
            <button type="button" className="remove" onClick={() => removeTeam(t)}>
              &times;
            </button>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 24 }}>
        <button className="primary" type="submit" disabled={submitting}>
          {submitting ? "Generating fixtures..." : "Create & Generate Fixtures"}
        </button>
      </div>
    </form>
  );
}
