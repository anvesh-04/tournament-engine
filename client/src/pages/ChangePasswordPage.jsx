import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { changePassword, setStoredToken, errorMessage } from "../api.js";
import { useAuth } from "../auth.jsx";

/** Where invited players land after signing in with their temporary password. */
export default function ChangePasswordPage() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (form.newPassword !== form.confirm) {
      setError("The two new passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      const data = await changePassword({
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      // The server re-issues a token so we are not left holding one minted
      // before the change.
      setStoredToken(data.token);
      setUser(data.user);
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
        <h1 className="auth-title">Change your password</h1>
        {error && <div className="error-banner">{error}</div>}

        {user?.mustChangePassword && (
          <div className="info-banner">
            You are signed in with a temporary password. Choose your own to continue.
          </div>
        )}

        <label htmlFor="current">Current password</label>
        <input
          id="current"
          type="password"
          autoComplete="current-password"
          value={form.currentPassword}
          onChange={set("currentPassword")}
          required
        />

        <label htmlFor="next">New password</label>
        <input
          id="next"
          type="password"
          autoComplete="new-password"
          minLength={8}
          value={form.newPassword}
          onChange={set("newPassword")}
          required
        />
        <div className="field-hint">At least 8 characters.</div>

        <label htmlFor="confirm">Confirm new password</label>
        <input
          id="confirm"
          type="password"
          autoComplete="new-password"
          minLength={8}
          value={form.confirm}
          onChange={set("confirm")}
          required
        />

        <button className="primary full-width" type="submit" disabled={busy}>
          {busy ? "Saving..." : "Save new password"}
        </button>
      </form>
    </div>
  );
}
