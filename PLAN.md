# PLAN.md

## What this is

A web app that visualizes MLB pitch trajectories in 3D, with the primary purpose of comparing pitchers and analyzing the outcomes of those pitches. Built on free, public Statcast data. The headline feature is overlaying two pitchers' arsenals in shared 3D space so you can see exactly how their pitch shapes differ. The secondary feature is replaying full at-bat pitch sequences as 3D animations with rich context (count, runners, leverage, outcome). The third pillar is a data-mining layer that lets users find pitch comparisons that produced specific outcomes, like "show me every Skubal slider that got a swinging strike against a left-handed batter in a two-strike count."

## Why it exists

The existing landscape has two extremes. Baseball Savant and FanGraphs have all the data but communicate it through static 2D plots and dense tables. Pitching Ninja and similar accounts have beautiful visual content but no underlying analytical tool. The space between is wide open. There is no public-facing site that lets a user select two pitchers, two pitch types, and see them rendered as light-emitting ribbons in shared 3D space, with the moment of divergence marked, the spin axes shown correctly, and outcome data layered on top.

The goal is to make pitch shape, tunneling, and outcome correlation visible to anyone who watches baseball, not just analysts with TrackMan licenses. The audience is fantasy players, baseball Twitter, hobbyist analysts, and amateur coaches.

## Audience tiers

1. Casual baseball Twitter and Reddit users who want shareable visualizations. They drive viral traffic.
2. Fantasy players and analytical hobbyists who want depth. They drive retention.
3. Amateur coaches at high school, college, and independent ball levels who want a teaching tool. Potential paid tier.
4. Media-adjacent analysts and writers who give the tool credibility if they reference it. Smallest audience, largest signal-boost value.

The MVP targets tiers 1 and 2. Tier 3 monetization comes later. Tier 4 is a side effect of building the tool well.

## Data sources

### Primary

**Baseball Savant Statcast.** Free, public, the source of truth for everything since 2015. Accessed via the `pybaseball` Python package or by direct CSV export from the Savant search interface. Roughly 700,000 pitches per season, around 78 columns per pitch.

Key fields used for trajectory reconstruction:
- `release_pos_x`, `release_pos_y`, `release_pos_z`: release point in feet
- `vx0`, `vy0`, `vz0`: velocity components at y=50ft in ft/sec
- `ax`, `ay`, `az`: acceleration components at y=50ft in ft/s squared
- `plate_x`, `plate_z`: location at the plate
- `release_speed`, `release_spin_rate`, `spin_axis`
- `pfx_x`, `pfx_z`: horizontal and induced vertical break
- `effective_speed`, `release_extension`
- `pitch_type`, `pitch_name`

Key fields used for context:
- `game_pk`, `game_date`, `at_bat_number`, `pitch_number`
- `pitcher`, `batter`, `stand` (batter handedness), `p_throws`
- `balls`, `strikes`, `outs_when_up`, `inning`, `inning_topbot`
- `on_1b`, `on_2b`, `on_3b`
- `description`, `events`: pitch outcome and plate appearance result
- `delta_run_exp`, `delta_home_win_exp`: leverage and value

### Secondary

**MLB Stats API.** Free, official, used for live game feeds, roster data, player metadata, headshots licenses (where available), team logos, and game-state info that Statcast doesn't surface cleanly. Access without authentication.

**Retrosheet.** Historical play-by-play, useful for pre-Statcast era backfill if we ever want to extend before 2015. Not needed for MVP.

### Things to be aware of

- Statcast data for the current season can be retroactively updated. Cache aggregates but rebuild them on a schedule.
- Pitch classification is imperfect. Some pitchers' sliders are really sweepers, some cutters are really hard sliders. We need a normalization layer and a way to expose both Savant's classification and a movement-cluster-based one.
- Coordinate convention changed in 2026: plate location was front-of-plate through 2025, now middle-of-plate to align with the ABS system. Apply a coordinate adjustment when comparing across that boundary.
- Some pitches have null tracking data. Foul tips behind the plate, equipment issues, weird angles. Code defensively.
- We can't redistribute bulk Statcast data. Keep it server-side, expose only computed views and the daily slices the app needs.

## Core features

### 1. Single pitcher view

