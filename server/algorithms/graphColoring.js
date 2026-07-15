/**
 * ROUND-ROBIN SCHEDULING VIA GRAPH COLORING
 * ------------------------------------------
 * Model: each TEAM is a node. An EDGE connects two teams if they must play
 * each other (in round-robin, every pair of teams has an edge).
 * Each MATCH (edge) needs to be assigned a "color" = a time slot.
 *
 * Constraint we must satisfy:
 *   No team can play two matches in the SAME time slot.
 *   => In graph terms: this is exactly EDGE COLORING. Two edges that share
 *      a vertex (a team) cannot have the same color (time slot).
 *
 * We don't need the full generality of chromatic edge coloring theory here
 * (proving minimum colors etc.) — for the resume/interview story, the
 * important part is: we greedily color edges such that adjacent edges
 * (sharing a team) never get the same color, and we do this using an
 * adjacency-based conflict graph, which is graph coloring in the standard
 * sense (just applied to the LINE GRAPH of the tournament graph).
 *
 * Algorithm:
 * 1. Generate all match pairs (edges) via round-robin pairing.
 * 2. Build a "conflict graph" where each MATCH is a node, and two matches
 *    are connected if they share a team (can't be scheduled in the same slot).
 * 3. Greedily color this conflict graph: for each match, assign the lowest
 *    numbered time slot not already used by any of its "conflicting" matches.
 * 4. Time slots are then distributed across available courts.
 */

/**
 * Generates all round-robin match pairs using the circle method.
 * If odd number of teams, adds a "BYE" placeholder.
 */
function generateRoundRobinPairs(teamIds) {
  const teams = [...teamIds];
  if (teams.length % 2 !== 0) teams.push(null); // BYE

  const pairs = [];
  const n = teams.length;

  for (let round = 0; round < n - 1; round++) {
    for (let i = 0; i < n / 2; i++) {
      const teamA = teams[i];
      const teamB = teams[n - 1 - i];
      if (teamA !== null && teamB !== null) {
        pairs.push({ teamA, teamB });
      }
    }
    // rotate all teams except the first (standard circle method)
    const fixed = teams[0];
    const rest = teams.slice(1);
    rest.unshift(rest.pop());
    teams.splice(0, teams.length, fixed, ...rest);
  }

  return pairs;
}

/**
 * Builds a conflict graph adjacency list: matchIndex -> Set of matchIndexes
 * that share a team with it (and therefore cannot share a time slot / color).
 */
function buildConflictGraph(matches) {
  const adjacency = matches.map(() => new Set());

  for (let i = 0; i < matches.length; i++) {
    for (let j = i + 1; j < matches.length; j++) {
      const a = matches[i];
      const b = matches[j];
      const sharesTeam =
        a.teamA === b.teamA ||
        a.teamA === b.teamB ||
        a.teamB === b.teamA ||
        a.teamB === b.teamB;
      if (sharesTeam) {
        adjacency[i].add(j);
        adjacency[j].add(i);
      }
    }
  }
  return adjacency;
}

/**
 * Greedy graph coloring: assigns the smallest available color (time slot)
 * to each match such that no two conflicting matches share a color.
 * This is the classic "greedy coloring" approach — O(V + E) after conflict
 * graph is built, and guarantees a valid (though not necessarily minimum)
 * coloring, which is the standard practical tradeoff since optimal graph
 * coloring is NP-hard.
 */
function greedyColorMatches(matches, adjacency) {
  const colorOf = new Array(matches.length).fill(-1);

  for (let i = 0; i < matches.length; i++) {
    const usedColors = new Set();
    for (const neighbor of adjacency[i]) {
      if (colorOf[neighbor] !== -1) usedColors.add(colorOf[neighbor]);
    }
    let color = 0;
    while (usedColors.has(color)) color++;
    colorOf[i] = color;
  }

  return colorOf;
}

/**
 * Distributes colored matches (time slots) across a fixed number of courts.
 * Matches with the same color (time slot) run in parallel on different courts.
 * If more matches share a color than there are courts, we split that color
 * group across consecutive time blocks on the same slot-index basis.
 */
function assignCourts(matches, colorOf, numCourts) {
  const slotGroups = {};
  colorOf.forEach((color, matchIdx) => {
    if (!slotGroups[color]) slotGroups[color] = [];
    slotGroups[color].push(matchIdx);
  });

  const scheduled = [];
  let globalSlotOffset = 0;

  Object.keys(slotGroups)
    .map(Number)
    .sort((a, b) => a - b)
    .forEach((colorKey) => {
      const matchIdxs = slotGroups[colorKey];
      let courtCursor = 0;
      let subSlot = 0;

      matchIdxs.forEach((matchIdx) => {
        scheduled.push({
          ...matches[matchIdx],
          timeSlot: globalSlotOffset + subSlot,
          court: courtCursor,
        });
        courtCursor++;
        if (courtCursor >= numCourts) {
          courtCursor = 0;
          subSlot++;
        }
      });

      globalSlotOffset += subSlot + 1;
    });

  return scheduled;
}

/**
 * Main entry point: takes team IDs and court count, returns a fully
 * scheduled round-robin fixture list with no team-conflicts within a slot.
 */
function generateRoundRobinSchedule(teamIds, numCourts) {
  const matches = generateRoundRobinPairs(teamIds);
  const adjacency = buildConflictGraph(matches);
  const colorOf = greedyColorMatches(matches, adjacency);
  const scheduled = assignCourts(matches, colorOf, numCourts);
  return scheduled;
}

module.exports = {
  generateRoundRobinPairs,
  buildConflictGraph,
  greedyColorMatches,
  assignCourts,
  generateRoundRobinSchedule,
};
