# IMPLEMENTATION.md

This document describes how [PLAN.md](PLAN.md) gets built. It captures the technology stack, the external APIs we depend on, the data architecture (which is meaningfully different from PLAN's original "ingest everything" model), and a phased build plan that maps one-to-one to git branches and PRs.

## Working assumptions

- **Hosting**: Vercel (Chris's account). Single Next.js project, no monorepo.
- **Data persistence**: Supabase Postgres on Chris's existing Supabase account. Hybrid caching — pitchers and games refreshed on a cron, per-game pitch data fetched on demand from Savant and cached in Supabase on first read.
- **Auth**: Supabase Auth, landing in Phase 6 alongside saved comparisons. Earlier phases ship with anonymous shareable URLs that encode full state — auth is purely additive.
- **Outcome mining**: in scope. Implemented as a typed wrapper over Savant's `statcast_search` endpoint rather than running our own SQL over a fully ingested dataset. We don't host the data; we host the query UX.
- **Build target**: Phases 1–6 all built out. Each phase is its own branch and PR.

## Technology stack

### Web app

- **Next.js 15** with the App Router. React Server Components for data fetching, client components only where Three.js / interaction state requires it.
- **TypeScript** strict mode.
- **Tailwind CSS** + **shadcn/ui** for chrome (panels, controls, forms). The 3D scene is the product; the surrounding UI should be invisible.
- **nuqs** (or raw `searchParams`) for URL-encoded filter and comparison state. URLs are shareable artifacts in this product, not just navigation.
- **Vitest** for unit tests, primarily around the `Pitch` trajectory class and the tunneling math. **Playwright** for a small end-to-end smoke suite once Phase 2 lands.

### 3D rendering

- **Three.js** as the underlying engine.
- **@react-three/fiber** for the React integration.
- **@react-three/drei** for `OrbitControls`, camera helpers, and common primitives.
- **@react-three/postprocessing** for bloom / emissive glow on pitch ribbons. The "Pitching Ninja vibe" depends on this.
- **leva** in development only, removed before production, for live-tuning material and post-processing parameters during the visual-quality pass.

### Data and infrastructure

- **Supabase Postgres** for the cache and (eventually) saved comparisons + auth. Reached via `@supabase/ssr` from server components and route handlers.
- **Vercel Cron** for scheduled refresh jobs. Lightweight JS — no Python on Vercel.
- **Vercel Runtime Cache** (with tag-based invalidation) as the request-level dedup layer in front of Supabase reads, especially for pitcher aggregates and game lookups.
- **Vercel project config**: [`vercel.ts`](vercel.ts) (the TypeScript-typed replacement for `vercel.json`) — declares cron schedules, build settings, and headers in code.

### Tooling

- **pnpm** as the package manager.
- **ESLint** + **Prettier** with the Next.js defaults.
- **Husky** + **lint-staged** to keep formatting honest at commit time.

## External APIs

We rely on two free, public APIs. Neither requires authentication.

### MLB Stats API — `statsapi.mlb.com`

The official API. Used for everything except pitch-by-pitch tracking data.

- `GET /api/v1/sports/1/players?season=YYYY` — full player roster for a season. Source for our `pitchers` table.
- `GET /api/v1/teams?sportId=1&season=YYYY` — team metadata, logos.
- `GET /api/v1/schedule?sportId=1&startDate=...&endDate=...` — game schedule. Source for our `games` table.
- `GET /api/v1.1/game/{gamePk}/feed/live` — full live game feed. Used for at-bat context (count, runners, leverage) in Phase 4.
- `GET /api/v1/people/{playerId}` — player metadata (handedness, position, headshot URL).

Rate limits aren't published but the API tolerates well-behaved sequential pulls. Cache aggressively; respect the data's update cadence (rosters change rarely; schedules change daily).

### Baseball Savant — `baseballsavant.mlb.com`

Statcast tracking data. Used for pitch trajectories and pre-computed arsenal aggregates.

- **Search CSV export**: `GET /statcast_search/csv?...` — returns one CSV row per pitch with all the trajectory fields we need (`release_pos_x/y/z`, `vx0`/`vy0`/`vz0`, `ax`/`ay`/`az`, `plate_x/z`, `pitch_type`, `description`, `events`, etc.). This is what `pybaseball.statcast()` wraps under the hood. We call it directly from a Node.js route handler, parse the CSV, write rows to Supabase. Two query shapes:
  - `&game_pk={gamePk}` — one game, the hybrid pitch-fetcher path.
  - Full filter set (`hfPT` pitch type, `hfPR` pitch result, `hfC` count, `hfSit` situation, `pitcher_throws`, `batter_stands`, `pitchers_lookup[]`, `batters_lookup[]`, `game_date_gt/lt`, etc.) — the outcome-mining query path in Phase 5.
- **Player services**: `GET /player-services/statcast?playerId={mlbId}&year={season}` — pre-computed pitcher arsenal aggregates (avg velo, spin rate, vertical/horizontal break, whiff rate, run value per 100, vs LHB / vs RHB splits). Source for our `pitcher_aggregates` table. PLAN explicitly chose to use Savant's pre-computed numbers over rolling our own for MVP.
- **Player profile pages** also expose game-log endpoints we may wrap to populate per-pitcher game lists without hitting the full schedule API.

Savant's CSV endpoint is the load-bearing one. It's tolerant of single-game queries (returns in well under a second) and intolerant of huge multi-month queries (rate limits and timeouts kick in). The hybrid cache pattern keeps queries narrow.

### MLB Static Content CDN — `mlbstatic.com`

Public asset CDN, hot-linked via `next/image`. We never copy or re-host these — staying linked to MLB's canonical URLs matches PLAN's conservative legal posture and is the standard pattern across the baseball-data ecosystem (Savant, FanGraphs, Pitching Ninja).

- **Pitcher headshots**: `https://img.mlbstatic.com/mlb-photos/image/upload/{transforms}/v1/people/{mlbPlayerId}/headshot/67/current` — Cloudinary-style transforms append to the URL for sizing and format. We already have `mlb_id` on `pitchers`, so the URL composes cleanly. Fallback: a generic silhouette for the rare player without a current headshot.
- **Team logos**: `https://www.mlbstatic.com/team-logos/{teamId}.svg` (and `team-cap-on-light/{teamId}.svg` for cap variants). Team IDs are MLB's integer IDs (147 = Yankees, 143 = Phillies, etc.) and live on `teams.mlb_id`.

Add `img.mlbstatic.com` and `www.mlbstatic.com` to `images.remotePatterns` in `next.config.ts`. These URLs are immutable across a season, so cache aggressively.

## Data architecture

### Persisted in Supabase

| Table | Refresh strategy | Notes |
| --- | --- | --- |
| `teams` | Annual cron | MLB Stats API `/teams?sportId=1`. 30 MLB teams. Holds `mlb_id`, `abbreviation`, `name`, `division`, `league`, plus the constructed logo URL pattern. |
| `team_rosters` | Weekly cron during season + at off-season milestones | Join table: `(team_id, season, pitcher_id, innings_pitched)`. Powers the team→year→pitcher browse. A pitcher traded mid-season appears under both teams for that season. |
| `pitchers` | Weekly cron during season, monthly off-season | MLB Stats API. ~1500 active players. Holds `mlb_id`, name, throws, current team, seasons-active range. |
| `games` | Daily cron at 4am ET | MLB Stats API. Last 30 days + upcoming 7 days during season; `home_team_id` and `away_team_id` columns power team-scoped game filters. |
| `game_pitches` | Lazy-fetch on first request, then cached forever | Savant CSV → parsed → upserted. Keyed by `game_pk`. Re-fetched if `fetched_at < game_date + 7 days` to catch retroactive Statcast updates. |
| `pitcher_aggregates` | Weekly cron during season | Savant player-services endpoint. Keyed by `(pitcher_id, season, pitch_type)` with vs-LHB and vs-RHB splits. The same key shape powers the year selector on the pitcher view. |
| `notable_at_bats` | Daily cron, last 7 days | Computed from leverage, big-name matchups, multi-pitch whiffs. Phase 4. |
| `featured_pitchers` | Weekly cron during season | League leaders by ERA, K/9, fWAR, and a "buzzy" hand-curated layer. Drives the home-page featured grid. |
| `users` | Mirrors `auth.users` via trigger | Phase 6. Supabase Auth managed; we keep a profile-shaped public mirror. |
| `saved_comparisons` | User write only | Phase 6. Holds full comparison state JSON + share slug + `user_id`. |
| `saved_queries` | User write only | Phase 5/6. Holds outcome-mining query state + share slug. |

### Fetched on demand (no persistence)

- Live game state (in-progress games) — Vercel Runtime Cache with short TTL.
- Player headshots — proxied through Next.js Image with long cache headers.

### Why hybrid

PLAN's original "ingest 700k pitches/season into Postgres on a daily cron" model has two problems: it's expensive to run, and it commits us to a data shape before we know what the product needs. The hybrid model:

- Costs nothing until a user asks for a game.
- Grows organically toward exactly the data the product is being used for.
- Each `game_pitches` row is small (~300 pitches × 30 useful fields × ~50 bytes ≈ 450KB JSON-encoded, smaller as Postgres rows). A million games would be ~450GB; we won't approach that.
- Outcome mining can be reintroduced later by querying whatever has accumulated, with a "fetch missing" fallback for queries that need games we haven't loaded yet.

## Project layout

```
pitchtracker/
├── app/
│   ├── (marketing)/             # landing page, about
│   ├── pitcher/[id]/            # single pitcher view
│   ├── compare/                 # two-pitcher comparison (state in URL)
│   ├── at-bat/[gamePk]/[abId]/  # at-bat replay
│   ├── explore/                 # outcome mining query builder + results
│   ├── saved/                   # saved comparisons + queries (auth)
│   ├── auth/                    # Supabase Auth callback + sign-in routes
│   └── api/
│       ├── pitchers/            # search, get, refresh
│       ├── games/               # refresh, list by pitcher
│       ├── pitches/             # GET ?gamePk=... — hybrid fetch
│       ├── aggregates/          # GET pitcher × season aggregates
│       ├── search/              # POST mining queries → Savant search wrapper
│       ├── notable-at-bats/     # GET curated feed
│       ├── og/                  # OG image generation
│       └── cron/                # cron entrypoints
├── lib/
│   ├── pitch/                   # Pitch class, trajectory math, tunneling
│   ├── savant/                  # Savant CSV + player-services client
│   ├── statsapi/                # MLB Stats API client
│   ├── supabase/                # server + client factories
│   └── viz/                     # color system, camera presets, materials
├── components/
│   ├── scene/                   # r3f scene + camera + lighting
│   ├── ribbon/                  # pitch ribbon mesh + glow
│   ├── controls/                # camera preset switcher, playback bar
│   └── filters/                 # filter UI bound to URL state
├── supabase/
│   └── migrations/              # SQL migrations
├── vercel.ts                    # Vercel project config
└── tests/
    ├── pitch.test.ts            # trajectory validation against known plates
    └── tunneling.test.ts        # tunneling math
```

## Design system and home page

PLAN's brand voice is "closer to Linear or Vercel than to ESPN" — sophisticated, knowledgeable, restrained. The 3D scene is the product; chrome floats over it.

### Landing page architecture

The home page is itself the demo, not a marketing page that links to the demo.

- **Full-bleed 3D canvas** as the page background, running an autoplay curated comparison (e.g. Skubal vs Cole, slider tunneling). No header bar, no hero copy.
- A single floating glass panel in the lower-left contains the site mark, a one-line tagline, and the primary search input. Translucent surface, blurred backdrop, soft inner shadow.
- Scrolling reveals the secondary surfaces: featured pitchers strip, *Pitch of the Day*, recent comparisons. The 3D scene parallax-drifts behind these as the user scrolls.
- A "Take the tour" link in the corner triggers a 30-second guided pan that explains tunneling, plays a comparison from each preset angle, and lands the user on `/compare` ready to pick their own.

This carries the "10-second understanding" success criterion from PLAN.

### Layout philosophy: chrome floats over the scene

Every product page (`/pitcher`, `/compare`, `/at-bat`, `/explore`) follows the same shell:

- 3D canvas fills the viewport.
- Filters and stats live in floating, translucent, blurred glass panels that sit *over* the canvas, not beside it. Collapsible.
- Camera presets anchor to the lower-right as a small four-icon strip (or a quad-pad on mobile).
- Playback controls anchor to the bottom-center as a slim transport bar; auto-fades when idle.
- Stat overlays attach to the path itself in 3D space (per PLAN), not to a sidebar.

Closer to a video editor or game UI than a SaaS dashboard.

### Type system

- Workhorse sans for everything: **Geist** (or **Inter Display**) at 400 / 500 / 700 weights.
- Numerals tabular for stat alignment.
- **Geist Mono** for stat values where alignment matters (velo, spin rate columns).
- Headings 600–700, body 400. No display fonts; the visualization is the display.

### Color system

- **Dark default.** Light mode is a Phase 6 addition, not MVP.
- Surface palette:
  - Background: deep neutral (`#0A0E14`-range).
  - Panels: translucent white at ~6% opacity with backdrop-blur ~24px.
  - Borders: 1px hairline at ~10% opacity.
- Single warm accent for interactive states (hover, focus, active) — held back from competing with the pitch-type semantic colors.
- Pitch-type colors stay as PLAN specifies but tuned against a dark stage; emissive materials read differently on dark surfaces.

### Motion language

- **Camera tweens**: ~2s damped spring between presets (per PLAN).
- **Ribbon emergence**: ribbons "draw" from release point to plate over ~600ms with the animated sphere following. Not snap-appear.
- **Panel transitions**: glass panels fade-blur in/out at ~250ms. No slides or zooms.
- **Page transitions**: the 3D scene persists across navigations between `/pitcher` and `/compare` — only the chrome and visible pitches change. Feels like one app, not a multi-page site.
- **Idle drift**: after 4+ seconds of no input, the camera does a very subtle dolly drift to keep the scene alive. Cancels on interaction.

### 3D scene as a cinematic stage

The difference between *cinematic* and *scientific* is staging. PLAN specifies strike zone, plate, gradient, bloom — extend with:

- **Implied ground plane**: a fading dark gradient beneath the path, suggesting gravity without a hard surface.
- **Implied stadium silhouette**: very faint, far-distance, low-saturation. Grounds the scene as "this is a baseball field," not "this is an empty void."
- **Light rig**: key + fill + rim lights tuned for emissive ribbon glow against dark surfaces.
- **Atmospheric volumetrics**: subtle fog or dust motes that catch the ribbon light. Performance-gated; off on mobile.

### Domain component library

Built on shadcn/ui primitives, but the domain layer carries the product:

- `<PitcherCard />` — headshot + name + arsenal preview. Used in featured strip, search results, comparison selector.
- `<ArsenalRow />` — pitch-type swatch + bold ribbon + stats. Building block of the single-pitcher panel.
- `<PitchBadge />` — semantic-color pill for pitch type.
- `<GlassPanel />` — the translucent blurred surface used everywhere chrome floats over the scene.
- `<TransportBar />` — playback controls (play/pause/scrub/replay), optional ghost-trail toggle, current camera preset readout.
- `<CameraPad />` — the four-preset switcher with tween indicator.
- `<StatOverlay />` — text label that anchors to a 3D position via r3f's `<Html />`.

## Cross-cutting concerns

These apply across every phase and are easy to forget if not called out explicitly.

### Accessibility

- **Color-blind safe mode.** The product is heavy on pitch-type semantic colors; deuteranopia and protanopia map fastball red and slider violet uncomfortably close. Ship a color-blind-safe palette switch from Phase 1, with shape or pattern variation as a secondary signal.
- **Reduced motion.** Honor `prefers-reduced-motion` — replace tweens with snaps, disable idle camera drift, instant ribbon emergence.
- **Keyboard navigation.** Camera presets are 1/2/3/4. Spacebar plays/pauses. Left/right arrows scrub or step pitches. Tab order through filter panels is sensible.
- **Screen readers.** Stat values, pitcher names, and pitch-type labels are readable via ARIA. The 3D canvas has a meaningful `aria-label` summarizing what's currently rendered ("Skubal slider, 88 mph, 14 inches horizontal break, comparing to Cole fastball").

### Empty, loading, and error states

Designed deliberately, not by default:

- **Skeleton states**: every async component (search, pitcher view, game list, comparison) has a skeleton matching its final layout. No blank screens, no spinners as the only signal.
- **Empty states**: explicit copy and visuals when a pitcher has no pitches in the filtered window, when a query returns zero results, when a saved comparison is loading. Each includes a one-tap "broaden the filter" action.
- **Error states**: when Savant times out, when the MLB Stats API is unreachable, when a `game_pk` doesn't exist. Each has a clear human message and a retry action — never a stack trace.
- **Network awareness**: a small banner appears if the user is offline or on a slow connection; the 3D scene falls back to a single static frame.

### Analytics and monitoring

PLAN's success criteria require measurement:

- **PostHog** for product analytics — page views, comparison loads, share-button clicks, retention cohorts, day-2 retention specifically.
- **Sentry** for error monitoring — wired via the Vercel marketplace integration, source maps uploaded on deploy.
- **Vercel Web Analytics** for Core Web Vitals and traffic by region.
- **Custom events**: `comparison-loaded`, `comparison-shared`, `query-run`, `video-exported`. These map directly to the post-MVP signals PLAN tracks.

### Performance budgets

- **First Contentful Paint** < 1.5s on a fast 3G mobile connection.
- **Time to Interactive** < 3.5s on the same connection.
- **3D scene first frame** < 2s after route transition.
- **Comparison load** (cold cache, two pitchers, full season) < 4s end-to-end.
- **Bundle size** for 3D-bearing routes < 350 KB gzipped including r3f and drei. Bloom and post-processing are dynamic-imported and lazy-loaded after first paint.

### PWA

Web manifest, install prompt after the second visit, offline shell for the home page. Cheap (~half a day) and meaningfully improves mobile retention.

## Phase 1 — Foundation

**Branch**: `phase-1-foundation` → PR to `main`.

The goal is a single pitch rendered correctly, with the visual quality bar set, before we touch real data plumbing. PLAN's biggest stated risk is "rendering quality not standing out" — Phase 1 retires that risk.

### Tasks

1. Scaffold Next.js 15 + TypeScript + Tailwind. Install shadcn/ui, configure base theme.
2. Link Vercel project (`vercel link`), wire up Supabase via the Vercel marketplace integration so env vars auto-provision.
3. Create the initial Supabase schema for `pitchers`, `games`, `game_pitches`, `pitcher_aggregates`. Migrations live in `supabase/migrations/`.
4. Implement the `Pitch` class in `lib/pitch/Pitch.ts`:
   - `constructor(statcastRow)` — accepts a parsed Savant CSV row.
   - `positionAtTime(t)` — returns `[x, y, z]` using the constant-acceleration model from PLAN.
   - `path(samples = 50)` — returns a sampled trajectory from release point to plate.
   - `breakAt(y)` and `velocityAt(y)` — derived helpers.
5. Validate the math: write a Vitest suite that loads a fixture of ~50 known pitches, integrates `path()`, and confirms `plate_x` and `plate_z` from the integration match Savant's recorded values within tolerance (< 0.1 ft).
6. Build the base 3D scene in `components/scene/`. The scene is a cinematic stage, not a wireframe diagram (see Design system > 3D scene as a cinematic stage):
   - r3f `Canvas` with reasonable defaults (DPR cap 2 desktop / 1.5 mobile, antialias).
   - Strike zone wireframe in neutral color.
   - Home plate as a low-poly white pentagon.
   - **Implied ground plane**: fading dark gradient beneath the path, no hard surface.
   - **Implied stadium silhouette**: very faint, far-distance, low-saturation backdrop. Grounds the scene as a baseball field, not an empty void.
   - **Light rig**: key + fill + rim lights tuned for emissive ribbon glow against dark surfaces.
   - **Atmospheric volumetrics**: subtle fog / dust motes that catch ribbon light. Performance-gated; off on mobile and when `prefers-reduced-motion` is set.
   - Bloom post-processing pass tuned for ribbon glow. Dynamic-imported and lazy-loaded after first paint.
   - Color-blind safe mode toggle wired from day 1 (see Cross-cutting > Accessibility).
7. Implement the pitch ribbon mesh (`components/ribbon/`) — a tube geometry along the sampled path with emissive material, color taken from the pitch type. Ribbons "draw" from release to plate over ~600ms on first appear, not snap-in. Tune until it looks like Pitching Ninja, not a scientific plot.
8. Camera presets (`lib/viz/camera-presets.ts`) — front, back, top, side. Tweened transitions of ~2s using a damping spring. Free-orbit via `OrbitControls` with a "reset view" button that returns to the last-used preset.
9. Single-pitch playback control: animate a sphere along the path with play/pause/scrub/replay controls. Camera preset switching mid-playback must not restart the animation.
10. Visual-quality review: render the same pitch from front/back/top/side, on desktop and a real phone. Sign off before moving on.

### Exit criteria

- A static page at `/dev/single-pitch` renders one hardcoded pitch with full visual treatment.
- All four camera presets work and are tweened.
- Playback controls work and survive preset switching.
- Trajectory validation tests pass against ≥50 fixture pitches.
- The page looks good enough that you'd share it on Twitter as-is. (This is a real bar, not throwaway language — Phase 1 is about retiring the visual-quality risk.)

## Phase 2 — Single pitcher view

**Branch**: `phase-2-single-pitcher` → PR to `main`.

The first end-to-end product surface. Pick a pitcher, see their arsenal.

### Tasks

1. Build the MLB Stats API client (`lib/statsapi/`) — typed fetchers for players, schedules, teams. Returns parsed objects, not raw API shapes.
2. Build the Savant client (`lib/savant/`):
   - `fetchGamePitches(gamePk)` — calls the CSV search endpoint, parses with a streaming CSV parser, returns typed rows.
   - `fetchPitcherAggregates(playerId, season)` — calls the player-services endpoint, returns typed arsenal stats.
3. Cron job: `GET /api/cron/refresh-teams` — pulls 30 MLB teams from MLB Stats API, upserts into `teams`. Scheduled annually (and run manually after expansion / branding changes).
4. Cron job: `GET /api/cron/refresh-pitchers` — pulls active pitchers from MLB Stats API, upserts into `pitchers`. Scheduled weekly via `vercel.ts`. Idempotent.
5. Cron job: `GET /api/cron/refresh-rosters` — for each team × current-and-recent seasons (current season + last 2 for late lookups), pulls the season roster from MLB Stats API `/teams/{teamId}/roster?rosterType=fullSeason&season=YYYY` and upserts into `team_rosters`. Weekly during season.
6. Cron job: `GET /api/cron/refresh-games` — pulls schedule for the last 30 + next 7 days, upserts into `games`. Scheduled daily.
7. Cron job: `GET /api/cron/refresh-aggregates` — for active pitchers, refreshes `pitcher_aggregates` for the current season. Weekly during season.
8. Cron job: `GET /api/cron/refresh-featured` — recomputes `featured_pitchers` from current-season league-leader rankings (ERA, K/9, fWAR) plus a small hand-curated "buzzy" layer. Weekly during season.
9. Hybrid pitch fetcher (`app/api/pitches/route.ts`):
   - Read from `game_pitches` if `fetched_at` is fresh.
   - Otherwise fetch from Savant, upsert, return.
   - Tagged Vercel Runtime Cache entry per `gamePk` for in-region dedup.

10. **Pitcher selection UI.** Two doors that both land at `/pitcher/[id]?season=YYYY`. Both share the same destination, so URL state is the source of truth.

   **Door 1: type-ahead search.**
   - Server action backed by the cached `pitchers` table — not the MLB Stats API per keystroke.
   - Name prefix + name contains across first/last name; debounced ~150ms; top 10 results.
   - Result rows show headshot (MLB CDN URL composed from `mlb_id`), full name, current team logo, throws (L/R), and seasons-active range.
   - Click → `/pitcher/[id]?season={current-season}`.

   **Door 2: browse by team → year → pitcher.**
   - Step A — team grid grouped by **AL East / AL Central / AL West / NL East / NL Central / NL West**. Logo tiles sourced from `mlbstatic.com`.
   - Step B — year selector (defaults to current season; range capped at 2015 through current) plus the season roster for the selected team. Roster is `team_rosters` filtered to `(team_id, season)`, sorted by `innings_pitched` desc. Mid-season traded pitchers appear in both team rosters for that season.
   - Step C — pitcher card with headshot, name, key arsenal stats (top 3 pitch types from `pitcher_aggregates`, season ERA / K/9 from MLB Stats API). Click → `/pitcher/[id]?season={year-they-just-picked}`.

   **Featured pitchers strip.** Above-the-fold on the home page, a curated grid of ~12 league leaders sourced from `featured_pitchers`. Refreshed weekly. One-click into `/pitcher/[id]?season={current-season}`.

11. **Home page (`/`).** Built per the Design system > Landing page architecture:
    - **Full-bleed 3D canvas** as the page background, running an autoplay curated comparison (e.g. Skubal vs Cole, slider tunneling). The visualization itself is the hero.
    - Floating glass panel in the lower-left holds the site mark, one-line tagline, and the typeahead search input.
    - "Take the tour" link in the corner triggers a 30-second guided pan that explains tunneling, plays a comparison from each preset angle, and lands the user on `/compare` ready to pick their own.
    - Below-the-fold scroll: featured pitchers strip → recent comparisons → footer. The 3D scene parallax-drifts behind these.
    - Curated comparison source: a small `featured_comparisons` config (hand-curated for now, ~5 rotating slots) so the autoplay doesn't get stale.

12. **"What just happened" explainer.** Whenever a comparison loads (single pitch, two-pitcher, at-bat replay), generate one human-readable sentence describing the most notable thing about the rendered scene — e.g. *"Skubal's slider stays within 1.4″ of his fastball through 25 ft, then breaks 8″ more horizontally."* Computed from the tunneling math and pitch-type aggregates. Lowers the analytical-knowledge barrier for the casual baseball Twitter audience tier.

13. Single pitcher page at `/pitcher/[id]`:
    - Server component pulls `pitcher_aggregates` and game list scoped to `?season=YYYY`.
    - Year selector in the page header. Changing it updates the URL → re-fetches games, aggregates, and arsenal viz. Year picker only shows seasons where the pitcher has Statcast data (no greyed-out empty years for late debuts).
    - Client component renders the 3D scene with the full arsenal.
    - Each pitch type rendered as a translucent cloud of individual pitches plus one bold ribbon for the average path.
    - **Mid-season trade handling.** Default arsenal view shows all pitches across both teams for the selected season. A small "team" toggle next to the year selector lets users isolate to either team if the pitcher was traded mid-year.

14. Filter UI bound to URL search params. The date control is the most prominent — it doubles as the games-list narrower:
    - **Date** — presets `All of {season}` (default) → `Last 30 days` → `Last 7 days` → `Custom range` → `Specific date`. Custom and specific-date open a calendar widget bounded to the active season. Specific date narrows the games list to that day (usually 0 or 1 game; doubleheaders show both). Encoded as `?from=YYYY-MM-DD&to=YYYY-MM-DD`.
    - **Batter handedness** — vs LHB / vs RHB / both.
    - **Count** — any / hitter's / pitcher's / two-strike / three-ball / full.
    - **Outcome** — any / whiff / called strike / ball / in play / hit.
    - **Game situation** — any / high leverage / RISP.
    - **Team isolation** (only relevant for traded pitchers) — both teams (default) / specific team.
15. Stat panel rendering aggregates per pitch type from `pitcher_aggregates` for the active season.
16. Single-pitch playback (lifted from Phase 1) accessible from any individual pitch in the cloud or from the average ribbon.

### Exit criteria

- `/pitcher/[id]` works for any active pitcher.
- Filters round-trip through the URL.
- Cron jobs run on schedule and stay green for a week.
- Page loads in < 2s on a cold cache, < 500ms on a warm cache.
- Mobile renders acceptably (degraded but not broken).

## Phase 3 — Two-pitcher comparison

**Branch**: `phase-3-comparison` → PR to `main`.

The headline feature. The whole product justifies its existence here.

### Tasks

1. Selection UI for two pitchers, accessible from `/compare` or from a "compare with..." button on `/pitcher/[id]`. The same-pitcher case is explicitly supported — a user can pick deGrom 2018 vs deGrom 2024 to see how an arsenal evolved across seasons. The selection UI surfaces a "Compare to a different season" shortcut on a pitcher's profile.
2. Independent filter state per pitcher, encoded in URL search params (`?a.pitcher=...&a.season=...&b.pitcher=...&b.season=...`). Season is independent per side, which is what powers the cross-season case.
3. Synchronized release-point logic in `lib/viz/`:
   - Default: normalize both pitchers' release points to a shared origin so movement is directly comparable.
   - Toggle: "true release" mode showing actual arm slots.
   - The math is a single 3D translation per pitcher; keep it explicit.
4. Overlay rendering:
   - Pitcher A in one hue family (e.g. warm), Pitcher B in another (e.g. cool).
   - Within each pitcher, semantic pitch-type color is preserved via lightness/saturation rather than hue.
   - Average path ribbons bold by default; cloud layer toggle.
   - Stat overlays anchored to the path (velo near release, break near plate), not in a sidebar.
5. Tunnel point computation in `lib/pitch/tunneling.ts`:
   - Given two `Pitch` instances, sample both at 1ms intervals.
   - Find the latest `t` where the spatial distance is below the threshold (default 1.5 inches; configurable).
   - Compute the commit-point distance (~25 ft from plate).
   - Compute the tunnel quality score = `movement_diff_at_plate / distance_at_commit`.
   - Render a labeled visual marker at the tunnel point.
6. Comparison playback: both pitches animate simultaneously, synchronized to release time. Same play/pause/scrub/replay controls. Optional ghost trail toggle. Camera presets work mid-playback.
7. Comparison stat panel (side-by-side aggregates).
8. Shareable URL state: every relevant control (pitcher IDs, filters, camera preset, true-release toggle, ghost-trail toggle) is in the URL. Copy-link button.
9. Open-graph image generation: `/api/og/compare?...` returns a server-rendered PNG of the comparison from the side-on preset. Used when comparison URLs are shared on social.

### Exit criteria

- `/compare?a.pitcher=...&b.pitcher=...` works for any two active pitchers.
- Tunnel point renders correctly for ≥10 manually-validated comparisons.
- Comparison playback feels smooth (60fps on M1 desktop, ≥30fps on a real phone).
- Open-graph PNGs render correctly in Twitter, Reddit, and iMessage previews.
- "If I send this URL to a baseball-Twitter friend they get the wow moment" — actual user test, not a metric.

## Phase 4 — At-bat replay

**Branch**: `phase-4-at-bat` → PR to `main`.

Reuses the rendering, camera, and playback primitives from Phases 1–3. Adds the time dimension: a sequence of pitches as a single narrative.

### Tasks

1. Cron job: `GET /api/cron/refresh-notable-at-bats` — daily. For each game in the last 7 days, score every at-bat by leverage (max delta-win-exp during the at-bat), notability (named matchups, post-season, walk-offs), and pitch quality (multi-pitch whiff sequences). Persist the top N per day in `notable_at_bats`.
2. **Daily content surface.** The same cron also picks one *Pitch of the Day* (highest-stuff or most outcome-defining pitch from the last 24 hours) and one *Whiff of the Week* (rolling top whiff). These surface on the home page below the autoplay hero and on a `/daily` page that's permalink-able for sharing. Each links into its at-bat replay. Drives return visits.
3. At-bat search UI at `/at-bat`:
   - Recent games list, drilling into at-bat lists per game.
   - "Notable at-bats" curated feed sourced from `notable_at_bats`.
   - Direct lookup by `game_pk` + `at_bat_number`.
4. At-bat replay page at `/at-bat/[gamePk]/[atBatNumber]`:
   - Server component pulls all pitches for that at-bat from `game_pitches` (hybrid-fetches the game on first visit).
   - Pulls live game state from MLB Stats API `feed/live` for batter/pitcher identification, count progression, runners, score, leverage at each pitch.
5. Sequential pitch animation:
   - Each pitch animates in turn, with configurable inter-pitch delay (default ~1.5s).
   - Cumulative ribbons stay visible by default — the whole at-bat reads as a tunnel pattern by the end.
   - "Step" controls: play, pause, scrub, jump-to-next-pitch, jump-to-previous-pitch.
   - Per-pitch outcome label appears as the ball lands (ball, called strike, swinging strike, foul, in play with result).
6. Game-state HUD:
   - Count badge updates pitch-by-pitch.
   - Baserunner diamond updates pitch-by-pitch.
   - Batter / pitcher names + headshots.
   - Final outcome card at the end of the sequence (walk, K, single, HR, etc.).
7. Camera presets work mid-sequence. A new "follow" mode tracks the active pitch with a slight lag for cinematic feel — opt-in, not default.
8. Shareable URL encoding `gamePk`, `atBatNumber`, camera preset, and playback state (paused at pitch N, etc.).
9. OG image generation for at-bat URLs — server-rendered PNG showing the cumulative tunnel from the side preset.

### Exit criteria

- `/at-bat/[gamePk]/[atBatNumber]` works for any at-bat in any game we've cached or can fetch.
- Notable-at-bats feed refreshes daily and surfaces genuinely interesting sequences.
- Sequential playback feels watchable — pacing is right, outcomes are legible, the cumulative tunnel reads.
- A shared at-bat URL renders correctly with full state preserved on load.

## Phase 5 — Outcome mining

**Branch**: `phase-5-mining` → PR to `main`.

The data-mining layer. PLAN's third pillar. Implemented as a typed wrapper around Savant's `statcast_search` endpoint — we host the query UX and the visualization, Savant hosts the data.

### Tasks

1. Build the Savant search client (`lib/savant/search.ts`):
   - Typed query object covering pitcher, batter, pitch type (multi), count, batter handedness, pitcher handedness, outcome (`description` and `events`), date range, season, situation flags, leverage, batted-ball outcomes, zone.
   - Serializes to Savant's URL params (`hfPT`, `hfPR`, `hfC`, `hfSit`, `pitcher_throws`, `batter_stands`, `pitchers_lookup[]`, `batters_lookup[]`, `game_date_gt/lt`, `hfFlag`, etc.).
   - Streams the CSV response, parses to typed pitch rows.
   - Result cap at 5,000 pitches per query (~5MB of CSV) to protect Savant and our function timeouts. Wider queries return a "narrow your filter" prompt.
2. `POST /api/search` route:
   - Accepts the typed query.
   - Runs Savant search.
   - Computes aggregates (count, avg velo, whiff rate, etc.) from the result set.
   - Tagged Vercel Runtime Cache entry per serialized query for repeat-query dedup.
3. Form-based query builder UI at `/explore`:
   - All filter fields from the typed query, grouped into "Who" (pitcher, batter, handedness), "What" (pitch type), "When" (date range, count, situation), "Outcome" (whiff, called strike, hit type).
   - State encoded entirely in URL search params — every query is a shareable URL.
   - Example query buttons that fill in the form for the canonical PLAN examples ("Skubal sliders that got whiffs in 2025", "Cole fastballs hit for XBH in two-strike counts", etc.).
4. Three result modes, switchable from a tab strip:
   - **Aggregate**: stats panel showing counts, distributions, avg velo / break / whiff rate, pitch-type breakdown.
   - **Individual**: scrollable table of matching pitches. Each row links to the at-bat replay page from Phase 4.
   - **Visualization**: 3D render of all matching pitches as a translucent cloud, with the average ribbon highlighted. Reuses the Phase 1–2 rendering primitives. Camera presets and free-orbit work.
5. Side-by-side comparison mode within mining: split the query result into two subsets (e.g. "whiffs" vs "in-play hits") and render both clouds in shared 3D space. Reuses the Phase 3 hue-offset color logic. This is the discovery-angle PLAN highlights — where positive outcomes cluster vs negative.
6. Result export: CSV download of the matching pitches (re-emit the Savant data; we're not adding new fields). Free for now; gated to paid tier in Phase 6 alongside other monetization.
7. Open-graph image for shared explore URLs.

### Exit criteria

- All four PLAN-listed example queries work end-to-end in under 3 seconds on a cold cache.
- Result cap and the "narrow your filter" UX prevent runaway queries.
- The visualization mode renders a meaningful cloud (≥100 pitches) without dropping below 30fps on M1 desktop.
- Side-by-side mode produces an "ah, that's why" moment on at least three real pitcher-pitch combos.

## Phase 6 — Auth, saved state, mobile, video export, monetization

**Branch**: `phase-6-polish` → PR to `main`. May split into multiple sub-branches (`phase-6a-auth`, `phase-6b-mobile`, etc.) if it grows; default to one PR until proven otherwise.

The phase that turns the MVP into a product.

### Auth (Supabase Auth)

1. Wire `@supabase/ssr` for App Router. Server components use the SSR client; route handlers and middleware use the same.
2. Sign-in / sign-up flow at `/auth`:
   - Magic link as the primary flow (lowest friction).
   - Google OAuth as the secondary flow.
   - Email + password as a fallback.
3. Auth callback route at `/auth/callback` to exchange the OAuth code for a session.
4. Middleware (`middleware.ts`) keeps the Supabase session cookie fresh. Routes stay public unless they require auth.
5. `users` public table mirrored from `auth.users` via a Supabase trigger. Holds display name and any profile-shaped fields.
6. Row Level Security on `saved_comparisons` and `saved_queries` — users can only read/write their own rows.

### Saved comparisons and saved queries

1. `saved_comparisons` table — `id`, `user_id`, `state` (JSON of comparison config), `share_slug`, `created_at`, `name`.
2. `saved_queries` table — same shape for outcome-mining queries.
3. "Save this comparison" / "Save this query" buttons on `/compare` and `/explore`. Anonymous users see a "sign in to save" prompt; the comparison state is preserved across the auth round-trip.
4. `/saved` page lists the signed-in user's saved comparisons and queries with thumbnails (reusing the OG image generator).
5. Share slugs (`/c/[slug]`, `/q/[slug]`) resolve to the saved state, viewable by anyone — saved means "named and persistent," not "private."

### Mobile improvements

Mobile is its own narrative, not a degraded desktop. Baseball traffic on phones will likely be ≥50% of total — design for it intentionally.

**Layout**

1. **Vertical-first stage**: portrait viewport, 3D scene fills 80% of vertical space, controls dock to the bottom 20%.
2. **Bottom sheets for filters**: tap a filter chip → sheet slides up, snap points at 50% and 90%. Native-feeling on iOS and Android. Replaces desktop's floating glass panels.
3. **Thumb-zone controls**: playback, presets, and the most-used filter chips live in the bottom third of the screen. The top is for the scene only.
4. **Front-preset default in portrait, side-preset in landscape.**

**Interaction**

5. Pinch to zoom; two-finger drag to orbit; tap to play/pause.
6. **Stories mode** for at-bat replay: pre-rendered short videos that auto-advance; swipe up/down to change pitches in the sequence, swipe left/right to change camera preset. Borrowing the Instagram/TikTok pattern.

**Performance and battery**

7. Cap DPR at 1.5 on mobile (vs 2 on desktop).
8. Halve ribbon segment counts on touch devices.
9. Disable bloom and atmospheric volumetrics on devices reporting < 4 GB RAM (`navigator.deviceMemory` heuristic).
10. Auto-pause the autoplay hero comparison after 30 seconds on mobile to spare battery; require a tap to restart. Not on desktop.
11. Respect `prefers-reduced-motion` — slower simpler camera tween, no idle drift.

**Fallbacks**

12. Optional 2D side-on projection fallback for very small screens (< 380px width).
13. **Network awareness**: cellular users see a small "saving data" indicator; 3D scene uses lower-resolution textures and fewer pitches in cloud renders.

**Verification**

14. Real-device test pass on iPhone and Android before sign-off. Chrome devtools simulation does not count.
15. Test on a low-end Android (~$200 device) — if it's unusable there, the perf budget needs more work.

### Tunneling explorer

PLAN flags this as an MVP stretch goal; landing it here.

1. Page at `/pitcher/[id]/tunneling` for any pitcher.
2. Compute pairwise tunnel-quality scores for every pair of pitch types in their arsenal using the Phase 3 tunneling math.
3. Surface the top three tunneling pairs with their scores, rendered as Phase 3 comparisons in shared 3D space.
4. Cache results in `pitcher_aggregates` (or a sibling table) — recompute weekly with the rest of the aggregates cron.

### Video export

1. Implement server-side rendering of any visualization (single pitch, comparison, at-bat, mining cloud) as MP4.
2. Use Remotion (already in the broader codebase ecosystem) with a headless r3f scene rendered frame-by-frame. Output 1080p @ 60fps for a 6–10 second clip.
3. Render job runs as a Vercel Function with extended duration (still well under the 300s default). For longer clips, move to a queue (Vercel Queues, public beta) with progress webhooks back to the user.
4. Free tier gets watermarked exports at 720p; paid tier gets clean 1080p+.

### Monetization

1. Stripe via the Vercel marketplace integration.
2. Free vs paid tier gating wired into:
   - Video export resolution and watermark.
   - Saved-comparison / saved-query count caps.
   - Mining query result caps.
   - Priority cron refresh during the season (paid tier sees newer data faster).
3. Pricing per PLAN: $5–$15/month range. Start at the lower end during launch, raise with proven retention.

### Launch

1. Reddit posts on `r/baseball` and `r/Sabermetrics` with a comparison link as the lead.
2. Twitter / Bluesky thread with three or four high-quality comparison videos.
3. Outreach to a handful of analyst accounts (PLAN tier 4) with personalized comparisons relevant to their content.

### Exit criteria

- Auth round-trip works without losing in-progress comparison or query state.
- Saved comparisons + queries persist and load with full fidelity across sessions and devices.
- Mobile experience has been signed off on actual hardware.
- A 1080p comparison video can be exported in under 30 seconds.
- Stripe checkout works; paid-tier gates are enforced server-side, not just client-side.
- Launch content is queued and ready to post.

## Phase 7 — Live game support (post-MVP, called out for data-layer planning)

**Branch**: `phase-7-live` → PR to `main`. Sequenced after Phase 6 launch and audience signal.

Not in MVP scope, but called out now so earlier phases don't preclude it. During in-progress games:

- Surface in-progress at-bats as they happen, with pitch ribbons appearing in near-real-time.
- Polled MLB Stats API `feed/live` (typically refreshed every 10–15 seconds) drives the state.
- Statcast tracking data lags live by a small amount; show a "tracking pending" placeholder when the pitch is in but the trajectory hasn't arrived from Savant yet (~30–90 seconds).
- A live games strip on the home page during the season — currently-active games as cards with score, inning, and a "watch pitches live" CTA.
- Push notifications for high-leverage at-bats featuring a user's bookmarked pitchers (PWA-only, opt-in).

The data layer requirements are minor: a polling hook on top of the existing live-feed wrapper, and a real-time channel via Supabase Realtime so multiple viewers see the same pitches at the same time without each polling Savant directly.

Massive engagement multiplier during the season — the kind of feature that makes the site a live-game habit, not a once-a-week curiosity.

## Vercel-specific configuration

- **Crons** declared in [`vercel.ts`](vercel.ts):
  - `0 8 1 1 *` — refresh teams (annual, January).
  - `0 8 * * 1` — refresh pitchers (weekly, Monday).
  - `0 9 * * 1` — refresh team rosters (weekly, Monday).
  - `0 8 * * *` — refresh games (daily).
  - `0 10 * * 1` — refresh aggregates (weekly, Monday).
  - `0 11 * * 1` — refresh featured pitchers (weekly, Monday).
  - `0 12 * * *` — refresh notable at-bats (daily, Phase 4).
- **Headers** for the landing page and OG images set via `routes.cacheControl(...)` in `vercel.ts`.
- **Fluid Compute** is the default and the right fit. No edge-only constraints — we want full Node.js for the Savant CSV parser.
- **Function timeout** stays at the 300s default; nothing should approach that in normal operation.
- **Vercel Runtime Cache** wraps the hybrid pitch fetcher and the aggregates endpoint with tag invalidation keyed by `pitcher:{id}` and `game:{gamePk}`.

## Workflow

Per the project workflow convention, each phase is its own branch (`phase-1-foundation`, `phase-2-single-pitcher`, etc.) merged via PR into `main`. Chris merges manually; commits are authored under Chris's name without `Co-Authored-By` trailers.

Within a phase, commits are small and incremental — scaffolding, then schema, then math, then rendering, then polish. Each commit should leave the build green.

## Open questions to resolve mid-build

These don't block starting Phase 1 but should be answered before Phase 3 ships:

- **Working name and domain.** PLAN lists candidates; pick before public sharing of any URL.
- **Color system finalization.** PLAN sketches semantic colors and proposes hue offsets per pitcher in comparisons. Needs a small design pass to validate accessibility and overlay legibility.
- **Tunneling thresholds.** PLAN proposes 1.5–2 inches and a ~25 ft commit point. Validate against pitching-coach intuition before exposing the tunnel-quality score as a public number.
- **Pitch classification source.** PLAN says "trust Savant's classification for v1." Confirm we're not surfacing any cluster-based reclassification in MVP.

## Backlog

Tracked but not scheduled. Pulled into a phase when audience signal supports it.

- **Auto-tagged pitch archetypes** — cluster-based labels like *"elite vertical breaker"*, *"sweeper-heavy"*, *"kitchen sink mix"* derived from the per-pitcher arsenal aggregates. Powers a *"find pitchers like X"* discovery hook.
- **Pitcher bookmarking pre-auth** — local-storage list of recently-viewed and favorited pitchers. Repeat visitors see their last 5 viewed pitchers above the featured strip. Tiny effort, real retention bump before Phase 6 auth.
- **Embeddable comparison player** — beyond static OG images, an iframe-embeddable player that plays the comparison inline on Twitter/Bluesky/iMessage / blog posts. Drives the actual wow moment in-feed.
- **Pitch arsenal scorecard** — single shareable PNG card per pitcher summarizing their arsenal, signature movement, and key stats. Baseball-card vibe; Reddit-friendly format.
- **Strike zone heat map overlay** — density of pitches by zone, optional layer on the strike-zone wireframe. Often the first thing a casual fan looks for.
- **Three+ pitcher comparison** — overlay 3–5 pitchers in shared 3D space ("All five AL aces, sliders only"). Pulls a longer renders-cleanly threshold from Phase 3.
- **Hitter view** — compare batters' performance against pitch types. PLAN backlog. Elevate when comparison product is proven.
- **Annotation and drawing tools** — for coaching tier and content creators. Lines, labels, freehand on top of the 3D scene.
- **Sound design** — opt-in ball-leaving-hand whoosh + plate-arrival pop during playback. Subtle, off-by-default to respect public viewing.
- **ABS strike-zone overlay** — leverage the 2026 coordinate-system change as content. Show the ABS zone vs the umpire-called zone for a given at-bat.
- **Pitcher arsenal evolution timeline** — animated transitions of an arsenal across seasons (year-over-year ribbon morphs).
- **Park-effects integration** — show how the same pitch breaks differently at altitude (Coors) or in dense air (Petco).
- **Custom fantasy scoring filters** — let fantasy players filter pitches by their league's specific scoring rules.
- **Internationalization** — Spanish and Japanese translations. Baseball has huge Latin American and Asian audiences; pay attention to retention from those geos before investing.
