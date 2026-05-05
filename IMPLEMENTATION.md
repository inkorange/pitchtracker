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

## Data architecture

### Persisted in Supabase

| Table | Refresh strategy | Notes |
| --- | --- | --- |
| `pitchers` | Weekly cron during season, monthly off-season | MLB Stats API. ~1500 active players. |
| `games` | Daily cron at 4am ET | MLB Stats API. Last 30 days + upcoming 7 days. |
| `game_pitches` | Lazy-fetch on first request, then cached forever | Savant CSV → parsed → upserted. Keyed by `game_pk`. Re-fetched if `fetched_at < game_date + 7 days` to catch retroactive Statcast updates. |
| `pitcher_aggregates` | Weekly cron during season | Savant player-services endpoint. Per pitcher × season × pitch type, with vs-LHB and vs-RHB splits. |
| `notable_at_bats` | Daily cron, last 7 days | Computed from leverage, big-name matchups, multi-pitch whiffs. Phase 4. |
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
6. Build the base 3D scene in `components/scene/`:
   - r3f `Canvas` with reasonable defaults (DPR cap 2, antialias).
   - Strike zone wireframe in neutral color.
   - Home plate as a low-poly white pentagon.
   - Background gradient that doesn't compete with foreground.
   - Bloom post-processing pass tuned for ribbon glow.
7. Implement the pitch ribbon mesh (`components/ribbon/`) — a tube geometry along the sampled path with emissive material, color taken from the pitch type. Tune until it looks like Pitching Ninja, not a scientific plot.
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
3. Cron job: `GET /api/cron/refresh-pitchers` — pulls active pitchers from MLB Stats API, upserts into `pitchers`. Scheduled weekly via `vercel.ts`. Idempotent.
4. Cron job: `GET /api/cron/refresh-games` — pulls schedule for the last 30 + next 7 days, upserts into `games`. Scheduled daily.
5. Cron job: `GET /api/cron/refresh-aggregates` — for active pitchers, refreshes `pitcher_aggregates` for the current season. Weekly during season.
6. Hybrid pitch fetcher (`app/api/pitches/route.ts`):
   - Read from `game_pitches` if `fetched_at` is fresh.
   - Otherwise fetch from Savant, upsert, return.
   - Tagged Vercel Runtime Cache entry per `gamePk` for in-region dedup.
7. Pitcher search and selection UI — typeahead on `pitchers` table, recent / featured pitchers as defaults.
8. Single pitcher page at `/pitcher/[id]`:
   - Server component pulls aggregates and game list.
   - Client component renders the 3D scene with the full arsenal.
   - Each pitch type rendered as a translucent cloud of individual pitches plus one bold ribbon for the average path.
9. Filter UI bound to URL search params:
   - Date range (last 7 / 30 / season / last season / custom)
   - Batter handedness (vs LHB / vs RHB / both)
   - Count (any / hitter's / pitcher's / two-strike / three-ball / full)
   - Outcome (any / whiff / called strike / ball / in play / hit)
   - Game situation (any / high leverage / RISP)
10. Stat panel rendering aggregates per pitch type from `pitcher_aggregates`.
11. Single-pitch playback (lifted from Phase 1) accessible from any individual pitch in the cloud or from the average ribbon.

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

1. Selection UI for two pitchers, accessible from `/compare` or from a "compare with..." button on `/pitcher/[id]`.
2. Independent filter state per pitcher, encoded in URL search params (`?a.pitcher=...&a.window=...&b.pitcher=...&b.window=...`).
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
2. At-bat search UI at `/at-bat`:
   - Recent games list, drilling into at-bat lists per game.
   - "Notable at-bats" curated feed sourced from `notable_at_bats`.
   - Direct lookup by `game_pk` + `at_bat_number`.
3. At-bat replay page at `/at-bat/[gamePk]/[atBatNumber]`:
   - Server component pulls all pitches for that at-bat from `game_pitches` (hybrid-fetches the game on first visit).
   - Pulls live game state from MLB Stats API `feed/live` for batter/pitcher identification, count progression, runners, score, leverage at each pitch.
4. Sequential pitch animation:
   - Each pitch animates in turn, with configurable inter-pitch delay (default ~1.5s).
   - Cumulative ribbons stay visible by default — the whole at-bat reads as a tunnel pattern by the end.
   - "Step" controls: play, pause, scrub, jump-to-next-pitch, jump-to-previous-pitch.
   - Per-pitch outcome label appears as the ball lands (ball, called strike, swinging strike, foul, in play with result).
5. Game-state HUD:
   - Count badge updates pitch-by-pitch.
   - Baserunner diamond updates pitch-by-pitch.
   - Batter / pitcher names + headshots.
   - Final outcome card at the end of the sequence (walk, K, single, HR, etc.).
6. Camera presets work mid-sequence. A new "follow" mode tracks the active pitch with a slight lag for cinematic feel — opt-in, not default.
7. Shareable URL encoding `gamePk`, `atBatNumber`, camera preset, and playback state (paused at pitch N, etc.).
8. OG image generation for at-bat URLs — server-rendered PNG showing the cumulative tunnel from the side preset.

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

1. Reduce particle counts and ribbon segment counts on touch devices.
2. Cap pixel ratio at 2.
3. Front-preset default in portrait orientation, side-preset default in landscape.
4. Optional 2D side-on projection fallback for very small screens (< 380px width). Trigger via a `prefers-reduced-motion`-style override too.
5. Real-device test pass on iPhone and Android before sign-off. Chrome devtools simulation does not count.

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

## Vercel-specific configuration

- **Crons** declared in [`vercel.ts`](vercel.ts):
  - `0 8 * * 1` — refresh pitchers (weekly).
  - `0 8 * * *` — refresh games (daily).
  - `0 9 * * 1` — refresh aggregates (weekly).
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
