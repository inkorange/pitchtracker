// Typed client for Baseball Savant (baseballsavant.mlb.com).
// Two endpoints in MVP scope:
//   1. Search CSV — pitch-by-pitch trajectory data, for a single game (the
//      hybrid pitch fetcher path) or a wider filter set (Phase 5 mining).
//   2. Player services — pre-computed pitcher arsenal aggregates.

import Papa from "papaparse";
import type { StatcastRow } from "@/lib/pitch/Pitch";

const SEARCH_BASE = "https://baseballsavant.mlb.com/statcast_search/csv";

// Subset of Savant's CSV columns we keep. The CSV has ~80 columns; we only
// need these for trajectory + outcome rendering.
export interface SavantPitchRow extends StatcastRow {
  game_pk: number;
  game_date: string;
  // R, S, E, F, D, L, W, A — see pitch_games migrations for the codes.
  game_type: string | null;
  pitcher: number;
  batter: number;
  at_bat_number: number;
  pitch_number: number;
  balls: number;
  strikes: number;
  outs_when_up: number;
  inning: number;
  inning_topbot: string;
  on_1b: number | null;
  on_2b: number | null;
  on_3b: number | null;
  release_extension: number | null;
  delta_run_exp: number | null;
  home_team: string | null;
  away_team: string | null;
}

const NUMERIC_FIELDS = [
  "release_pos_x",
  "release_pos_y",
  "release_pos_z",
  "vx0",
  "vy0",
  "vz0",
  "ax",
  "ay",
  "az",
  "plate_x",
  "plate_z",
  "release_speed",
  "release_spin_rate",
  "spin_axis",
  "pfx_x",
  "pfx_z",
  "balls",
  "strikes",
  "outs_when_up",
  "inning",
  "at_bat_number",
  "pitch_number",
  "game_pk",
  "pitcher",
  "batter",
  "on_1b",
  "on_2b",
  "on_3b",
  "release_extension",
  "delta_run_exp",
] as const;

function parseNum(v: string): number | null {
  if (v === "" || v === "null" || v === "NA") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Parse Savant's CSV via papaparse. The Savant CSV has a BOM, quoted
// fields, and embedded commas inside quoted strings (e.g. "Laureano, Ramón"),
// so a naive split breaks. papaparse handles all of those plus type coercion.
export function parseCsv(csv: string): Record<string, string>[] {
  const result = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.replace(/^﻿/, "").trim(),
  });
  return result.data;
}

export function castRow(raw: Record<string, string>): SavantPitchRow {
  const cast: Record<string, unknown> = { ...raw };
  for (const f of NUMERIC_FIELDS) {
    if (f in raw) {
      cast[f] = parseNum(raw[f]);
    }
  }
  return cast as unknown as SavantPitchRow;
}

// Fetch all pitches for a single game.
export async function fetchGamePitches(gamePk: number): Promise<SavantPitchRow[]> {
  const params = new URLSearchParams({
    all: "true",
    type: "details",
    game_pk: String(gamePk),
  });
  const url = `${SEARCH_BASE}?${params}`;
  return fetchSavantCsv(url, `game ${gamePk}`);
}

// Fetch all of a pitcher's pitches for a given season. Used by the
// on-demand backfill when a pitcher × season has no cached data yet.
//
// hfGT=R%7C restricts to regular-season games only (pipe-separated
// list of game-type codes; R is "Regular Season"). This drops spring
// training and exhibition pitches at the source so we don't ingest
// data the UI doesn't surface anyway. Add PO%7C to include
// postseason if/when we want it.
export async function fetchPitcherSeasonPitches(
  pitcherId: number,
  season: number,
): Promise<SavantPitchRow[]> {
  // pitchers_lookup[] needs the literal brackets, which URLSearchParams
  // would percent-encode as %5B%5D — Savant accepts both, but we build
  // the URL manually here to keep it readable.
  const url = `${SEARCH_BASE}?all=true&type=details&hfSea=${season}%7C&hfGT=R%7C&player_type=pitcher&pitchers_lookup%5B%5D=${pitcherId}`;
  return fetchSavantCsv(url, `pitcher ${pitcherId} season ${season}`);
}

async function fetchSavantCsv(url: string, label: string): Promise<SavantPitchRow[]> {
  const res = await fetch(url, {
    headers: {
      Accept: "text/csv",
      "User-Agent": "pitchtracker/0.1 (+https://github.com/inkorange/pitchtracker)",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Savant CSV ${res.status} for ${label}`);
  }
  const csv = await res.text();
  return parseCsv(csv).map(castRow);
}

// Fetch a pitcher's player-services arsenal aggregates for a season.
// Returns the raw JSON; the cron route handler shapes it into our table rows.
interface PlayerServicesRow {
  pitch_type: string;
  pitch_name?: string;
  player_id: number;
  year: number;
  pitches?: number;
  pitch_usage?: number;
  velocity?: number;
  spin_rate?: number;
  v_break?: number;
  h_break?: number;
  ivb?: number;
  whiff_percent?: number;
  k_percent?: number;
  put_away?: number;
  woba?: number;
  xwoba?: number;
  ba?: number;
  xba?: number;
  run_value_per_100?: number;
}

export async function fetchPitcherAggregates(
  playerId: number,
  season: number,
): Promise<PlayerServicesRow[]> {
  const url = `https://baseballsavant.mlb.com/player-services/statcast?playerId=${playerId}&year=${season}&position=P`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Savant player-services ${res.status} for player ${playerId}`);
  }
  const data = (await res.json()) as { stats?: PlayerServicesRow[] } | PlayerServicesRow[];
  if (Array.isArray(data)) return data;
  return data.stats ?? [];
}

export type { PlayerServicesRow };
