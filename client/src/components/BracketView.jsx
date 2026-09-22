import React, { useState } from "react";
import { updateMatch, errorMessage } from "../api.js";
import { useAuth } from "../auth.jsx";

export default function BracketView({ tournament, onUpdate }) {
  const [error, setError] = useState(null);
  // Recording a winner is an admin action; a signed-out visitor reading the
  // bracket should not be offered a control that will be refused.
  const { isAdmin } = useAuth();

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
      setError(errorMessage(err));
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
                    clickable={isAdmin && !!(m.teamA && m.teamB && !m.winner)}
                  />
                  <TeamLine
                    name={m.teamB}
                    isWinner={!!m.winner && m.winner === m.teamB}
                    isBye={m.status === "COMPLETED" && !m.teamB}
                    onClick={() => m.teamA && m.teamB && !m.winner && declareWinner(m, m.teamB)}
                    clickable={isAdmin && !!(m.teamA && m.teamB && !m.winner)}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {isAdmin && (
        <p className="field-hint" style={{ marginTop: 20 }}>
          Select a team in an active match to record them as the winner. They advance
          to the next round automatically.
        </p>
      )}
    </div>
  );
}

function TeamLine({ name, isWinner, isBye, onClick, clickable }) {
  const label = name || (isBye ? "BYE" : "TBD");
  const classes = ["team-line"];
  if (isWinner) classes.push("winner");
  if (!name) classes.push("tbd");

  // Declaring a winner is a real action, so when the line is live it behaves
  // like a button: reachable by Tab, activated by Enter or Space, and
  // announced as such. A bare onClick on a div is none of those things.
  const interactive = clickable
    ? {
        role: "button",
        tabIndex: 0,
        onClick,
        onKeyDown: (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick();
          }
        },
        "aria-label": `Record ${label} as the winner`,
        style: { cursor: "pointer" },
      }
    : {};

  return (
    <div className={classes.join(" ")} {...interactive}>
      <span>{label}</span>
      {isWinner && <span aria-hidden="true">&#10003;</span>}
    </div>
  );
}
