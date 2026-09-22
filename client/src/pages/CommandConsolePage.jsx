import React, { useEffect, useState } from "react";
import { previewCommand, confirmCommand, getCommandActions, errorMessage } from "../api.js";

/**
 * Natural-language admin commands.
 *
 * The flow is deliberately two-step and cannot be collapsed into one: typing a
 * command only ever produces a PREVIEW. Nothing changes until the admin reads
 * the listed changes and presses Apply, which sends the server-signed action
 * back to be re-validated and executed through the normal update path.
 *
 * A conflict reported at preview time is the scheduling checker doing its job —
 * the same 409 a manual edit would have produced.
 */
export default function CommandConsolePage() {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState(null);
  const [applied, setApplied] = useState(null);
  const [error, setError] = useState(null);
  const [unsupported, setUnsupported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [capabilities, setCapabilities] = useState(null);

  useEffect(() => {
    getCommandActions()
      .then(setCapabilities)
      .catch(() => setCapabilities({ available: false, actions: [] }));
  }, []);

  const reset = () => {
    setPreview(null);
    setApplied(null);
    setError(null);
    setUnsupported(false);
  };

  const handlePreview = async (e) => {
    e.preventDefault();
    reset();
    setBusy(true);
    try {
      setPreview(await previewCommand(text));
    } catch (err) {
      setError(errorMessage(err));
      setUnsupported(err?.response?.data?.unsupported === true);
    } finally {
      setBusy(false);
    }
  };

  const handleApply = async () => {
    setError(null);
    setBusy(true);
    try {
      const result = await confirmCommand(preview);
      setApplied(result);
      setPreview(null);
      setText("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="panel">
        <p className="eyebrow">Admin</p>
        <h1 className="display-lg" style={{ margin: "10px 0 20px" }}>
          Command console
        </h1>
        <p className="console-intro">
          Describe a schedule change in plain English. You will always be shown
          exactly what would change before anything is applied.
        </p>

        {capabilities && !capabilities.available && (
          <div className="warn-banner">
            Natural-language commands are unavailable: the server has no
            ANTHROPIC_API_KEY configured. Schedule changes can still be made by hand
            from a tournament&rsquo;s schedule view.
          </div>
        )}

        <form onSubmit={handlePreview}>
          <label htmlFor="command">Your instruction</label>
          <textarea
            id="command"
            rows={3}
            placeholder="e.g. Move everything in slot 0 to slot 4"
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={capabilities ? !capabilities.available : false}
            required
          />
          <div className="console-actions">
            <button
              className="primary"
              type="submit"
              disabled={busy || (capabilities ? !capabilities.available : false)}
            >
              {busy && !preview ? "Working out what that means..." : "Preview change"}
            </button>
            {(preview || applied || error) && (
              <button className="secondary" type="button" onClick={reset}>
                Clear
              </button>
            )}
          </div>
        </form>

        {capabilities && capabilities.actions.length > 0 && (
          <details className="capability-list">
            <summary>What can it do?</summary>
            <ul>
              {capabilities.actions.map((a) => (
                <li key={a.name}>
                  <code>{a.name}</code> — {a.description}
                </li>
              ))}
            </ul>
            <p className="field-hint">
              Anything outside this list is refused rather than approximated.
            </p>
          </details>
        )}
      </div>

      {error && (
        <div className={unsupported ? "warn-banner" : "error-banner"}>
          {unsupported ? "Not something I can do: " : ""}
          {error}
        </div>
      )}

      {preview && (
        <div className="panel preview-panel">
          <p className="eyebrow">Confirm this change</p>
          <p className="preview-summary">{preview.preview.summary}</p>

          <ul className="preview-changes">
            {preview.preview.changes.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>

          <div className="console-actions">
            <button className="primary" onClick={handleApply} disabled={busy}>
              {busy ? "Applying..." : `Apply ${preview.preview.matchCount} change${
                preview.preview.matchCount === 1 ? "" : "s"
              }`}
            </button>
            <button className="secondary" onClick={reset} disabled={busy}>
              Cancel
            </button>
          </div>
          <p className="field-hint" style={{ marginTop: 12 }}>
            Nothing has changed yet. Affected players are emailed once you apply.
          </p>
        </div>
      )}

      {applied && (
        <div className="panel applied-panel">
          <p className="eyebrow live-dot">Applied</p>
          <p className="preview-summary">{applied.summary}</p>
          <ul className="preview-changes">
            {applied.changes.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
          <p className="field-hint">
            {applied.playersNotified} player
            {applied.playersNotified === 1 ? "" : "s"} notified
            {applied.emailsSent > 0 ? `, ${applied.emailsSent} by email` : ""}.
          </p>
        </div>
      )}
    </div>
  );
}
