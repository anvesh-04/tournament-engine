import React, { useState } from "react";
import { updateMatch } from "../api.js";

const statusClass = {
  PENDING: "status-pending",
  SCHEDULED: "status-scheduled",
  COMPLETED: "status-completed",
};

export default function RoundRobinView({ tournament, onUpdate }) {
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState(null);

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
      setError(err.response?.data?.error || err.message);
    }
  };

  return (
    <div>
      {error && <div className="error-banner">{error}</div>}
      <div className="slot-grid">
        {matches.map((m) => (
          <div className="match-row" key={m.matchRefId}>
            <div className="slot-label">SLOT {m.timeSlot}</div>
            <div className="teams">
              {m.teamA} <span className="vs">vs</span> {m.teamB}
            </div>
            {editingId === m.matchRefId ? (
              <InlineSlotEditor
                match={m}
                onSave={handleSlotChange}
                onCancel={() => setEditingId(null)}
                maxCourt={tournament.numCourts - 1}
              />
            ) : (
              <>
                <div className="court-label">Court {m.court}</div>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <span className={`status-pill ${statusClass[m.status]}`}>{m.status}</span>
                  <button className="secondary" onClick={() => setEditingId(m.matchRefId)}>
                    Edit
                  </button>
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
        style={{ width: 60 }}
      />
      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="number"
          min="0"
          max={maxCourt}
          value={court}
          onChange={(e) => setCourt(e.target.value)}
          style={{ width: 50 }}
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
