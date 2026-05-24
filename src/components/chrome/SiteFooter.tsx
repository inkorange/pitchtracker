// Site-wide legal disclaimers. Two short paragraphs:
//
//   1. "Not affiliated with MLB" + trademark acknowledgement, the
//      standard footer line every public MLB-data project (FanGraphs,
//      Pitcher List, Pitching Ninja embeds) carries.
//   2. Data source attribution for the Stats API + Baseball Savant +
//      mlbstatic.com headshot CDN, which together cover everything the
//      site renders.
//
// Rendered after `children` in the root layout. On static pages
// (`<main className="min-h-screen ...">`) this lands at the bottom of
// the document. On 3D-canvas pages (`<main className="fixed inset-0">`)
// the fixed main covers it; the disclaimers are still in the DOM (good
// for crawlers / accessibility) but don't intrude on the scene.
export function SiteFooter() {
  return (
    <footer className="border-t border-white/[0.06] px-6 py-6 text-[10px] leading-relaxed tracking-[0.04em] text-white/40">
      <div className="max-w-3xl mx-auto space-y-2">
        {/* Crawlable link to the AI landing page. Necessary because the
            chat lives behind a floating icon + JS, which Google can't
            see — the link in the footer is what makes the /ai route
            discoverable to search crawlers. */}
        <p className="text-[11px] text-white/55">
          <a
            href="/ai"
            className="hover:text-white/85 underline-offset-2 hover:underline transition-colors"
          >
            Ask pitchtracker
          </a>{" "}
          — natural-language pitch analysis (voice or text).
        </p>
        <p>
          Not affiliated with or endorsed by Major League Baseball, MLB
          Advanced Media, or any of its clubs. All MLB and Club marks,
          logos, and player names are trademarks of their respective owners
          and are used here for identification purposes only.
        </p>
        <p>
          Pitch trajectory and Statcast data:{" "}
          <a
            href="https://baseballsavant.mlb.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white/70 underline-offset-2 hover:underline transition-colors"
          >
            Baseball Savant
          </a>
          .{" "}
          Player metadata, schedule, and headshots:{" "}
          <a
            href="https://statsapi.mlb.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white/70 underline-offset-2 hover:underline transition-colors"
          >
            MLB Stats API
          </a>{" "}
          and{" "}
          <a
            href="https://www.mlbstatic.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white/70 underline-offset-2 hover:underline transition-colors"
          >
            mlbstatic.com
          </a>
          .
        </p>
      </div>
    </footer>
  );
}
