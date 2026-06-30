// Source of truth for the at-bat-result filter on the pitcher page.
// Each chip is a single URL value that expands into one or more MLB
// event values. Keeps the UI labels and the server-side filter logic
// in sync from one definition.
//
// The URL is the source of truth for filter state. The chip `key` is
// what's stored in `?event=...`; the matching `events` array is what
// the filter compares each pitch's `events` column against. Only the
// terminating pitch of an at-bat has a non-null `events`, so the
// filter naturally narrows to one pitch per matching at-bat.

import type { OutcomeCategory } from "@/lib/viz/colors";

export interface AtBatEventChip {
  /** URL value. Kept short + readable. */
  key: string;
  /** UI label rendered on the chip on desktop. */
  label: string;
  /** Compact label rendered on the chip below the `sm` breakpoint. */
  shortLabel: string;
  /** MLB event values this chip resolves to. */
  events: readonly string[];
}

export const AT_BAT_EVENT_CHIPS: readonly AtBatEventChip[] = [
  {
    key: "strikeout",
    label: "Strikeout",
    shortLabel: "K",
    // K_DP is a strikeout where another runner is also retired —
    // viewers asking for "strikeouts" expect both.
    events: ["strikeout", "strikeout_double_play"],
  },
  {
    key: "walk",
    label: "Walk",
    shortLabel: "BB",
    events: ["walk", "intent_walk"],
  },
  {
    key: "hit",
    label: "Hit",
    shortLabel: "H",
    events: ["single", "double", "triple", "home_run"],
  },
  {
    key: "home_run",
    label: "Home run",
    shortLabel: "HR",
    events: ["home_run"],
  },
  {
    key: "out",
    label: "Out",
    shortLabel: "Out",
    events: [
      "field_out",
      "force_out",
      "fielders_choice",
      "fielders_choice_out",
      "grounded_into_double_play",
      "double_play",
      "triple_play",
      "sac_fly",
      "sac_bunt",
    ],
  },
  {
    key: "hit_by_pitch",
    label: "HBP",
    shortLabel: "HBP",
    events: ["hit_by_pitch"],
  },
];

/**
 * Expand a list of chip keys (or raw MLB event values, in case the URL
 * was set by the AI deep-linker) into the full Set of MLB events that
 * a pitch's at-bat must terminate in for the filter to match.
 */
export function expandAtBatEvents(chipKeysOrEvents: string[]): Set<string> {
  const out = new Set<string>();
  for (const v of chipKeysOrEvents) {
    const chip = AT_BAT_EVENT_CHIPS.find((c) => c.key === v);
    if (chip) {
      for (const e of chip.events) out.add(e);
    } else {
      // Raw MLB event value the AI may have produced — keep verbatim.
      out.add(v);
    }
  }
  return out;
}

// Which per-pitch outcome categories can physically be the terminating
// pitch's outcome for an at-bat that ended in each result. Drives
// (a) graying out incompatible Outcome chips while an at-bat result
// is active and (b) auto-pruning the URL state when the user picks an
// at-bat result that invalidates their current outcome selection.
//
// Reasoning per row:
//  - strikeout    → terminating pitch is K-swinging (whiff) or K-looking (called)
//  - walk         → terminating pitch is ball 4 (ball)
//  - hit/HR/out   → terminating pitch is hit_into_play (inplay)
//  - hit_by_pitch → terminating pitch description "hit_by_pitch" categorizes as "ball"
export const AT_BAT_RESULT_COMPATIBLE_OUTCOMES: Record<
  string,
  readonly OutcomeCategory[]
> = {
  strikeout: ["whiff", "called"],
  walk: ["ball"],
  hit: ["inplay"],
  home_run: ["inplay"],
  out: ["inplay"],
  hit_by_pitch: ["ball"],
};

/**
 * Given the user's selected at-bat result chip keys, return the union
 * of outcome categories that can be the terminating pitch's outcome
 * for any matching at-bat. Returns `null` when no at-bat result is
 * selected (no restriction; all outcomes valid).
 */
export function compatibleOutcomesForAtBatEvents(
  chipKeys: string[],
): Set<OutcomeCategory> | null {
  if (chipKeys.length === 0) return null;
  const out = new Set<OutcomeCategory>();
  for (const k of chipKeys) {
    const compat = AT_BAT_RESULT_COMPATIBLE_OUTCOMES[k];
    if (compat) for (const o of compat) out.add(o);
  }
  return out;
}

/**
 * Given the set of terminating MLB events present in some at-bat list
 * (e.g. every at-bat in a game, or every at-bat by a specific pitcher),
 * return the set of chip keys that have at least one matching at-bat.
 * Drives the disabled state on the at-bat-result chip UI so chips that
 * would always produce an empty result aren't clickable.
 */
export function availableAtBatResultChips(
  events: Iterable<string | null | undefined>,
): Set<string> {
  const present = new Set<string>();
  for (const e of events) {
    if (e != null && e.length > 0) present.add(e);
  }
  const out = new Set<string>();
  for (const chip of AT_BAT_EVENT_CHIPS) {
    if (chip.events.some((e) => present.has(e))) out.add(chip.key);
  }
  return out;
}

/**
 * Human-readable label for an at-bat's terminating outcome, using both
 * the MLB `events` string (canonical result) and the LAST PITCH's
 * `description` to differentiate the kind of strikeout.
 *
 *   strikeout       + called_strike            → "Strikeout (L)"  (looking)
 *   strikeout       + swinging_strike / blocked → "Strikeout (S)"  (swinging)
 *   strikeout       + foul_tip                  → "Strikeout (F)"  (foul tip)
 *   strikeout_dp    + (same)                    → "Strikeout DP (X)"
 *   everything else → events (if non-empty) else description, snake → Title Case
 *
 * Single source of truth so the pill on both the at-bat page sidebar
 * and the pitcher-page matchups list reads consistently.
 */
export function formatAtBatResultLabel(
  events: string | null | undefined,
  description: string | null | undefined,
): string {
  if (events === "strikeout" || events === "strikeout_double_play") {
    const base = events === "strikeout_double_play" ? "Strikeout DP" : "Strikeout";
    const suffix = strikeoutSuffix(description);
    return suffix ? `${base} (${suffix})` : base;
  }
  const raw = events && events.length > 0 ? events : description;
  if (!raw) return "—";
  return raw
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function strikeoutSuffix(
  description: string | null | undefined,
): "L" | "S" | "F" | null {
  switch (description) {
    case "called_strike":
      return "L";
    case "swinging_strike":
    case "swinging_strike_blocked":
    case "missed_bunt":
      return "S";
    case "foul_tip":
      return "F";
    default:
      return null;
  }
}
