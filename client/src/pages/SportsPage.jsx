import React, { useCallback, useEffect, useState } from "react";
import {
  listSports,
  createSport,
  updateSport,
  inviteSportAdmin,
  listUsers,
  errorMessage,
} from "../api.js";

/**
 * Super-admin only: create sports and decide who runs each one.
 *
 * A sport admin is the boundary the whole permission model hangs off, so this
 * screen is deliberate about it — every assignment states plainly what it
 * does to the people involved, including the person being replaced.
 */
export default function SportsPage() {
  const [sports, setSports] = useState(null);
  const [users, setUsers] = useState([]);
  const [newSport, setNewSport] = useState("");
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const reload = useCallback(async () => {
    try {
      const [s, u] = await Promise.all([listSports(), listUsers()]);
      setSports(s);
      setUsers(u);
    } catch (err) {
      setError(errorMessage(err));
      setSports([]);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    try {
      await createSport({ name: newSport });
      setNotice(`Created ${newSport}. Assign someone to run it below.`);
      setNewSport("");
      await reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div>
      {error && <div className="error-banner">{error}</div>}
      {notice && <div className="info-banner">{notice}</div>}

      <section className="panel">
        <p className="eyebrow">Super admin</p>
        <h1 className="display-lg" style={{ margin: "10px 0 20px" }}>
          Sports
        </h1>
        <p className="console-intro">
          A sport is the boundary everything else sits inside. Its admin can
          manage teams, players and tournaments for that sport only.
        </p>

        <form className="inline-form" onSubmit={handleCreate}>
          <input
            aria-label="New sport name"
            placeholder="New sport, e.g. Cricket"
            value={newSport}
            onChange={(e) => setNewSport(e.target.value)}
            required
          />
          <button className="primary" type="submit">
            Add sport
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="panel-title">Sports &amp; who runs them</div>

        {!sports && <div className="empty-state">Loading sports...</div>}

        {sports && sports.length === 0 && (
          <div className="empty-state">
            No sports yet. Create one above, then assign an admin to it.
          </div>
        )}

        {sports &&
          sports.map((sport) => (
            <SportCard
              key={sport._id}
              sport={sport}
              users={users}
              onChange={reload}
              onError={setError}
              onNotice={setNotice}
            />
          ))}
      </section>
    </div>
  );
}

function SportCard({ sport, users, onChange, onError, onNotice }) {
  const [mode, setMode] = useState(null); // "existing" | "invite" | null
  const [picked, setPicked] = useState("");
  const [invitee, setInvitee] = useState({ name: "", email: "" });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const admin = sport.adminUserId;

  // Someone already running a different sport cannot be assigned here without
  // being moved out of that sport first, so they are not offered.
  const assignable = users.filter(
    (u) => !u.sport || String(u.sport._id || u.sport) === String(sport._id)
  );

  const reset = () => {
    setMode(null);
    setPicked("");
    setInvitee({ name: "", email: "" });
  };

  const assignExisting = async (e) => {
    e.preventDefault();
    onError(null);
    setResult(null);
    setBusy(true);
    try {
      const updated = await updateSport(sport._id, { adminUserId: picked });
      onNotice(`${updated.adminUserId.name} now runs ${updated.name}.`);
      reset();
      await onChange();
    } catch (err) {
      onError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const invite = async (e) => {
    e.preventDefault();
    onError(null);
    setResult(null);
    setBusy(true);
    try {
      const data = await inviteSportAdmin(sport._id, invitee);
      setResult(data);
      reset();
      await onChange();
    } catch (err) {
      onError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const removeAdmin = async () => {
    onError(null);
    setBusy(true);
    try {
      await updateSport(sport._id, { adminUserId: null });
      onNotice(
        `${admin.name} no longer runs ${sport.name}. Their account is now a player in that sport.`
      );
      await onChange();
    } catch (err) {
      onError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="roster-card">
      <div className="section-head" style={{ marginBottom: 14 }}>
        <h3 className="display-md">{sport.name}</h3>
        {admin ? (
          <span className="count-chip live-dot">Admin assigned</span>
        ) : (
          <span className="count-chip">No admin</span>
        )}
      </div>

      {admin ? (
        <div className="assigned-admin">
          <div>
            <div className="assigned-admin-name">{admin.name}</div>
            <div className="field-hint" style={{ marginTop: 4 }}>
              {admin.email}
            </div>
          </div>
          <div className="row-actions">
            <button
              className="secondary"
              onClick={() => setMode(mode ? null : "existing")}
              disabled={busy}
            >
              {mode ? "Cancel" : "Replace"}
            </button>
            <button className="secondary danger" onClick={removeAdmin} disabled={busy}>
              Remove
            </button>
          </div>
        </div>
      ) : (
        <div className="assigned-admin">
          <p className="field-hint" style={{ margin: 0 }}>
            Nobody runs this sport yet, so only super-admins can manage it.
          </p>
          {!mode && (
            <div className="row-actions">
              <button className="primary" onClick={() => setMode("existing")}>
                Assign admin
              </button>
            </div>
          )}
        </div>
      )}

      {mode && (
        <div className="assign-panel">
          <div className="assign-tabs">
            <button
              className={mode === "existing" ? "primary" : "secondary"}
              onClick={() => setMode("existing")}
              type="button"
            >
              Existing account
            </button>
            <button
              className={mode === "invite" ? "primary" : "secondary"}
              onClick={() => setMode("invite")}
              type="button"
            >
              Invite by email
            </button>
          </div>

          {mode === "existing" && (
            <form onSubmit={assignExisting}>
              <label htmlFor={`pick-${sport._id}`}>Who should run {sport.name}?</label>
              <select
                id={`pick-${sport._id}`}
                value={picked}
                onChange={(e) => setPicked(e.target.value)}
                required
              >
                <option value="">Choose an account...</option>
                {assignable.map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.name} ({u.email}) — {u.role}
                  </option>
                ))}
              </select>
              {assignable.length === 0 && (
                <div className="field-hint">
                  No eligible accounts. Everyone already belongs to another sport —
                  invite someone by email instead.
                </div>
              )}
              <div className="console-actions">
                <button className="primary" type="submit" disabled={busy || !picked}>
                  {busy ? "Assigning..." : "Make sport admin"}
                </button>
                <button className="secondary" type="button" onClick={reset} disabled={busy}>
                  Cancel
                </button>
              </div>
              <p className="field-hint" style={{ marginTop: 14 }}>
                They are promoted to sport-admin for {sport.name} and removed from any
                team roster.
                {admin ? ` ${admin.name} becomes a player in this sport.` : ""}
              </p>
            </form>
          )}

          {mode === "invite" && (
            <form onSubmit={invite}>
              <label htmlFor={`name-${sport._id}`}>Full name</label>
              <input
                id={`name-${sport._id}`}
                value={invitee.name}
                onChange={(e) => setInvitee({ ...invitee, name: e.target.value })}
                required
              />
              <label htmlFor={`email-${sport._id}`}>Email</label>
              <input
                id={`email-${sport._id}`}
                type="email"
                value={invitee.email}
                onChange={(e) => setInvitee({ ...invitee, email: e.target.value })}
                required
              />
              <div className="console-actions">
                <button className="primary" type="submit" disabled={busy}>
                  {busy ? "Inviting..." : "Invite as sport admin"}
                </button>
                <button className="secondary" type="button" onClick={reset} disabled={busy}>
                  Cancel
                </button>
              </div>
              <p className="field-hint" style={{ marginTop: 14 }}>
                Creates an account with a temporary password and emails it to them.
                They choose their own password on first sign-in.
              </p>
            </form>
          )}
        </div>
      )}

      {result && (
        <div className={result.inviteEmailSent ? "info-banner" : "warn-banner"}>
          {result.inviteEmailSent ? (
            <>
              {result.user.name} now runs {sport.name}. Sign-in details emailed to{" "}
              {result.user.email}.
            </>
          ) : (
            <>
              {result.user.name} now runs {sport.name}, but the invite email could not
              be sent
              {result.inviteFailureReason ? ` (${result.inviteFailureReason})` : ""}.
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
