// Data-templated pitcher bio. Used in two places:
//
//   1. /pitcher/{id}/{slug} page chrome — rendered server-side inside
//      a HelpButton popover so the bio text is in the SSR'd HTML
//      (crawlable) while staying hidden behind an (i) affordance on
//      first paint.
//
//   2. /pitcher/{id}/{slug} `generateMetadata` keywords field.
//
// Pure, deterministic, no API calls. All inputs come from
// pitch_pitchers + pitch_teams + pitch_pitcher_aggregates rows that
// the page already fetches.

import { getPitchLabel } from "@/lib/viz/colors";

export interface PitcherBioInput {
  name: string;
  throws: "L" | "R" | null;
  teamName: string | null;
  debutYear: number | null;
  lastActiveYear: number | null;
  /** Year we're showing on the page. Used in the arsenal sentence
   *  ("his 2026 arsenal ..."). */
  season: number;
  /** Year we resolved the aggregates from (may be < `season` if the
   *  current season hasn't been populated yet — early offseason, etc).
   *  When this differs from `season`, the arsenal sentence references
   *  the resolved year so the prose doesn't claim 2026 data that
   *  doesn't exist yet. */
  aggregatesSeason: number;
  /** Top-N pitches by usage, already ordered. Velocity is in mph
   *  (we round to a whole number in the prose). */
  topPitches: Array<{
    pitchType: string;
    avgVelocity: number | null;
  }>;
  /** Total pitches the pitcher has thrown in `aggregatesSeason` —
   *  optional context for the closing sentence. Falsy values omit it. */
  seasonPitchCount?: number | null;
}

/**
 * Build the bio as an array of paragraph strings. Callers render each
 * paragraph as its own `<p>` element (in the HelpButton popover) or
 * glue them together for the keywords / description string.
 */
export function buildPitcherBio(input: PitcherBioInput): string[] {
  const out: string[] = [];

  // 1. Identity sentence — name + role + team + debut/active years.
  //    For active pitchers we lead with present tense; retired pitchers
  //    get a past-tense framing with the active-year range when known.
  const handLabel =
    input.throws === "L"
      ? "left-handed"
      : input.throws === "R"
        ? "right-handed"
        : null;
  const role =
    handLabel && input.teamName
      ? `a ${handLabel} pitcher for the ${input.teamName}`
      : handLabel
        ? `a ${handLabel} MLB pitcher`
        : input.teamName
          ? `an MLB pitcher for the ${input.teamName}`
          : "an MLB pitcher";

  const isCurrent =
    input.lastActiveYear == null || input.lastActiveYear >= input.season;
  if (isCurrent) {
    const debut = input.debutYear
      ? ` who made his MLB debut in ${input.debutYear}`
      : "";
    out.push(`${input.name} is ${role}${debut}.`);
  } else {
    const fromTo =
      input.debutYear && input.lastActiveYear
        ? ` from ${input.debutYear} to ${input.lastActiveYear}`
        : input.lastActiveYear
          ? ` through ${input.lastActiveYear}`
          : "";
    // Past tense for the role phrase.
    const roleWas = role.replace(/^a /, "was a ").replace(/^an /, "was an ");
    out.push(`${input.name} ${roleWas}${fromTo}.`);
  }

  // 2. Arsenal sentence — lead pitch + velocity, then the rest comma-listed.
  //    Skip entirely when we have no aggregates for any season.
  if (input.topPitches.length > 0) {
    const lead = input.topPitches[0];
    const leadLabel = getPitchLabel(lead.pitchType);
    const leadVelo =
      lead.avgVelocity != null
        ? `${Math.round(lead.avgVelocity)} mph`
        : null;
    const leadPhrase = leadVelo
      ? `a ${leadLabel} fastball averaging ${leadVelo}`
      : `a ${leadLabel}`;
    const rest = input.topPitches.slice(1).map((p) => getPitchLabel(p.pitchType));
    const restPhrase =
      rest.length === 0
        ? ""
        : rest.length === 1
          ? `, plus a ${rest[0]}`
          : rest.length === 2
            ? `, plus a ${rest[0]} and ${rest[1]}`
            : `, plus a ${rest.slice(0, -1).join(", a ")}, and ${rest[rest.length - 1]}`;
    const yearRef =
      input.aggregatesSeason === input.season
        ? `His ${input.season} arsenal`
        : `His ${input.aggregatesSeason} arsenal`;
    out.push(`${yearRef} features ${leadPhrase}${restPhrase}.`);
  }

  // 3. Optional volume sentence — only when meaningful.
  if (input.seasonPitchCount && input.seasonPitchCount >= 100) {
    out.push(
      `pitchtracker has indexed ${input.seasonPitchCount.toLocaleString()} of his ${input.aggregatesSeason} pitches.`,
    );
  }

  return out;
}

/**
 * Build the `<meta name="keywords">` string for a pitcher page. Lists
 * the pitcher under common search phrasings, the team, every pitch
 * type they throw, and a few stable site-wide terms. Google doesn't
 * rank on this field, but Bing/Yandex factor it lightly and it costs
 * nothing.
 */
export function buildPitcherKeywords(input: {
  name: string;
  teamName: string | null;
  topPitches: Array<{ pitchType: string }>;
}): string {
  const keywords: string[] = [
    input.name,
    `${input.name} MLB Statcast data`,
    `${input.name} Statcast`,
    `${input.name} stats`,
    `${input.name} arsenal`,
    `${input.name} pitches`,
    `${input.name} pitch arsenal`,
    `${input.name} 3D`,
  ];
  if (input.teamName) {
    keywords.push(`${input.teamName} pitcher`);
    keywords.push(`${input.teamName} pitching staff`);
  }
  for (const p of input.topPitches) {
    keywords.push(`${input.name} ${getPitchLabel(p.pitchType).toLowerCase()}`);
  }
  keywords.push(
    "MLB pitcher",
    "MLB Statcast data",
    "Statcast",
    "pitch arsenal",
    "baseball analytics",
  );
  // Dedupe while preserving order.
  return Array.from(new Set(keywords)).join(", ");
}
