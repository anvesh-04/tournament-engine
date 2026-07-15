/**
 * KNOCKOUT SCHEDULING VIA TOPOLOGICAL SORT (KAHN'S ALGORITHM)
 * -------------------------------------------------------------
 * Model: each MATCH is a node in a Directed Acyclic Graph (DAG).
 * A directed edge Match_A -> Match_B means "Match_B depends on the winner
 * of Match_A" (e.g., a Quarterfinal feeds into a Semifinal).
 *
 * Why this is a real topological sort problem:
 *   You CANNOT schedule a Semifinal before both of its feeding Quarterfinals
 *   are complete. This is precisely a dependency-ordering problem, which
 *   topological sort solves. Kahn's Algorithm specifically works via
 *   in-degree counting + a queue, which also gives us, for free, the
 *   grouping of matches into ROUNDS (every match with in-degree 0 after
 *   processing round N belongs to round N+1) — that's what makes Kahn's
 *   a better fit here than DFS-based topological sort.
 *
 * Steps:
 * 1. Build the bracket tree: for N teams (padded to next power of 2 with
 *    byes), create leaf matches for Round 1, and parent matches for every
 *    subsequent round, with edges Child -> Parent.
 * 2. Compute in-degree for every match node (0 for Round 1 matches, since
 *    they have no dependencies; 2 for every later match, since it depends
 *    on 2 feeder matches).
 * 3. Run Kahn's algorithm: repeatedly dequeue in-degree-0 nodes, "release"
 *    them into the current round, decrement in-degree of their dependents,
 *    and enqueue any dependent that reaches in-degree 0.
 * 4. This produces both (a) a valid schedulable order respecting all
 *    dependencies, AND (b) a clean round-by-round grouping for the bracket UI.
 */

/** Rounds a number up to the next power of 2 (bracket sizes must be 2^n). */
function nextPowerOfTwo(n) {
  let power = 1;
  while (power < n) power *= 2;
  return power;
}

/**
 * Builds the knockout bracket as a DAG of match nodes.
 * Returns { matches, edges } where edges represent "feeds into" relationships.
 *
 * BYE HANDLING:
 * When the team count isn't a power of 2, we pad the bracket with BYE slots.
 * A naive sequential pairing can accidentally pair two BYEs against each
 * other, which produces a match that can never have a winner and would
 * permanently break the dependency chain above it. To avoid this, we
 * distribute BYEs so each one is paired against a REAL team whenever
 * possible: that team is auto-advanced (marked as the winner immediately,
 * since there's no opponent to play). Two BYEs only ever face each other
 * if there are fewer real teams than BYE slots, which cannot happen here
 * since BYEs are always less than half the bracket size.
 */
function buildKnockoutGraph(teamIds) {
  const bracketSize = nextPowerOfTwo(teamIds.length);
  const byesNeeded = bracketSize - teamIds.length;

  const matches = [];
  const edges = [];
  let matchCounter = 0;
  let currentRoundMatchIds = [];

  // First `byesNeeded` real teams each get paired against a BYE, so they
  // auto-advance without playing. Remaining real teams play each other.
  const autoAdvanceTeams = teamIds.slice(0, byesNeeded);
  const playingTeams = teamIds.slice(byesNeeded);

  autoAdvanceTeams.forEach((team) => {
    const id = `M${matchCounter++}`;
    matches.push({
      id,
      round: 1,
      teamA: team,
      teamB: null, // BYE
      winner: team, // auto-advanced, no game needed
      status: "COMPLETED",
      dependsOn: [],
    });
    currentRoundMatchIds.push(id);
  });

  for (let i = 0; i < playingTeams.length; i += 2) {
    const id = `M${matchCounter++}`;
    matches.push({
      id,
      round: 1,
      teamA: playingTeams[i],
      teamB: playingTeams[i + 1],
      winner: null,
      status: "SCHEDULED",
      dependsOn: [],
    });
    currentRoundMatchIds.push(id);
  }

  // Build subsequent rounds until we reach the final
  let round = 2;
  while (currentRoundMatchIds.length > 1) {
    const nextRoundMatchIds = [];
    for (let i = 0; i < currentRoundMatchIds.length; i += 2) {
      const id = `M${matchCounter++}`;
      const feederA = currentRoundMatchIds[i];
      const feederB = currentRoundMatchIds[i + 1];

      matches.push({
        id,
        round,
        teamA: null, // resolved once feeders complete
        teamB: null,
        winner: null,
        status: "PENDING",
        dependsOn: [feederA, feederB],
      });

      edges.push({ from: feederA, to: id });
      edges.push({ from: feederB, to: id });
      nextRoundMatchIds.push(id);
    }
    currentRoundMatchIds = nextRoundMatchIds;
    round++;
  }

  return { matches, edges };
}

