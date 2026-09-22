import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { getStandings } from "../api.js";

/**
 * Round-robin leaderboard. Knockout tournaments have no standings — the
 * backend rejects them with a 400 and an explanation, which we surface as-is
 * rather than showing an empty table that would read as "no results yet".
 */
export default function StandingsPage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getStandings(id)
      .then(setData)
      .catch((err) => setError(err.response?.data?.error || err.message));
  }, [id]);

  if (error) {
    return (
      <div>
        <div className="error-banner">{error}</div>
        <Link to={`/tournament/${id}`}>
          <button className="secondary">&larr; Back to tournament</button>
        </Link>
      </div>
    );
  }

  if (!data) return <div className="empty-state">Loading standings...</div>;

  const { standings, tournamentName, pointsPerWin, pointsPerLoss } = data;
  const anyPlayed = standings.some((r) => r.played > 0);

  return (
    <div>
      <div className="panel">
        <div className="section-head">
          <div>
            <p className="eyebrow">Standings</p>
            <h1 className="display-lg">{tournamentName}</h1>
          </div>
          <Link to={`/tournament/${id}`}>
            <button className="secondary">&larr; Schedule</button>
          </Link>
        </div>

        <div className="points-key">
Win {pointsPerWin} &middot; Loss {pointsPerLoss} &middot; completed matches only
        </div>

        {!anyPlayed && (
          <div className="empty-state" style={{ marginBottom: 16 }}>
            No completed matches yet. Record a winner on the schedule and the table
            will fill in.
          </div>
        )}

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
            {standings.map((row, i) => (
              <tr key={row.team} className={i === 0 && anyPlayed ? "leader" : ""}>
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
    </div>
  );
}
