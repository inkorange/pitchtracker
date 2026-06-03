// Per-game sequencing drift — answers "did he change his approach
// today?". For each game, we build the same (first-pitch + transition)
// matrix the season-level Sequencing card uses and measure how far
// it sits from the season baseline. Spikes in the timeline read as
// "he changed his approach that day".
//
// Distance metric: Total Variation Distance (TVD).
//   TVD(p, q) = 0.5 * sum_i |p_i - q_i|
//
// We picked TVD over KL-divergence for two reasons:
//   1. Interpretation: TVD * 100 reads as "X% of the distribution
//      shifted" — natural to surface in a tooltip.
//   2. KL blows up when a season-side probability is zero (the model
//      thought a pitch never appeared, but the game shows it). TVD
//      stays well-defined.
//
// Aggregation across the matrix:
//   - First-pitch row: TVD between the per-game and season
//     first-pitch distributions.
//   - Each "after X" row: TVD between per-game and season "next
//     pitch | X" distributions. Weighted by that row's per-game
//     observation count so a high-volume row (after FF, 40+ pairs)
//     dominates a sparsely-thrown row (after FO, 2 pairs).
//   - Overall game drift: count-weighted average of all rows above.
//
// Output is in [0, 1]. 0 = identical to season; 1 = totally
// different (e.g. season throws only FF first pitch, today he led
// with only SL).

import {
  buildSequencingMatrix,
  type SequencingMatrix,
  type SequencingPitch,
} from "./sequencingMatrix";

/** Pitches must carry their game's date so we can render the
 *  drift series chronologically. Same `game_pk` will share a
 *  date so duplicates per game are fine. */
export interface DriftPitch extends SequencingPitch {
  game_date: string;
}

export interface GameDrift {
  game_pk: number;
  game_date: string;
  /** Total pitches thrown in this game by the pitcher (within the
   *  current filter scope — season, hand, etc.). */
  pitchCount: number;
  /** Total at-bats walked in this game's matrix. Drives the dot size
   *  in the timeline so a partial-game appearance doesn't visually
   *  shout louder than a complete start. */
  atBatCount: number;
  /** Total transitions observed (consecutive-pair count). Used as
   *  a secondary sample-size threshold — a 1-AB relief outing has
   *  few pairs and a noisy drift; we filter those out before
   *  rendering. */
  transitionCount: number;
  /** Per-game drift in [0, 1]. 0 = matches season, higher = more
   *  divergent. */
  drift: number;
}

export interface SequencingDrift {
  /** Chronological list of per-game drift values (most recent last
   *  so the timeline reads left-to-right). */
  games: GameDrift[];
  /** Minimum pitch count required to include a game. */
  minPitchesPerGame: number;
  /** Minimum transition count required to include a game. */
  minTransitionsPerGame: number;
  /** Pitcher's overall season matrix is the baseline — surfaced for
   *  callers that want to render the season distribution alongside
   *  the timeline (not used in the card today but useful for the AI
   *  tool's response shape). */
  seasonAtBats: number;
}

/** Below these thresholds a game's matrix is too noisy to compare
 *  to the season cleanly — a 3-pitch relief appearance shouldn't
 *  show up as a 95% drift spike. */
export const MIN_PITCHES_PER_GAME = 20;
export const MIN_TRANSITIONS_PER_GAME = 10;

