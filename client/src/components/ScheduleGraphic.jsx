import React from "react";

/**
 * The conflict graph, drawn.
 *
 * This is the one picture that actually explains the product: four teams, the
 * six fixtures between them, and the colouring that assigns each fixture a
 * time slot such that no team ever appears twice in the same slot. It is the
 * output of server/algorithms/graphColoring.js, not a decoration.
 *
 * Inline SVG rather than an image file: it inherits the palette, stays sharp
 * at any size, costs no extra request, and can never 404.
 */

const TEAMS = [
  { id: "A", label: "Ravens", x: 90, y: 60 },
  { id: "B", label: "Hawks", x: 310, y: 60 },
  { id: "C", label: "Lions", x: 310, y: 250 },
  { id: "D", label: "Bears", x: 90, y: 250 },
];

/**
 * Each edge is one fixture; `slot` is the colour the greedy pass assigned.
 * Fixtures that share a team never share a slot — that is the whole
 * constraint, and it is visible here: every team node touches three edges,
 * each a different slot.
 */
const FIXTURES = [
  { from: "A", to: "B", slot: 0 },
  { from: "C", to: "D", slot: 0 },
  { from: "A", to: "D", slot: 1 },
  { from: "B", to: "C", slot: 1 },
  { from: "A", to: "C", slot: 2 },
  { from: "B", to: "D", slot: 2 },
];

const SLOT_STYLE = [
  { stroke: "var(--live)", dash: "none" },
  { stroke: "var(--ink)", dash: "none" },
  { stroke: "var(--ink-faint)", dash: "5 5" },
];

const byId = Object.fromEntries(TEAMS.map((t) => [t.id, t]));

export default function ScheduleGraphic() {
  return (
    <figure className="schedule-graphic">
      <svg
        viewBox="0 0 400 310"
        role="img"
        aria-labelledby="graph-title graph-desc"
        preserveAspectRatio="xMidYMid meet"
      >
        <title id="graph-title">Fixture conflict graph for four teams</title>
        <desc id="graph-desc">
          Four teams joined by six fixtures. Each fixture is coloured by the time
          slot it was assigned, and no team has two fixtures in the same slot.
        </desc>

        {FIXTURES.map((f) => {
          const a = byId[f.from];
          const b = byId[f.to];
          const style = SLOT_STYLE[f.slot];
          return (
            <line
              key={`${f.from}${f.to}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={style.stroke}
              strokeWidth="1.5"
              strokeDasharray={style.dash}
              opacity="0.85"
            />
          );
        })}

        {TEAMS.map((t) => (
          <g key={t.id}>
            <circle cx={t.x} cy={t.y} r="26" fill="var(--canvas)" />
            <circle
              cx={t.x}
              cy={t.y}
              r="26"
              fill="none"
              stroke="var(--rule-strong)"
              strokeWidth="1.5"
            />
            <text
              x={t.x}
              y={t.y + 5}
              textAnchor="middle"
              fill="var(--ink)"
              fontSize="15"
              fontFamily="var(--font-display)"
            >
              {t.id}
            </text>
            <text
              x={t.x}
              y={t.y + 46}
              textAnchor="middle"
              fill="var(--ink-faint)"
              fontSize="9"
              letterSpacing="1.4"
              fontFamily="var(--font-mono)"
            >
              {t.label.toUpperCase()}
            </text>
          </g>
        ))}
      </svg>

      <figcaption>
        <span className="graphic-key">
          {SLOT_STYLE.map((s, i) => (
            <span key={i}>
              <svg width="20" height="8" aria-hidden="true">
                <line
                  x1="0"
                  y1="4"
                  x2="20"
                  y2="4"
                  stroke={s.stroke}
                  strokeWidth="1.5"
                  strokeDasharray={s.dash}
                />
              </svg>
              Slot {i}
            </span>
          ))}
        </span>
        Six fixtures, three slots, no team playing twice at once.
      </figcaption>
    </figure>
  );
}
