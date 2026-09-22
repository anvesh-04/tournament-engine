/**
 * STANDINGS / LEADERBOARD COMPUTATION
 * -----------------------------------
 * Applies to ROUND-ROBIN tournaments only. Knockout tournaments have no
 * standings concept — the bracket itself already shows who is still in, and
 * a team's "position" there is just how far they progressed.
 *
 * Points model (confirmed with the project owner): win = 3, loss = 0.
 * There is no draw outcome: the Match schema carries a single `winner` field
 * with no way to express a drawn result, so a draw is not representable and
 * is therefore not scored. If a sport later needs draws, the Match schema has
 * to gain an explicit outcome field first — do not infer a draw from a
 * COMPLETED match with a null winner, because that is also what an
 * in-progress data-entry mistake looks like.
 */

const POINTS_PER_WIN = 3;
const POINTS_PER_LOSS = 0;

/**
 * Returns true if a match should contribute to the standings.
 * A match counts only when it is COMPLETED, has a winner recorded, and has
 * two real teams. BYE matches (teamB === null) are auto-advanced by the
 * knockout builder and never represent a played game, so they never score.
 */
function isScorable(match) {
  if (match.status !== "COMPLETED") return false;
  if (!match.winner) return false;
  if (!match.teamA || !match.teamB) return false;
  // Defensive: a winner that isn't one of the two participants means the
  // record is corrupt. Scoring it would silently invent points for a team
  // that never played, so we skip it rather than guess.
  if (match.winner !== match.teamA && match.winner !== match.teamB) return false;
  return true;
}

/**
 * Computes the standings table for a round-robin tournament.
 *
 * @param {{ teams: {name: string}[], matches: object[] }} tournament
 * @returns {{ team, played, wins, losses, points }[]} sorted best-first
 */
function computeStandings(tournament) {
  const rows = new Map();

  // Seed a row for every registered team so teams that have not played yet
  // still appear (with zeroes) instead of vanishing from the table.
  for (const team of tournament.teams || []) {
    rows.set(team.name, {
      team: team.name,
      played: 0,
      wins: 0,
      losses: 0,
      points: 0,
    });
  }

  for (const match of tournament.matches || []) {
    if (!isScorable(match)) continue;

    const loser = match.winner === match.teamA ? match.teamB : match.teamA;

    for (const [name, isWinner] of [
      [match.winner, true],
      [loser, false],
    ]) {
      // A match may reference a team that was since removed from teams[].
      // Create a row for it rather than dropping a played result.
      if (!rows.has(name)) {
        rows.set(name, { team: name, played: 0, wins: 0, losses: 0, points: 0 });
      }
      const row = rows.get(name);
      row.played += 1;
      if (isWinner) {
        row.wins += 1;
        row.points += POINTS_PER_WIN;
      } else {
        row.losses += 1;
        row.points += POINTS_PER_LOSS;
      }
    }
  }

  // Sort: points desc, then wins desc, then fewest played (a team on the same
  // points from fewer games is ahead on efficiency), then name for a stable,
  // deterministic order so the table never reshuffles between identical reads.
  return [...rows.values()].sort(
    (a, b) =>
      b.points - a.points ||
      b.wins - a.wins ||
      a.played - b.played ||
      a.team.localeCompare(b.team)
  );
}

module.exports = {
  POINTS_PER_WIN,
  POINTS_PER_LOSS,
  isScorable,
  computeStandings,
};