The starting page for any pitcher. Pick a pitcher, see their full pitch arsenal in 3D, side-on view by default. Each pitch type rendered as a translucent cloud of all individual pitches plus one bold ribbon showing the average path.

Filters:
- Date range (last 7 days, last 30, this season, last season, custom)
- Batter handedness (vs LHB, vs RHB, both)
- Count (0-0, hitter's counts, pitcher's counts, two-strike, three-ball, full)
- Outcome (all, swinging strike, called strike, ball, in play, hit)
- Game situation (high leverage, RISP, none)

Stat panel showing per-pitch-type aggregates: average velo, spin rate, vertical break, induced vertical break, horizontal break, spin efficiency, usage percentage, whiff rate, called strike rate, run value per 100 pitches.

Playback: any individual pitch (or the average ribbon for a pitch type) can be played through its flight path from release to plate with timing controls (play, pause, scrub, replay). Playback respects the global camera preset, so the user can watch the same pitch from front, back, top, or side without restarting the animation.

### 2. Two-pitcher comparison

The headline feature. Pick two pitchers, optionally pick a specific pitch type to compare. Rendered overlay in shared 3D space.

Important defaults:
- Release points are normalized to a shared origin so movement is directly comparable. A toggle reveals "true release" mode showing actual arm slots.
- Average path ribbons shown bold by default. Individual-pitch clouds available as a layer toggle.
- Stat overlays anchored to the path itself, not in a sidebar. Velo near the release end, break near the plate end.
- The tunneling point (where the two paths are closest, and where they diverge by more than a configurable threshold) marked visually with a labeled point.
- Color scheme has to read well in overlay. Pitcher A is one color family, Pitcher B is another. Both colors should be distinguishable from each other and from the pitch-type semantic colors used elsewhere.

Filters mirror the single pitcher view but apply independently to each pitcher.

Comparison playback: both pitches play through their flight paths simultaneously, synchronized to release time so the user can watch the divergence happen in real time. Same timing controls as single playback (play, pause, scrub, replay), with an optional "ghost" trail that leaves the path visible behind the leading edge of the animation. Camera presets and free-orbit rotation work identically during playback.

### 3. At-bat replay

A full pitch sequence rendered as an animated 3D scene. The user picks an at-bat (via search, recent games, or a curated "notable at-bats" feed) and watches the pitches come in sequentially with full context.

Features:
- Pitch ribbons appear in sequence with timing controls (play, pause, scrub, jump to next pitch)
- Count visible, baserunners visible, batter and pitcher identified
- Each pitch's outcome shown as it lands (ball, strike looking, swinging strike, foul, in play with result)
- Cumulative pitch ribbons remain visible by default so you can see the whole at-bat as a tunnel pattern
- Camera presets: front, back, top, side (see Visualization design > Camera for the canonical preset definitions)
- Final outcome shown at the end of the sequence
- Shareable URL encoding the at-bat ID and camera angle

### 4. Outcome mining and discovery

The data-mining layer. Lets users find pitches matching specific criteria, then use those results as a comparison dataset.

Query interface (start with form-based, expand to natural language later):
- Pitcher (specific or any)
- Batter (specific or any)
- Pitch type (one or many)
- Count
- Batter handedness
- Outcome
- Date range
- Game situation
- Leverage threshold

Result modes:
- Aggregate view: stats across the matching pitches
- Individual view: scrollable list of matching pitches, each linkable to its at-bat replay
- Visualization view: all matching pitches rendered as a cloud in 3D, with the average ribbon highlighted

Example queries the UI should make easy:
- "Every swinging strike Skubal got with his slider in 2025"
- "Every Cole fastball that was hit for an extra-base hit in a two-strike count"
- "All sweepers thrown to RHBs in 0-2 counts that resulted in a whiff"
- "Every pitch a pitcher threw in a full count with the bases loaded last season"

The discovery angle here is showing where the *positive* outcomes for a pitcher cluster (movement, location, sequencing) versus where the *negative* outcomes cluster. Side-by-side rendering of "sliders that got whiffs" versus "sliders that got hit hard" reveals what made the good ones work.

### 5. Tunneling explorer (stretch goal for MVP)