export function buildSequencingDrift(pitches: DriftPitch[]): SequencingDrift {
  // Season baseline — same function the card uses.
  const seasonMatrix = buildSequencingMatrix(pitches);

  // Bucket by game; track date.
  const byGame = new Map<
    number,
    { game_date: string; pitches: DriftPitch[] }
  >();
  for (const p of pitches) {
    let bucket = byGame.get(p.game_pk);
    if (!bucket) {
      bucket = { game_date: p.game_date, pitches: [] };
      byGame.set(p.game_pk, bucket);
    }
    bucket.pitches.push(p);
  }

  const games: GameDrift[] = [];
  for (const [game_pk, { game_date, pitches: gamePitches }] of byGame) {
    const gameMatrix = buildSequencingMatrix(gamePitches);
    const drift = tvdAgainstSeason(gameMatrix, seasonMatrix);
    games.push({
      game_pk,
      game_date,
      pitchCount: gamePitches.length,
      atBatCount: gameMatrix.totalAtBats,
      transitionCount: gameMatrix.totalTransitions,
      drift,
    });
  }

  // Chronological — left-to-right reads as oldest-to-newest, matching
  // how a baseball season is usually visualized.
  games.sort((a, b) => a.game_date.localeCompare(b.game_date));

  return {
    games,
    minPitchesPerGame: MIN_PITCHES_PER_GAME,
    minTransitionsPerGame: MIN_TRANSITIONS_PER_GAME,
    seasonAtBats: seasonMatrix.totalAtBats,
  };
}

// Aligns the game matrix to the season's pitch-type axis (the
// season is the full set; the game may be missing some types).
// Then computes count-weighted TVD across all rows.
function tvdAgainstSeason(
  game: SequencingMatrix,
  season: SequencingMatrix,
): number {
  if (season.pitchTypes.length === 0) return 0;
  if (game.totalAtBats === 0) return 0;

  // Season pitch-type index for axis alignment.
  const seasonIdx = new Map(season.pitchTypes.map((t, i) => [t, i]));

  // Game's per-axis distributions, normalized to the season's axis
  // (any pitch type the game didn't throw is 0 for the cell).
  const gameFirst = new Array(season.pitchTypes.length).fill(0);
  let gameFirstTotal = 0;
  for (const c of game.firstPitchCounts) gameFirstTotal += c;
  if (gameFirstTotal > 0) {
    for (let i = 0; i < game.pitchTypes.length; i++) {
      const seasonI = seasonIdx.get(game.pitchTypes[i]);
      if (seasonI != null) {
        gameFirst[seasonI] = game.firstPitchCounts[i] / gameFirstTotal;
      }
    }
  }

  const seasonFirst = new Array(season.pitchTypes.length).fill(0);
  let seasonFirstTotal = 0;
  for (const c of season.firstPitchCounts) seasonFirstTotal += c;
  if (seasonFirstTotal > 0) {
    for (let i = 0; i < season.pitchTypes.length; i++) {
      seasonFirst[i] = season.firstPitchCounts[i] / seasonFirstTotal;
    }
  }

  let weightedSum = 0;
  let totalWeight = 0;

  // Weight first-pitch row by the game's first-pitch count.
  const firstTvd = tvd(gameFirst, seasonFirst);
  weightedSum += firstTvd * gameFirstTotal;
  totalWeight += gameFirstTotal;

  // Each "after X" row, aligned and weighted.
  for (let i = 0; i < game.pitchTypes.length; i++) {
    const seasonRowIdx = seasonIdx.get(game.pitchTypes[i]);
    if (seasonRowIdx == null) continue;
    const gameRowTotal = game.transitionTotals[i];
    if (gameRowTotal === 0) continue;
    const seasonRowTotal = season.transitionTotals[seasonRowIdx];
    if (seasonRowTotal === 0) continue;

    const gameProbs = new Array(season.pitchTypes.length).fill(0);
    for (let j = 0; j < game.pitchTypes.length; j++) {
      const seasonColIdx = seasonIdx.get(game.pitchTypes[j]);
      if (seasonColIdx != null) {
        gameProbs[seasonColIdx] = game.transitions[i][j] / gameRowTotal;
      }
    }
    const seasonProbs = season.transitions[seasonRowIdx].map(
      (n) => n / seasonRowTotal,
    );

    const rowTvd = tvd(gameProbs, seasonProbs);
    weightedSum += rowTvd * gameRowTotal;
    totalWeight += gameRowTotal;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

function tvd(p: number[], q: number[]): number {
  if (p.length !== q.length) return 1;
  let sum = 0;
  for (let i = 0; i < p.length; i++) sum += Math.abs(p[i] - q[i]);
  return sum / 2;
}
