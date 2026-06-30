// Team nicknames keyed by MLB team id. Hardcoded because the set of
// MLB clubs is small (30), stable for decades, and storing it inline
// keeps GameCard and any other UI that wants the short name free of an
// extra Supabase column or join.
//
// "Nickname" here is the canonical short form a baseball fan would say
// in conversation — "Tigers", not "Detroit Tigers"; "Red Sox" rather
// than just "Sox". For the Athletics, who relocated and dropped the
// city prefix in their MLB record, the official short name is just
// "Athletics".
//
// If MLB adds an expansion team or rebrands an existing one, add it
// here. The map is the single source of truth.
const TEAM_NICKNAMES: Record<number, string> = {
  108: "Angels",
  109: "Diamondbacks",
  110: "Orioles",
  111: "Red Sox",
  112: "Cubs",
  113: "Reds",
  114: "Guardians",
  115: "Rockies",
  116: "Tigers",
  117: "Astros",
  118: "Royals",
  119: "Dodgers",
  120: "Nationals",
  121: "Mets",
  133: "Athletics",
  134: "Pirates",
  135: "Padres",
  136: "Mariners",
  137: "Giants",
  138: "Cardinals",
  139: "Rays",
  140: "Rangers",
  141: "Blue Jays",
  142: "Twins",
  143: "Phillies",
  144: "Braves",
  145: "White Sox",
  146: "Marlins",
  147: "Yankees",
  158: "Brewers",
};

// Returns the team nickname (e.g. "Tigers", "Red Sox") for a given
// MLB team id, or a passed-in fallback when the id isn't known.
export function teamNickname(teamId: number, fallback = "?"): string {
  return TEAM_NICKNAMES[teamId] ?? fallback;
}
