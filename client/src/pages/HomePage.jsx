import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listTournaments, errorMessage } from "../api.js";
import { useAuth } from "../auth.jsx";
import ScheduleGraphic from "../components/ScheduleGraphic.jsx";

export default function HomePage() {
  const [tournaments, setTournaments] = useState(null);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  useEffect(() => {
    listTournaments()
      .then(setTournaments)
      .catch((err) => setError(errorMessage(err)));
  }, []);

  return (
    <div>
      {/* The photograph is atmosphere, not subject: it sits under a heavy
          scrim so the type stays the thing you read, which is how the
          reference build treats its own imagery. */}
      <section className="masthead">
        <div className="masthead-media" aria-hidden="true">
          <img src="/img/hero-field.jpg" alt="" fetchPriority="high" />
        </div>
        <div className="masthead-body">
          <p className="eyebrow">Fixture scheduling</p>
          <h1 className="display-xl">
            Every fixture,
            <br />
            no clashes.
          </h1>
          <p className="masthead-sub">
            Round-robin schedules built by graph coloring, knockout brackets ordered
            by topological sort, and every edit checked against both before it lands.
          </p>
        </div>
      </section>

      <section className="panel explainer">
        <div className="explainer-text">
          <p className="eyebrow">How the schedule is built</p>
          <h2 className="display-md">One team, one place, one time.</h2>
          <p>
            Every pair of teams that must meet becomes an edge. Two fixtures that
            share a team cannot share a time slot, so the scheduler colours the
            graph — each colour is a slot. A clash is not something the system
            catches afterwards; it is something the colouring cannot express.
          </p>
        </div>
        <ScheduleGraphic />
      </section>

      <section className="panel">
        <div className="section-head">
          <div className="panel-title" style={{ marginBottom: 0 }}>
            Tournaments
          </div>
          {tournaments && tournaments.length > 0 && (
            <span className="count-chip">
              {tournaments.length} total
            </span>
          )}
        </div>

        {error && <div className="error-banner">Could not reach the server: {error}</div>}

        {!tournaments && !error && <TournamentListSkeleton />}

        {tournaments && tournaments.length === 0 && (
          <div className="empty-state">
            {isAdmin
              ? "No tournaments yet. Create one and the fixtures generate themselves."
              : "No tournaments have been published yet."}
          </div>
        )}

        {tournaments && tournaments.length > 0 && (
          <div className="tournament-list">
            {tournaments.map((t) => (
              <button
                key={t._id}
                type="button"
                className="tournament-list-item"
                onClick={() => navigate(`/tournament/${t._id}`)}
              >
                <span className="t-text">
                  <span className="t-name">{t.name}</span>
                  <span className="t-meta">
                    {t.format === "round-robin" ? "Round robin" : "Knockout"} &middot;{" "}
                    {t.numCourts} court{t.numCourts > 1 ? "s" : ""}
                  </span>
                </span>
                <span className="t-arrow" aria-hidden="true">
                  &rarr;
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * Skeleton rows rather than a spinner: they occupy the shape the real list
 * will take, so the page does not jump when the data lands.
 */
function TournamentListSkeleton() {
  return (
    <div className="tournament-list" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div className="tournament-list-item skeleton-row" key={i}>
          <span className="t-text">
            <span className="skeleton skeleton-title" />
            <span className="skeleton skeleton-meta" />
          </span>
        </div>
      ))}
    </div>
  );
}
