import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listTournaments } from "../api.js";

export default function HomePage() {
  const [tournaments, setTournaments] = useState(null);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    listTournaments()
      .then(setTournaments)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="panel">
      <div className="panel-title">Your Tournaments</div>
      {error && <div className="error-banner">Couldn't reach the server: {error}</div>}
      {!tournaments && !error && <div className="empty-state">Loading...</div>}
      {tournaments && tournaments.length === 0 && (
        <div className="empty-state">
          No tournaments yet. Click "+ New Tournament" to build your first fixture list.
        </div>
      )}
      {tournaments &&
        tournaments.map((t) => (
          <div
            key={t._id}
            className="tournament-list-item"
            onClick={() => navigate(`/tournament/${t._id}`)}
          >
            <div>
              <strong>{t.name}</strong>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                {t.format} &middot; {t.numCourts} court{t.numCourts > 1 ? "s" : ""}
              </div>
            </div>
            <span style={{ color: "var(--text-secondary)", fontSize: 18 }}>&rarr;</span>
          </div>
        ))}
    </div>
  );
}
