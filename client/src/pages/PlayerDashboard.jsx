import React, { useEffect, useState } from "react";
import { getMyMatches, errorMessage } from "../api.js";
import { useAuth } from "../auth.jsx";

const statusClass = {
  PENDING: "status-pending",
  SCHEDULED: "status-scheduled",
  COMPLETED: "status-completed",
};

/**
 * A player's read-only view: their own team's fixtures and, for round-robin,
 * the standings table. There is no edit control anywhere on this page — the
 * server rejects writes from a player regardless, but offering a control that
 * always fails is worse than not offering it.
 */
export default function PlayerDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getMyMatches()
      .then(setData)
      .catch((err) => setError(errorMessage(err)));
  }, []);

  if (error) return <div className="error-banner">{error}</div>;
  if (!data) return <div className="empty-state">Loading your matches...</div>;

  return (
    <div>
      <div className="panel">
        <p className="eyebrow">Your dashboard</p>
        <h1 className="display-lg">{user.name}</h1>
        <div className="meta-row">
          <span>{data.team ? `Team: ${data.team.name}` : "No team yet"}</span>
        </div>
      </div>

      {!data.team && <div className="empty-state">{data.note}</div>}

      {data.team && data.tournaments.length === 0 && (
        <div className="empty-state">
          Your team has no fixtures yet. They will appear here as soon as your sport
          admin generates them.
        </div>
      )}

      {data.tournaments.map((t) => (
        <div className="panel" key={t.tournamentId}>
          <div className="section-head">
            <div>
              <p className="eyebrow">
                {t.format === "round-robin" ? "Round robin" : "Knockout"}
              </p>
              <h2 className="display-md">{t.tournamentName}</h2>
            </div>
          </div>

          <div className="slot-grid">
            {t.matches.map((m) => (
              <div className="match-row player-match-row" key={m.matchRefId}>
                <div className="slot-label">
                  {m.timeSlot === null ? "TBD" : `Slot ${m.timeSlot}`}
                </div>
                <div className="teams">
                  <span className="vs">vs</span> {m.opponent || "TBD"}
                </div>
                <div className="court-label">
                  {m.court === null ? "" : `Court ${m.court}`}
                </div>
                <div className="row-actions">
                  {m.result && (
                    <span
                      className={`status-pill ${
                        m.result === "WON" ? "status-completed" : "status-lost"
                      }`}
                    >
                      {m.result}
                    </span>
                  )}
                  <span className={`status-pill ${statusClass[m.status]}`}>{m.status}</span>
                </div>
              </div>
            ))}
          </div>

          {t.standings && (
            <div style={{ marginTop: 36 }}>
              <div className="panel-title">Standings</div>
              <table className="standings-table">
                <thead>
                  <tr>
                    <th className="col-rank">#</th>
                    <th>Team</th>
                    <th className="col-num">P</th>
                    <th className="col-num">W</th>
                    <th className="col-num">L</th>
                    <th className="col-num col-pts">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {t.standings.map((row, i) => (
                    <tr
                      key={row.team}
                      className={row.team === data.team.name ? "own-team" : ""}
                    >
                      <td className="col-rank">{i + 1}</td>
                      <td className="team-cell">{row.team}</td>
                      <td className="col-num">{row.played}</td>
                      <td className="col-num">{row.wins}</td>
                      <td className="col-num">{row.losses}</td>
                      <td className="col-num col-pts">{row.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
