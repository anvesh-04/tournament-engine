import React, { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { register, listSports, getBootstrapStatus, errorMessage } from "../api.js";
import { useAuth } from "../auth.jsx";

/**
 * Self-registration creates a player account (or, on a brand-new install, the
 * first super-admin). It cannot create an admin — that is done by a
 * super-admin, so that the role system is not something anyone can opt into.
 */
export default function RegisterPage() {
  const { user, signIn } = useAuth();
  const navigate = useNavigate();

  const [sports, setSports] = useState(null);
  const [needsFirstAdmin, setNeedsFirstAdmin] = useState(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", sportId: "" });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listSports()
      .then(setSports)
      .catch(() => setSports([]));
    getBootstrapStatus()
      .then((s) => setNeedsFirstAdmin(s.needsFirstAdmin))
      .catch(() => setNeedsFirstAdmin(false));
  }, []);

  if (user) return <Navigate to="/" replace />;

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  // Only the server can tell us this. Inferring it from an empty sport list
  // would offer a bootstrap sign-up on a database that already has users, and
  // the server would then reject it for a missing sportId with no sport to pick.
  const isFirstAccount = needsFirstAdmin === true;
  const ready = sports !== null && needsFirstAdmin !== null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const payload = {
        name: form.name,
        email: form.email,
        password: form.password,
      };
      if (!isFirstAccount) payload.sportId = form.sportId;

      signIn(await register(payload));
      navigate("/", { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-shell">
      <form className="panel" onSubmit={handleSubmit}>
        <h1 className="auth-title">Create an account</h1>
        {error && <div className="error-banner">{error}</div>}

        {isFirstAccount && (
          <div className="info-banner">
            No accounts exist yet, so this first one becomes the super-admin.
          </div>
        )}

        <label htmlFor="name">Full name</label>
        <input id="name" value={form.name} onChange={set("name")} required />

        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={set("email")}
          required
        />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          value={form.password}
          onChange={set("password")}
          required
        />
        <div className="field-hint">At least 8 characters.</div>

        {!ready && <div className="field-hint">Loading sports...</div>}

        {ready && !isFirstAccount && sports.length === 0 && (
          <div className="warn-banner" style={{ marginTop: 16 }}>
            No sports have been set up yet, so there is nothing to register under.
            Ask a super-admin to create one first.
          </div>
        )}

        {ready && !isFirstAccount && sports.length > 0 && (
          <>
            <label htmlFor="sport">Sport</label>
            <select id="sport" value={form.sportId} onChange={set("sportId")} required>
              <option value="">Choose a sport...</option>
              {sports.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </select>
          </>
        )}

        <button
          className="primary full-width"
          type="submit"
          disabled={busy || !ready || (!isFirstAccount && sports.length === 0)}
        >
          {busy ? "Creating account..." : "Create account"}
        </button>

        <p className="auth-footnote">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
