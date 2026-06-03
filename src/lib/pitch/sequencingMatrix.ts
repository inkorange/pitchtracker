// Pitch sequencing matrix: groups pitches into at-bats, walks each
// AB in pitch-number order, and counts every (pitch_n → pitch_n+1)
// transition by pitch type. Drives the Sequencing card in the stats
// view — answers "given an FF was just thrown, what came next?".
//
// Plus a "first pitch" row capturing the unconditional pitch
// distribution at the start of each at-bat (count 0-0). Same
// pitch_type axis as the transition rows so the card reads as one
// consistent table.
//
// Pure function: no side effects, deterministic, safe for both
// server-side computation (in the arsenal endpoint) and client-side
// reuse if we ever want it.

export interface SequencingPitch {
  game_pk: number;
  at_bat_number: number;
  pitch_number: number;
  pitch_type: string | null;
}

export interface SequencingMatrix {
  /** Pitch types in display order — most-used first. */
  pitchTypes: string[];
  /** transitions[fromIdx][toIdx] = count of pitch_type transitions
   *  observed where the previous pitch was pitchTypes[fromIdx] and
   *  the next pitch was pitchTypes[toIdx]. */
  transitions: number[][];
  /** transitionTotals[fromIdx] = sum of transitions[fromIdx][*].
   *  Drives row-normalized cell percentages (conditional
   *  probability given the previous pitch). */
  transitionTotals: number[];
  /** firstPitchCounts[idx] = number of at-bats that opened with
   *  pitchTypes[idx]. */
  firstPitchCounts: number[];
  /** Total at-bats with at least one valid pitch_type. */
  totalAtBats: number;
  /** Total transitions observed (sum of transitionTotals). */
  totalTransitions: number;
}

export function buildSequencingMatrix(
  pitches: SequencingPitch[],
): SequencingMatrix {
  // Group by (game_pk, at_bat_number); sort each AB by pitch_number.
  const byAb = new Map<string, SequencingPitch[]>();
  for (const p of pitches) {
    if (!p.pitch_type) continue;
    const key = `${p.game_pk}-${p.at_bat_number}`;
    let arr = byAb.get(key);
    if (!arr) {
      arr = [];
      byAb.set(key, arr);
    }
    arr.push(p);
  }

  // Per-pitch-type usage counts — used to order the matrix axis by
  // most-thrown first, which makes the busiest cells naturally
  // cluster in the upper-left of the rendered grid.
  const typeUsage = new Map<string, number>();
  for (const p of pitches) {
    if (!p.pitch_type) continue;
    typeUsage.set(p.pitch_type, (typeUsage.get(p.pitch_type) ?? 0) + 1);
  }
  const pitchTypes = Array.from(typeUsage.keys()).sort(
    (a, b) => (typeUsage.get(b) ?? 0) - (typeUsage.get(a) ?? 0),
  );
  const indexByType = new Map(pitchTypes.map((t, i) => [t, i]));

  const N = pitchTypes.length;
  const transitions: number[][] = Array.from({ length: N }, () =>
    Array.from({ length: N }, () => 0),
  );
  const transitionTotals = new Array(N).fill(0);
  const firstPitchCounts = new Array(N).fill(0);
  let totalAtBats = 0;
  let totalTransitions = 0;

  for (const ab of byAb.values()) {
    ab.sort((a, b) => a.pitch_number - b.pitch_number);
    if (ab.length === 0) continue;
    totalAtBats += 1;

    // First-pitch tally.
    const firstIdx = indexByType.get(ab[0].pitch_type!);
    if (firstIdx !== undefined) firstPitchCounts[firstIdx] += 1;

    // Walk consecutive pairs.
    for (let i = 1; i < ab.length; i++) {
      const fromIdx = indexByType.get(ab[i - 1].pitch_type!);
      const toIdx = indexByType.get(ab[i].pitch_type!);
      if (fromIdx === undefined || toIdx === undefined) continue;
      transitions[fromIdx][toIdx] += 1;
      transitionTotals[fromIdx] += 1;
      totalTransitions += 1;
    }
  }

  return {
    pitchTypes,
    transitions,
    transitionTotals,
    firstPitchCounts,
    totalAtBats,
    totalTransitions,
  };
}
