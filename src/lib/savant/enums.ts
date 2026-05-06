// Curated enum sets for the /explore form. These are the values the
// search UI exposes to users — Statcast itself accepts more codes
// (e.g. legacy pitch types, internal pitch_call states), but most are
// either redundant for the public dataset or surface zero rows. The
// labels are user-facing strings rendered in the form.

export interface EnumOption<T extends string | number = string> {
  value: T;
  label: string;
}

// Statcast 2-letter pitch codes the public CSV emits. Source: Savant
// pitch type abbreviations table. UN ("Unidentified") shows up for
// older seasons or video-tagging gaps; we keep it so users can filter
// the noise out of comparisons.
export const PITCH_TYPES: EnumOption[] = [
  { value: "FF", label: "4-Seam Fastball" },
  { value: "SI", label: "Sinker" },
  { value: "FC", label: "Cutter" },
  { value: "FS", label: "Splitter" },
  { value: "FA", label: "Fastball (other)" },
  { value: "SL", label: "Slider" },
  { value: "ST", label: "Sweeper" },
  { value: "SV", label: "Slurve" },
  { value: "CU", label: "Curveball" },
  { value: "KC", label: "Knuckle Curve" },
  { value: "CS", label: "Slow Curve" },
  { value: "CH", label: "Changeup" },
  { value: "FO", label: "Forkball" },
  { value: "SC", label: "Screwball" },
  { value: "EP", label: "Eephus" },
  { value: "KN", label: "Knuckleball" },
  { value: "UN", label: "Unidentified" },
];

// 12 base + ball / 12 strike combinations.
export const COUNTS: EnumOption[] = [
  { value: "0-0", label: "0-0" },
  { value: "0-1", label: "0-1" },
  { value: "0-2", label: "0-2" },
  { value: "1-0", label: "1-0" },
  { value: "1-1", label: "1-1" },
  { value: "1-2", label: "1-2" },
  { value: "2-0", label: "2-0" },
  { value: "2-1", label: "2-1" },
  { value: "2-2", label: "2-2" },
  { value: "3-0", label: "3-0" },
  { value: "3-1", label: "3-1" },
  { value: "3-2", label: "3-2" },
];

// Per-pitch result. The `description` column on each pitch row.
export const DESCRIPTIONS: EnumOption[] = [
  { value: "ball", label: "Ball" },
  { value: "blocked_ball", label: "Blocked ball" },
  { value: "called_strike", label: "Called strike" },
  { value: "swinging_strike", label: "Swinging strike" },
  { value: "swinging_strike_blocked", label: "Swinging strike (blocked)" },
  { value: "foul", label: "Foul" },
  { value: "foul_tip", label: "Foul tip" },
  { value: "foul_bunt", label: "Foul bunt" },
  { value: "missed_bunt", label: "Missed bunt" },
  { value: "hit_into_play", label: "Hit into play" },
  { value: "hit_by_pitch", label: "Hit by pitch" },
  { value: "pitchout", label: "Pitchout" },
];

// At-bat-level event. The `events` column on the final pitch of each AB.
export const EVENTS: EnumOption[] = [
  { value: "single", label: "Single" },
  { value: "double", label: "Double" },
  { value: "triple", label: "Triple" },
  { value: "home_run", label: "Home run" },
  { value: "walk", label: "Walk" },
  { value: "intent_walk", label: "Intentional walk" },
  { value: "hit_by_pitch", label: "Hit by pitch" },
  { value: "strikeout", label: "Strikeout" },
  { value: "strikeout_double_play", label: "Strikeout DP" },
  { value: "field_out", label: "Field out" },
  { value: "force_out", label: "Force out" },
  { value: "fielders_choice", label: "Fielder's choice" },
  { value: "fielders_choice_out", label: "Fielder's choice (out)" },
  { value: "grounded_into_double_play", label: "Grounded into DP" },
  { value: "double_play", label: "Double play" },
  { value: "triple_play", label: "Triple play" },
  { value: "sac_fly", label: "Sacrifice fly" },
  { value: "sac_bunt", label: "Sacrifice bunt" },
  { value: "field_error", label: "Field error" },
  { value: "catcher_interf", label: "Catcher's interference" },
];

export const BATTED_BALL_TYPES: EnumOption[] = [
  { value: "ground_ball", label: "Ground ball" },
  { value: "line_drive", label: "Line drive" },
  { value: "fly_ball", label: "Fly ball" },
  { value: "popup", label: "Popup" },
];

// Game type codes — R = regular season is the dominant case; the rest
// are postseason / spring / exhibition / all-star. Phase 5 defaults
// the form to R only; advanced users can opt into the others.
export const GAME_TYPES: EnumOption[] = [
  { value: "R", label: "Regular season" },
  { value: "F", label: "Wild card" },
  { value: "D", label: "Division series" },
  { value: "L", label: "League championship" },
  { value: "W", label: "World Series" },
  { value: "S", label: "Spring training" },
  { value: "E", label: "Exhibition" },
  { value: "A", label: "All-star" },
];

// Statcast attack-zone codes. 1–9 paint the strike zone (top-left to
// bottom-right reading). 11–14 are the four "shadow" quadrants outside
// the zone.
export const ZONES: EnumOption<number>[] = [
  { value: 1, label: "1 (high-in)" },
  { value: 2, label: "2 (high-mid)" },
  { value: 3, label: "3 (high-out)" },
  { value: 4, label: "4 (mid-in)" },
  { value: 5, label: "5 (middle)" },
  { value: 6, label: "6 (mid-out)" },
  { value: 7, label: "7 (low-in)" },
  { value: 8, label: "8 (low-mid)" },
  { value: 9, label: "9 (low-out)" },
  { value: 11, label: "11 (chase up-in)" },
  { value: 12, label: "12 (chase up-out)" },
  { value: 13, label: "13 (chase down-in)" },
  { value: 14, label: "14 (chase down-out)" },
];