A specialized view that asks: which two pitches in this pitcher's arsenal tunnel best together? Computed by finding the pitch-type pair that stays closest along the early part of the trajectory (from release to roughly 30-40 feet) before diverging. Important for analytical credibility because tunneling is what every pitching coach talks about.

## Tunneling math

Tunneling is the art of having two different pitches look identical out of the hand and along the early part of their flight, then breaking differently late, leaving the hitter unable to commit to one read.

Computational definition:
- For two pitch trajectories sampled at 1ms intervals, compute the distance between corresponding points in space at each timestep.
- The "tunnel point" is the latest moment in time when the two paths are still within some threshold (commonly 1.5 to 2 inches) of each other.
- The "commit point" is roughly when the hitter has to decide to swing, around 175ms before the ball reaches the plate, or roughly 25 feet from home plate at typical velocities.
- A good tunnel keeps the paths within threshold past the commit point.
- A bad tunnel diverges before commit, giving the hitter time to read the pitch.

Tunnel quality score:
- Distance between paths at the commit point. Smaller is better.
- Combined with movement difference at the plate. Larger is better.
- Score = (movement_diff_at_plate) / (distance_at_commit). High is good.

This is the metric that makes the site analytically interesting beyond pretty visualizations.

## Trajectory reconstruction

Statcast records the constant-acceleration model parameters at y=50 feet. To reconstruct the actual path:

```
position(t) = p0 + v0 * t + 0.5 * a * t^2
```

where `t` is time since the y=50ft reference frame, in seconds.

To get the path from actual release point (typically y around 55 feet) to the front of the plate (y=0 in 2025, y around 0.85 in 2026 with the middle-of-plate convention), back-solve for the time at the actual release y-coordinate, then integrate forward at 1ms steps until y reaches the target plate position.

Implementation as a JS class:

```
class Pitch {
  constructor(statcastRow) { ... }
  positionAtTime(t) { return [x, y, z] }
  path(samples = 50) { return Array<[x, y, z]> }
  velocityAt(y) { return mph }
  breakAt(y) { return [horizontalBreak, verticalBreak] }
}
```

This is around 50 lines of straightforward kinematics code. Test it against the recorded plate_x and plate_z values from Statcast to confirm accuracy.

## Architecture

### Stack

- **Frontend**: Next.js 15 with React Server Components, TypeScript
- **3D rendering**: Three.js with `react-three-fiber` and `drei` for camera controls and helpers
- **Database**: Supabase (Postgres) for pitch data, aggregates, and user-saved comparisons
- **Hosting**: Vercel
- **Data ingestion**: Python script using `pybaseball`, run as a scheduled job
- **Schedule**: Vercel cron triggers daily ingestion at a quiet hour

### Data pipeline

Daily job:
1. Pull yesterday's pitches via `pybaseball.statcast(start_dt=yesterday, end_dt=yesterday)`
2. Insert into Supabase `pitches` table with all relevant fields
3. Recompute pitcher-level aggregates for the rolling last-30-days window
4. Recompute pitcher × pitch-type aggregates for the rolling last-30-days window
5. Tag notable at-bats from yesterday for the curated feed (high leverage, big names, multi-pitch sequences with whiffs)

Backfill job (one-time):
1. Pull full 2024 and 2025 seasons
2. Insert with same schema
3. Run aggregate computations for full-season windows

### Database schema

`pitches` (one row per pitch, the raw fact table):
- `id` (primary key, derived from game_pk + at_bat_number + pitch_number)
- `game_pk`, `game_date`, `at_bat_number`, `pitch_number`
- `pitcher_id`, `batter_id`, `stand`, `p_throws`
- `pitch_type`, `pitch_name`
- All trajectory fields (release_pos_x/y/z, vx0/vy0/vz0, ax/ay/az, plate_x/z, etc.)
- All context fields (balls, strikes, outs, inning, runners, description, events, delta_run_exp)
- `season`, indexed for fast season-scoped queries
- Indexes on pitcher_id, batter_id, game_pk, season, pitch_type

`pitchers` and `batters`:
- `mlb_id`, `name`, `team`, `position`, `bats`, `throws`, `headshot_url`
- Refreshed periodically from MLB Stats API

