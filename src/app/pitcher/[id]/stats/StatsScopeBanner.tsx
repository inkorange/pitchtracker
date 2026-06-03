"use client";

// Top-of-stats-view scope banner. Mirrors the filter-summary string
// the page server builds for the TopNav title so the stats view's
// scope description stays in sync with every URL filter (game,
// pitch type, outcome, event, hand, velo bounds, batter, at-bat
// mode) — the previous version only spoke about season + vsBatter
// and silently ignored the rest, telling the user "Season 2026 ·
// all batters" while the cards below were narrowed to Changeups
// from a single game.
//
// When ?vsBatter is set, the X/Clear action still drops batter
// scope (and at-bat playback params) in one click — the most
// commonly-wanted exit from the matchup view.

interface StatsScopeBannerProps {
  /** Pre-rendered filter-summary text from the page server (the
   *  same string the TopNav title shows). Empty/null means "no
   *  active filter" — banner falls back to a generic label. */
  summary: string | null;
  batterScoped: boolean;
  onClearBatter: () => void;
}

export function StatsScopeBanner({
  summary,
  batterScoped,
  onClearBatter,
}: StatsScopeBannerProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.04] border border-white/10 px-3 py-2">
      <div className="flex items-center gap-2 min-w-0 text-sm text-white/90">
        <span className="text-[10px] uppercase tracking-[0.14em] text-white/45 flex-shrink-0">
          Scope
        </span>
        <span className="font-medium truncate">
          {summary && summary.trim().length > 0
            ? summary
            : "All pitches"}
        </span>
      </div>
      {batterScoped ? (
        <button
          type="button"
          onClick={onClearBatter}
          className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-white/55 hover:text-white px-2 py-1 rounded hover:bg-white/[0.06] transition-colors flex-shrink-0"
          aria-label="Clear batter scope"
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
          Clear batter
        </button>
      ) : null}
    </div>
  );
}
