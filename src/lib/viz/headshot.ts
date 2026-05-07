// MLB headshot CDN URL composer. Public, hot-linked via next/image — never
// downloaded or re-hosted (matches PLAN's conservative legal posture).

export function pitcherHeadshotUrl(mlbId: number, size = 213): string {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_${size},q_auto:best/v1/people/${mlbId}/headshot/67/current`;
}

// The MLB headshot URL pattern is generic across roles — same endpoint
// works for batters too. Aliased for readability at call sites.
export const personHeadshotUrl = pitcherHeadshotUrl;

export function teamLogoUrl(teamId: number): string {
  return `https://www.mlbstatic.com/team-logos/${teamId}.svg`;
}
