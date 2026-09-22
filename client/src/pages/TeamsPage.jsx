import React, { useEffect, useState } from "react";
import {
  listTeams,
  createTeam,
  invitePlayer,
  removePlayer,
  listSports,
  errorMessage,
} from "../api.js";
import { useAuth } from "../auth.jsx";

/**
 * Sport-admin workspace: create teams under your sport and invite players to
 * them. Sports themselves, and who runs each one, are managed by a
 * super-admin on the Sports page.
 */
export default function TeamsPage() {
  const { isSuperAdmin } = useAuth();

  const [teams, setTeams] = useState(null);
  const [sports, setSports] = useState([]);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const [newTeam, setNewTeam] = useState({ name: "", sportId: "" });

  const reload = () =>
    listTeams()
      .then(setTeams)
      .catch((err) => setError(errorMessage(err)));

  useEffect(() => {
    reload();
    listSports()
      .then(setSports)
      .catch(() => setSports([]));
  }, []);

  const handleCreateTeam = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const payload = { name: newTeam.name };
      if (isSuperAdmin && newTeam.sportId) payload.sportId = newTeam.sportId;
      await createTeam(payload);
      setNewTeam({ name: "", sportId: newTeam.sportId });
      await reload();
      setNotice(`Team "${payload.name}" created.`);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div>
      {error && <div className="error-banner">{error}</div>}
      {notice && <div className="info-banner">{notice}</div>}

      <div className="panel">
        <div className="panel-title">Create a team</div>
        <form className="inline-form" onSubmit={handleCreateTeam}>
          <input
            placeholder="Team name"
            value={newTeam.name}
            onChange={(e) => setNewTeam({ ...newTeam, name: e.target.value })}
            required
          />
          {isSuperAdmin && (
            <select
              value={newTeam.sportId}
              onChange={(e) => setNewTeam({ ...newTeam, sportId: e.target.value })}
              required
            >
              <option value="">Choose a sport...</option>
              {sports.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          <button className="primary" type="submit">
            Add team
          </button>
        </form>
      </div>

      <div className="panel">
        <div className="panel-title">Teams &amp; rosters</div>
        {!teams && <div className="empty-state">Loading teams...</div>}
        {teams && teams.length === 0 && (
          <div className="empty-state">
            No teams yet. Create one above, then invite players to it.
          </div>
        )}
        {teams &&
          teams.map((team) => (
            <TeamCard key={team._id} team={team} onChange={reload} onError={setError} />
          ))}
      </div>
    </div>
  );
}

function TeamCard({ team, onChange, onError }) {
  const [invite, setInvite] = useState({ name: "", email: "" });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const handleInvite = async (e) => {
    e.preventDefault();
    onError(null);
    setResult(null);
    setBusy(true);
    try {
      const data = await invitePlayer(team._id, invite);
      setInvite({ name: "", email: "" });
      setResult(data);
      await onChange();
    } catch (err) {
      onError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (userId) => {
    onError(null);
    try {
      await removePlayer(team._id, userId);
      await onChange();
    } catch (err) {
      onError(errorMessage(err));
    }
  };

  return (
    <div className="roster-card">
      <div className="section-head" style={{ marginBottom: 12 }}>
        <h3 className="display-md">{team.name}</h3>
        <span className="count-chip">
          {team.players.length} player{team.players.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="team-tag-list" style={{ marginBottom: 14 }}>
        {team.players.length === 0 && (
          <span className="field-hint">No players yet.</span>
        )}
        {team.players.map((p) => (
          <span className="team-tag" key={p._id}>
            {p.name}
            <button
              className="remove"
              type="button"
              aria-label={`Remove ${p.name}`}
              onClick={() => handleRemove(p._id)}
            >
              &times;
            </button>
          </span>
        ))}
      </div>

      <form className="inline-form" onSubmit={handleInvite}>
        <input
          placeholder="Player name"
          value={invite.name}
          onChange={(e) => setInvite({ ...invite, name: e.target.value })}
          required
        />
        <input
          type="email"
          placeholder="Player email"
          value={invite.email}
          onChange={(e) => setInvite({ ...invite, email: e.target.value })}
          required
        />
        <button className="secondary" type="submit" disabled={busy}>
          {busy ? "Inviting..." : "Invite"}
        </button>
      </form>

      {result && (
        <div className={result.inviteEmailSent ? "info-banner" : "warn-banner"}>
          {result.inviteEmailSent ? (
            <>Invite emailed to {result.user.email}.</>
          ) : (
            <>
              Account created for {result.user.email}, but the invite email could not
              be sent{result.inviteFailureReason ? ` (${result.inviteFailureReason})` : ""}.
              {result.temporaryPassword && (
                <>
                  {" "}
                  Pass on this temporary password yourself:{" "}
                  <code className="temp-password">{result.temporaryPassword}</code>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
