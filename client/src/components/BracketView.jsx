import React, { useState } from "react";
import { updateMatch } from "../api.js";

export default function BracketView({ tournament, onUpdate }) {
  const [error, setError] = useState(null);

  const rounds = {};
  tournament.matches.forEach((m) => {
    rounds[m.round] = rounds[m.round] || [];
    rounds[m.round].push(m);
  });
  const roundNumbers = Object.keys(rounds).map(Number).sort((a, b) => a - b);
  const finalRound = Math.max(...roundNumbers);

  const roundLabel = (r) => {
    if (r === finalRound) return "Final";
    if (r === finalRound - 1) return "Semifinal";
    if (r === finalRound - 2) return "Quarterfinal";
    return `Round ${r}`;
  };

  const declareWinner = async (match, winner) => {
    setError(null);
    try {
      const updated = await updateMatch(tournament._id, match.matchRefId, { winner });
      onUpdate(updated);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  };

  return (
    <div>
      {error && <div className="error-banner">{error}</div>}
      <div className="bracket-columns">
        {roundNumbers.map((r) => (
          <div className="bracket-round" key={r}>
            <div className="bracket-round-title">{roundLabel(r)}</div>
            <div className="bracket-round-matches">
              {rounds[r].map((m) => (
                <div className="bracket-match" key={m.matchRefId}>
                  <TeamLine
                    name={m.teamA}
                    isWinner={!!m.winner && m.winner === m.teamA}
                    isBye={m.status === "COMPLETED" && !m.teamB}
                    onClick={() => m.teamA && m.teamB && !m.winner && declareWinner(m, m.teamA)}
                    clickable={!!(m.teamA && m.teamB && !m.winner)}
                  />
                  <TeamLine
                    name={m.teamB}
                    isWinner={!!m.winner && m.winner === m.teamB}
                    isBye={m.status === "COMPLETED" && !m.teamB}
                    onClick={() => m.teamA && m.teamB && !m.winner && declareWinner(m, m.teamB)}
                    clickable={!!(m.teamA && m.teamB && !m.winner)}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 16 }}>
        Click a team name in an active match to declare them the winner and advance them
        automatically to the next round.
      </p>
    </div>
  );
}

function TeamLine({ name, isWinner, isBye, onClick, clickable }) {
  const label = name || (isBye ? "BYE" : "TBD");
  const classes = ["team-line"];
  if (isWinner) classes.push("winner");
  if (!name) classes.push("tbd");

  return (
    <div
      className={classes.join(" ")}
      style={{ cursor: clickable ? "pointer" : "default" }}
      onClick={onClick}
    >
      <span>{label}</span>
      {isWinner && <span>&#10003;</span>}
    </div>
  );
}
