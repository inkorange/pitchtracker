// Pitcher-page season type (?seasonType=). One definition shared by the
// page server, the arsenal API (3D scene + Stats view) and the client
// toggle, so every surface counts the same games.
//
// - absent / "reg" → regular season (the default; matches the homepage
//   leaderboards)
// - "post"         → postseason (wild card, division, LCS, World Series)
// - "all"          → every game
//
// A selected single game (?game=) is already one type, so it overrides
// the season type: callers pass `game` and get "all" back.

export type SeasonType = "reg" | "post" | "all";

export function parseSeasonType(v: string | null | undefined): SeasonType {
  return v === "post" || v === "all" ? v : "reg";
}

/** The season type actually applied, given the URL's ?game. */
export function effectiveSeasonType(v: string | null | undefined, game: string | null | undefined): SeasonType {
  return game ? "all" : parseSeasonType(v);
}

/** Statcast game_type: "R" regular, "F"/"D"/"L"/"W" postseason, "S"/"E" spring/exhibition. */
export function isPostseasonGameType(gameType: string | null | undefined): boolean {
  return gameType === "F" || gameType === "D" || gameType === "L" || gameType === "W";
}

export function matchesSeasonType(gameType: string | null | undefined, st: SeasonType): boolean {
  if (st === "all") return true;
  const post = isPostseasonGameType(gameType);
  return st === "post" ? post : !post;
}

export const SEASON_TYPE_LABEL: Record<SeasonType, string> = {
  reg: "regular season",
  post: "postseason",
  all: "season",
};
