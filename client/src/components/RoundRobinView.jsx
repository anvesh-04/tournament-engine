import React, { useState } from "react";
import { updateMatch, errorMessage } from "../api.js";
import { useAuth } from "../auth.jsx";

const statusClass = {
  PENDING: "status-pending",
  SCHEDULED: "status-scheduled",
  COMPLETED: "status-completed",
};

export default function RoundRobinView({ tournament, onUpdate }) {
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState(null);
  // Only an admin can actually save a change. Rendering an Edit button for
  // everyone else just produces a 401 after they have filled the form in.
  const { isAdmin } = useAuth();

  const matches = [...tournament.matches].sort(
    (a, b) => a.timeSlot - b.timeSlot || a.court - b.court
  );

  const handleSlotChange = async (match, newSlot, newCourt) => {
    setError(null);
    try {
      const updated = await updateMatch(tournament._id, match.matchRefId, {
        timeSlot: Number(newSlot),
        court: Number(newCourt),
      });
      onUpdate(updated);
      setEditingId(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div>
      {error && <div className="error-banner">{error}</div>}
      <div className="slot-grid">
        {matches.map((m) => (
          <div className="match-row" key={m.matchRefId}>
            <div className="slot-label">Slot {m.timeSlot}</div>
            <div className="teams">
              {m.teamA} <span className="vs">vs</span> {m.teamB}
            </div>
            {isAdmin && editingId === m.matchRefId ? (
              <InlineSlotEditor
                match={m}
                onSave={handleSlotChange}
                onCancel={() => setEditingId(null)}
                maxCourt={tournament.numCourts - 1}
              />
            ) : (
              <>
                <div className="court-label">Court {m.court}</div>
                <div className="row-actions">
                  <span className={`status-pill ${statusClass[m.status]}`}>{m.status}</span>
                  {isAdmin && (
                    <button
                      className="secondary"
                      onClick={() => setEditingId(m.matchRefId)}
                      aria-label={`Edit ${m.teamA} versus ${m.teamB}`}
                    >
                      Edit
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function InlineSlotEditor({ match, onSave, onCancel, maxCourt }) {
  const [slot, setSlot] = useState(match.timeSlot);
  const [court, setCourt] = useState(match.court);

  return (
    <>
      <input
        type="number"
        value={slot}
        onChange={(e) => setSlot(e.target.value)}
        aria-label="Time slot"
        style={{ width: 72 }}
      />
      <div className="row-actions">
        <input
          type="number"
          min="0"
          max={maxCourt}
          value={court}
          onChange={(e) => setCourt(e.target.value)}
          aria-label="Court"
          style={{ width: 62 }}
        />
        <button className="primary" onClick={() => onSave(match, slot, court)}>
          Save
        </button>
        <button className="secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </>
  );
}
