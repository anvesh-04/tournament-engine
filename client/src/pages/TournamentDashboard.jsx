import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { getTournament, deleteTournament, errorMessage } from "../api.js";
import { useAuth } from "../auth.jsx";
import RoundRobinView from "../components/RoundRobinView.jsx";
import BracketView from "../components/BracketView.jsx";

export default function TournamentDashboard() {
  const { id } = useParams();
  const [tournament, setTournament] = useState(null);
  const [error, setError] = useState(null);
  const { isAdmin } = useAuth();

  useEffect(() => {
    getTournament(id)
      .then(setTournament)
      .catch((err) => setError(errorMessage(err)));
  }, [id]);

  if (error) return <div className="error-banner">{error}</div>;
  if (!tournament) return <div className="empty-state">Loading tournament...</div>;

  return (
    <div>
      <div className="panel">
        <div className="section-head">
          <div style={{ flex: 1 }}>
            <p className="eyebrow">
              {tournament.format === "round-robin" ? "Round robin" : "Knockout"}
            </p>
            <h1 className="display-lg">{tournament.name}</h1>
            <div className="meta-row">
              <span>{tournament.numCourts} courts</span>
              <span>{tournament.teams.length} teams</span>
              <span>{tournament.matches.length} matches</span>
            </div>
          </div>
          {/* Knockout has no standings concept, so the link only makes sense
              for round-robin. The bracket already shows who is still in. */}
          {tournament.format === "round-robin" && (
            <Link to={`/tournament/${tournament._id}/standings`}>
              <button className="secondary">Standings</button>
            </Link>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">
          {tournament.format === "round-robin" ? "Fixture schedule" : "Bracket"}
        </div>
        {tournament.format === "round-robin" ? (
          <RoundRobinView tournament={tournament} onUpdate={setTournament} />
        ) : (
          <BracketView tournament={tournament} onUpdate={setTournament} />
        )}
      </div>

      {isAdmin && <DangerZone tournament={tournament} />}
    </div>
  );
}

/**
 * Deleting is irreversible, so it is kept out of the main flow and gated
 * behind an explicit second step that states exactly what is about to be
 * destroyed — the same preview-then-confirm shape the AI command console
 * uses for bulk changes.
 */
function DangerZone({ tournament }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const played = tournament.matches.filter((m) => m.winner).length;

  const handleDelete = async () => {
    setError(null);
    setBusy(true);
    try {
      await deleteTournament(tournament._id);
      navigate("/", { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <section className="panel danger-zone">
      <div className="panel-title">Danger zone</div>

      {error && <div className="error-banner">{error}</div>}

      {!confirming ? (
        <div className="section-head" style={{ marginBottom: 0 }}>
          <p className="console-intro" style={{ margin: 0 }}>
            Deleting removes this tournament, its teams and its whole fixture list.
            There is no undo.
          </p>
          <button className="secondary danger" onClick={() => setConfirming(true)}>
            Delete tournament
          </button>
        </div>
      ) : (
        <div>
          <p className="preview-summary">Delete {tournament.name}?</p>
          <ul className="preview-changes">
            <li>{tournament.teams.length} teams</li>
            <li>{tournament.matches.length} matches</li>
            <li>
              {played} recorded result{played === 1 ? "" : "s"}
              {played > 0 ? " — these cannot be recovered" : ""}
            </li>
          </ul>
          <div className="console-actions">
            <button className="danger-solid" onClick={handleDelete} disabled={busy}>
              {busy ? "Deleting..." : "Yes, delete permanently"}
            </button>
            <button
              className="secondary"
              onClick={() => setConfirming(false)}
              disabled={busy}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
