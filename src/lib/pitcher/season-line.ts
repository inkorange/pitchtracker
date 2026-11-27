// The pitcher rail's stat strip (K / Whiff% / CSW% / FB mph), computed
// from the season's pitches with exactly the homepage leaderboard
// definitions (pitch_recompute_rankings): regular-season games only;
// Whiff% = swinging_strike / pitches; CSW% = (swinging_strike +
// called_strike) / pitches; K = strikeout events.

import { matchesSeasonType, type SeasonType } from "./season-type";

export interface LinePitch {
  description: string | null;
  events: string | null;
  pitch_type: string | null;
  release_speed: number | null;
  game_type?: string | null;
}

export interface SeasonLine {
  pitches: number;
  strikeouts: number;
  whiffPct: number | null;
  cswPct: number | null;
  fbMph: number | null;
}

const FB_ORDER = ["FF", "SI", "FC"];
const r1 = (n: number) => Math.round(n * 10) / 10;

/** `st` picks the games counted — regular season by default. */
export function seasonLine(all: LinePitch[], st: SeasonType = "reg"): SeasonLine {
  const ps = all.filter((p) => matchesSeasonType(p.game_type, st));
  const n = ps.length;
  const sw = ps.filter((p) => p.description === "swinging_strike").length;
  const cs = ps.filter((p) => p.description === "called_strike").length;
  const k = ps.filter((p) => p.events === "strikeout" || p.events === "strikeout_double_play").length;
  let fbMph: number | null = null;
  for (const t of FB_ORDER) {
    const v = ps.filter((p) => p.pitch_type === t && p.release_speed != null).map((p) => p.release_speed as number);
    if (v.length) {
      fbMph = r1(v.reduce((a, b) => a + b, 0) / v.length);
      break;
    }
  }
  return {
    pitches: n,
    strikeouts: k,
    whiffPct: n ? r1((sw / n) * 100) : null,
    cswPct: n ? r1(((sw + cs) / n) * 100) : null,
    fbMph,
  };
}
