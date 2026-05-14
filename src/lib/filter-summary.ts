// Renders the pitcher-page filter state as a human-readable phrase
// shown above the arsenal panel. Lets viewers see what they're looking
// at without having to read the URL or count chips. Pairs nicely with
// shareable links — the recipient sees "All strikeouts from 2026-04-27
// vs Boston Red Sox" instead of figuring out the query string.

import {
  type OutcomeCategory,
  OUTCOME_LABELS,
  getPitchLabel,
} from "@/lib/viz/colors";

export interface FilterSummaryInput {
  season: number;
  pitchTypes: string[];        // pitch-type codes
  outcomes: OutcomeCategory[];
  events: string[];            // at-bat-result chip keys
  hand: "L" | "R" | null;
  game: { game_date: string; opponentName: string | null } | null;
  veloMin: number | null;
  veloMax: number | null;
}

// Hand-curated plurals so the summary reads naturally — bare "+s" mangles
// "Hit by pitch" → "Hit by pitchs" and "In play" → "In plays".
const EVENT_PLURALS: Record<string, string> = {
  strikeout: "strikeouts",
  walk: "walks",
  hit: "hits",
  home_run: "home runs",
  out: "outs",
  hit_by_pitch: "hit-by-pitches",
};

const OUTCOME_PLURALS: Record<OutcomeCategory, string> = {
  whiff: "Swinging strikes",
  called: "Called strikes",
  ball: "Balls",
  foul: "Foul balls",
  inplay: "Balls in play",
  other: "Other pitches",
};

function pluralPitchLabel(code: string): string {
  return `${getPitchLabel(code)}s`;
}

function joinWithPlus(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} + ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} + ${items[items.length - 1]}`;
}

export function buildFilterSummary(input: FilterSummaryInput): string {
  const parts: string[] = [];

  // Subject. Priority: at-bat result → outcome → pitch type → fallback.
  // Whichever is the "leading noun" gets pluralized; pitch type may
  // also appear later as a modifier when an event/outcome subject leads.
  let pitchTypesConsumed = false;
  let outcomesConsumed = false;
  if (input.events.length > 0) {
    const labels = input.events.map(
      (k) => EVENT_PLURALS[k] ?? `${k.replace(/_/g, " ")}s`,
    );
    parts.push(`All ${joinWithPlus(labels)}`);
  } else if (input.outcomes.length > 0) {
    parts.push(
      joinWithPlus(input.outcomes.map((o) => OUTCOME_PLURALS[o] ?? OUTCOME_LABELS[o])),
    );
    outcomesConsumed = true;
  } else if (input.pitchTypes.length > 0) {
    parts.push(joinWithPlus(input.pitchTypes.map(pluralPitchLabel)));
    pitchTypesConsumed = true;
  } else {
    parts.push("All pitches");
  }

  // When at-bat result is the subject, outcomes are still meaningful as
  // a refinement ("All strikeouts ending in a swinging strike"). Render
  // them parenthetically so the phrase stays readable.
  if (!outcomesConsumed && input.outcomes.length > 0) {
    const labels = input.outcomes.map(
      (o) => OUTCOME_LABELS[o]?.toLowerCase() ?? o,
    );
    parts.push(`ending in a ${joinWithPlus(labels)}`);
  }

  if (!pitchTypesConsumed && input.pitchTypes.length > 0) {
    parts.push(`on ${joinWithPlus(input.pitchTypes.map(pluralPitchLabel))}`);
  }

  if (input.veloMin != null && input.veloMax != null) {
    parts.push(`between ${input.veloMin}-${input.veloMax} mph`);
  } else if (input.veloMin != null) {
    parts.push(`over ${input.veloMin} mph`);
  } else if (input.veloMax != null) {
    parts.push(`under ${input.veloMax} mph`);
  }

  if (input.hand === "L") parts.push("vs LHB");
  else if (input.hand === "R") parts.push("vs RHB");

  if (input.game) {
    const opp = input.game.opponentName ? ` vs ${input.game.opponentName}` : "";
    parts.push(`from ${input.game.game_date}${opp}`);
  } else {
    parts.push(`in ${input.season}`);
  }

  return parts.join(" ");
}