`pitcher_pitch_aggregates` (precomputed, refreshed daily):
- `pitcher_id`, `pitch_type`, `window_type` (last_30, season_2025, etc.), `window_start`, `window_end`
- Average velocity, spin rate, vertical break, horizontal break, induced vertical break, spin efficiency
- Usage percentage, whiff rate, called strike rate, run value per 100, batting average against
- vs_lhb and vs_rhb variants

`notable_at_bats` (curated feed):
- `game_pk`, `at_bat_number`
- `pitcher_id`, `batter_id`
- `leverage_score`, `notability_reason` (high leverage, big name matchup, etc.)
- Refreshed daily for the last 7 days

`saved_comparisons` (user feature):
- `id`, `user_id`, `comparison_state` (JSON encoding the full comparison config)
- `created_at`, `share_slug`

### API

Next.js API routes (or RSC server actions, depending on what fits each query):

- `GET /api/pitcher/[id]` - pitcher metadata
- `GET /api/pitcher/[id]/pitches?filters=...` - pitches matching filter criteria
- `GET /api/pitcher/[id]/aggregates?window=last_30` - precomputed aggregates
- `GET /api/at-bat/[gamePk]/[atBatNumber]` - full pitch sequence for an at-bat
- `GET /api/notable-at-bats` - curated feed
- `POST /api/query` - mining queries with arbitrary filter combinations
- `POST /api/save-comparison` - save a comparison state for sharing
- `GET /api/comparison/[slug]` - load a saved comparison

## Visualization design

### Color system

Two-axis color system. Pitch type provides semantic color (red family for fastballs, blue family for breaking, green family for offspeed). When comparing two pitchers, each pitcher gets a hue offset within their pitch-type families so they remain distinguishable.

Approximate semantic colors:
- Four-seam fastball: warm red
- Sinker: warm orange-red
- Cutter: amber
- Slider: violet
- Sweeper: bright blue-violet
- Curveball: deep blue
- Knuckle curve: indigo
- Changeup: teal
- Splitter: green
- Knuckleball: yellow

### Visual treatment of pitch ribbons

The aesthetic should feel like Pitching Ninja video clips, not like a scientific plot. Specifically:
- Pitch paths rendered as glowing tubes, not thin lines
- Some bloom or emissive material so the colors feel alive
- Subtle motion: even a static rendering should have a slight rotation animation on the ribbons or particles flowing along the path, for visual interest
- Strike zone wireframe in a neutral color, sized per batter from MLB Stats API roster data
- Plate as a low-poly white pentagon at z=0
- Background gradient that doesn't compete with the foreground

### Camera

Four fixed presets, available from every view (single pitcher, comparison, at-bat replay) and switchable mid-playback without restarting the animation:

- **Front** — looking down the pitch flight from behind home plate toward the mound. The hitter's-eye perspective. Default on mobile portrait.
- **Back** — looking down the pitch flight from behind the pitcher toward home plate. The pitcher's perspective.
- **Top** — bird's-eye view straight down, useful for reading horizontal break and tunneling overlap.
- **Side** — third-base-side profile view, the canonical pitch-shape angle. Default on desktop.

Free-orbit mode is available alongside the presets via `react-three-fiber` and `drei`'s `OrbitControls`, with a "reset view" button that returns to the last-used preset.

Camera transitions between presets are tweened, not snapped. Roughly two seconds of smooth motion between angles helps the user maintain spatial orientation, especially when switching mid-playback.

### Mobile considerations

3D scenes on phones are computationally expensive and visually compromised. Plan for it but accept it's degraded.
- Reduce particle counts
- Cap pixel ratio at 2
- Hitter's-eye default in portrait
- Maybe switch to a 2D projection of the side-on view for very small screens
- Test on real devices early, not just Chrome devtools

## Monetization

Free tier:
- All visualization features
- Single pitcher view, two-pitcher comparison, at-bat replay
- Outcome mining with reasonable result limits
- Shareable URLs with site watermark

Paid tier (target $5 to $15 per month):
- High-resolution video export of any visualization
- Custom annotations and text overlays for teaching use
- Saved comparisons that persist across sessions
- No watermarks on shared content
- Priority cron refresh during the season

Pro tier (later):
- API access
- Team-branded versions for college and indie ball programs
- Batch processing
- Larger result limits on mining queries

Affiliate angles:
- Pitching books and instructional content
- Training tools and pitching aids
- Baseball gloves and equipment
- MLB.tv subscriptions

