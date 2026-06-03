"use client";

// Top-of-stats-view scope banner. Tells the user what the cards below
// are scoped to — "vs Bobby Witt Jr. · 2026 season" when batter-scoped,
// "2026 season" otherwise. When scoped, the X button clears
// ?vsBatter from the URL so the user can leave the matchup view
// without re-opening the matchups panel.

interface StatsScopeBannerProps {
  seasonLabel: number;
  /** Batter display name when scoped. May be null even when
   *  `batterScoped` is true — there's a brief window before the
   *  arsenal fetch resolves the name; the banner falls back to a
   *  generic label in that case. */
  batterName: string | null;
  batterScoped: boolean;
  onClearBatter: () => void;
}

export function StatsScopeBanner({
  seasonLabel,
  batterName,
  batterScoped,
  onClearBatter,
}: StatsScopeBannerProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.04] border border-white/10 px-3 py-2">
      <div className="flex items-center gap-2 min-w-0 text-sm text-white/90">
        {batterScoped ? (
          <>
            <span className="text-[10px] uppercase tracking-[0.14em] text-white/45">
              vs
            </span>
            <span className="font-medium truncate">
              {batterName ?? "Selected batter"}
            </span>
            <span className="text-white/30">·</span>
            <span className="text-white/65 tabular-nums">
              {seasonLabel} season
            </span>
          </>
        ) : (
          <>
            <span className="text-[10px] uppercase tracking-[0.14em] text-white/45">
              Season
            </span>
            <span className="font-medium tabular-nums">{seasonLabel}</span>
            <span className="text-white/55 text-[11px]">· all batters</span>
          </>
        )}
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
          Clear
        </button>
      ) : null}
    </div>
  );
}
