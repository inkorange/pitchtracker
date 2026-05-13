// Source of truth for the at-bat-result filter on the pitcher page.
// Each chip is a single URL value that expands into one or more MLB
// event values. Keeps the UI labels and the server-side filter logic
// in sync from one definition.
//
// The URL is the source of truth for filter state. The chip `key` is
// what's stored in `?event=...`; the matching `events` array is what
// the filter compares each at-bat's terminating `events` column against.

export interface AtBatEventChip {
  /** URL value. Kept short + readable. */
  key: string;
  /** UI label rendered on the chip. */
  label: string;
  /** MLB event values this chip resolves to. */
  events: readonly string[];
}

export const AT_BAT_EVENT_CHIPS: readonly AtBatEventChip[] = [
  {
    key: "strikeout",
    label: "Strikeout",
    // K_DP is a strikeout where another runner is also retired —
    // viewers asking for "strikeouts" expect both.
    events: ["strikeout", "strikeout_double_play"],
  },
  {
    key: "walk",
    label: "Walk",
    events: ["walk", "intent_walk"],
  },
  {
    key: "hit",
    label: "Hit",
    events: ["single", "double", "triple", "home_run"],
  },
  {
    key: "home_run",
    label: "Home run",
    events: ["home_run"],
  },
  {
    key: "out",
    label: "Out",
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