## Branding and naming

Working name: TBD. Candidates that fit the concept:
- *Tunnel* (clean, on-theme)
- *Arsenal* (already taken in baseball context, probably skip)
- *Trace* (suggests path, simple)
- *Heatpath* (descriptive)
- *Pitchworks* (industrial, distinctive)

Final name should:
- Be one or two syllables
- Be available as a .com
- Suggest pitching or trajectory without being too literal
- Look good in lowercase as a logo

The brand voice: knowledgeable but not pretentious, clean visual identity, subtly sophisticated. Closer to Linear or Vercel than to ESPN. Built for people who already love baseball and want better tools.

## Roadmap

### Phase 1: Foundation (target: 2 weekends)
- Set up Next.js project, Supabase, Vercel
- Build pure JS Pitch class with positionAtTime, path, breakAt
- Test trajectory math against known Statcast plate_x and plate_z values
- Build minimal data ingestion pipeline for one game
- Render a single pitch in Three.js correctly

### Phase 2: Single pitcher view (target: 1 weekend)
- Pull a full season for one pitcher
- Compute and store aggregates
- Render the full arsenal in 3D
- Add filter controls
- Add stat panel

### Phase 3: Two-pitcher comparison (target: 1 weekend)
- Selection UI for two pitchers
- Synchronized release point logic
- Overlay rendering
- Comparison stat panel
- Shareable URLs encoding the comparison

### Phase 4: At-bat replay (target: 1 weekend)
- At-bat search and notable at-bats feed
- Sequential pitch animation with timing
- Outcome rendering for each pitch
- Cumulative tunnel visualization

### Phase 5: Outcome mining (target: 1 to 2 weekends)
- Query builder UI
- Server-side query execution against Supabase
- Result modes (aggregate, list, visualization)
- Saved queries

### Phase 6: Polish and growth (ongoing)
- Mobile improvements
- Tunneling explorer
- Video export for share clips
- Paid tier infrastructure
- Reddit and Twitter launch posts

### Backlog
- Hitter view (compare batters' performance against pitch types)
- Pitcher arsenal evolution over a season
- Park-effects integration
- ABS strike-zone overlay (using your prior writing as content)
- Custom fantasy scoring filters

## Risks and open questions

**Will rendering quality be good enough to stand out?** The whole pitch is "this looks better than 2D plots." If the Three.js rendering looks like a worse FanGraphs chart, no one uses the site. The first week of work should be primarily about getting the visual quality right with a single pitch, before scaling to the full feature set.

**Will the data pipeline keep up during the season?** Pulling 700,000 pitches a season works, but daily incremental updates have to be reliable. Plan for failures, retries, and backfill mechanisms.

**Will MLB ever push back?** Probably not for a fan project that visualizes their own public data, but worth keeping the legal posture conservative. Don't expose bulk data dumps. Don't use any branding that implies MLB endorsement. Watch for cease-and-desist patterns from MLB legal (rare but happens).

**Can we make tunneling math actually correct?** The 1ms integration step is straightforward. The harder part is choosing the right thresholds and commit-point definition. Plan to talk to actual pitching coaches or analysts to validate the tunneling score makes sense to them.

**How do we handle pitch classification ambiguity?** Decide upfront: trust Savant's classification, or build a movement-cluster reclassification. Probably trust Savant for v1 and revisit.

**Does the brand identity need a designer?** Probably yes for the logo and color system, no for the rest. Budget a small design pass before launch.

## Success criteria

The MVP succeeds if:
- A baseball-knowledgeable visitor immediately understands what the site does within 10 seconds of landing
- The two-pitcher comparison feature feels like the "wow" moment that drives sharing
- A single Reddit post on r/baseball or r/Sabermetrics generates organic traffic
- At least one analyst or writer with an audience references the tool in their content within the first month
- Day-2 retention is greater than 15 percent for organically acquired users

The post-MVP signals to watch:
- Are people saving and sharing comparisons, or just looking once and leaving?
- Does the outcome mining feature get used at all, or is it a power-user feature with no audience?
- Does mobile usage exceed 30 percent? If yes, mobile experience needs more investment.
- What's the most-shared comparison, and what does it tell us about what users want?