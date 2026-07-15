import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getTournament } from "../api.js";
import RoundRobinView from "../components/RoundRobinView.jsx";
import BracketView from "../components/BracketView.jsx";

export default function TournamentDashboard() {
  const { id } = useParams();
  const [tournament, setTournament] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getTournament(id).then(setTournament).catch((err) => setError(err.message));
  }, [id]);

  if (error) return <div className="error-banner">{error}</div>;
  if (!tournament) return <div className="empty-state">Loading tournament...</div>;

  return (
    <div>
      <div className="panel">
        <div className="panel-title">{tournament.name}</div>
        <div style={{ display: "flex", gap: 24, fontSize: 13, color: "var(--text-secondary)" }}>
          <span>Format: {tournament.format}</span>
          <span>Courts: {tournament.numCourts}</span>
          <span>Teams: {tournament.teams.length}</span>
          <span>Matches: {tournament.matches.length}</span>
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">
          {tournament.format === "round-robin" ? "Fixture Schedule" : "Bracket"}
        </div>
        {tournament.format === "round-robin" ? (
          <RoundRobinView tournament={tournament} onUpdate={setTournament} />
        ) : (
          <BracketView tournament={tournament} onUpdate={setTournament} />
        )}
      </div>
    </div>
  );
}