/**
 * Propagates already-decided winners (from auto-advanced BYE matches) into
 * the matches that depend on them. Without this, a Round 1 BYE match would
 * sit "completed" but its winner would never actually appear in Round 2 —
 * the bracket would look resolved but be functionally stuck. Since the
 * `matches` array is built feeders-first (Round 1 pushed before Round 2,
 * etc.), a single forward pass is sufficient — every dependency is already
 * in the array before its dependent is processed.
 */
function propagateAutoAdvances(matches, edges) {
  const matchById = Object.fromEntries(matches.map((m) => [m.id, m]));
  const dependents = {};
  edges.forEach(({ from, to }) => {
    dependents[from] = dependents[from] || [];
    dependents[from].push(to);
  });

  matches.forEach((m) => {
    if (m.status === "COMPLETED" && m.winner) {
      (dependents[m.id] || []).forEach((depId) => {
        const dep = matchById[depId];
        if (!dep.teamA) dep.teamA = m.winner;
        else if (!dep.teamB) dep.teamB = m.winner;
        if (dep.teamA && dep.teamB) dep.status = "SCHEDULED";
      });
    }
  });
}

/**
 * KAHN'S ALGORITHM
 * Takes the match DAG and produces a round-grouped topological order.
 * Also detects cycles (shouldn't happen in a well-formed bracket, but a
 * malformed/corrupted dependency graph would be caught here — this is
 * the standard safety property Kahn's gives us over a naive ordering).
 */
function kahnTopologicalSort(matches, edges) {
  const inDegree = {};
  const adjacency = {};

  matches.forEach((m) => {
    inDegree[m.id] = 0;
    adjacency[m.id] = [];
  });

  edges.forEach(({ from, to }) => {
    adjacency[from].push(to);
    inDegree[to]++;
  });

  // Start with all nodes that have no dependencies (Round 1 matches)
  let queue = matches.filter((m) => inDegree[m.id] === 0).map((m) => m.id);
  const scheduledRounds = [];
  let processedCount = 0;

  while (queue.length > 0) {
    scheduledRounds.push([...queue]);
    processedCount += queue.length;
    const nextQueue = [];

    for (const matchId of queue) {
      for (const dependent of adjacency[matchId]) {
        inDegree[dependent]--;
        if (inDegree[dependent] === 0) {
          nextQueue.push(dependent);
        }
      }
    }
    queue = nextQueue;
  }

  // Cycle detection: if we didn't process every node, a cycle exists.
  if (processedCount !== matches.length) {
    throw new Error(
      "Cycle detected in match dependency graph — bracket is malformed."
    );
  }

  return scheduledRounds; // array of arrays: scheduledRounds[0] = round 1 match IDs, etc.
}

/**
 * Main entry point: builds the knockout bracket and returns matches
 * annotated with their round number (derived from Kahn's ordering),
 * ready to be persisted and rendered as a bracket tree.
 */
function generateKnockoutSchedule(teamIds) {
  const { matches, edges } = buildKnockoutGraph(teamIds);
  propagateAutoAdvances(matches, edges);
  const scheduledRounds = kahnTopologicalSort(matches, edges);

  const matchById = Object.fromEntries(matches.map((m) => [m.id, m]));

  const scheduled = scheduledRounds.flatMap((roundMatchIds, roundIndex) =>
    roundMatchIds.map((matchId) => ({
      ...matchById[matchId],
      round: roundIndex + 1,
    }))
  );

  return scheduled;
}

module.exports = {
  nextPowerOfTwo,
  buildKnockoutGraph,
  propagateAutoAdvances,
  kahnTopologicalSort,
  generateKnockoutSchedule,
};
