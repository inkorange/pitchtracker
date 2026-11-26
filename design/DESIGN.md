# PitchTracker redesign — implementation handoff

Source of truth: the frames on this canvas (`project/*.dc.html`). This file tells a coding agent which frames are final, the tokens behind them, and the behavior that a static frame can't show. Each `.dc.html` is self-contained HTML; inline styles carry the exact values, and the `<script data-dc-script>` block at the bottom holds sample data and interaction state.

## 1. Which frames to build (and which to ignore)

| Frame file | Status | Route / component |
|---|---|---|
| `Main.dc.html` | **Build** — homepage desktop (hero = photo option A, already applied) | `/` |
| `HomeMobile.dc.html` | **Build** — homepage < 768px | `/` |
| `FeatureExpand.dc.html` | **Build** — already embedded in `Main` (via `<dc-import>`) as the "A pitch lab" section | `<FeatureCards>` desktop |
| `FeatureExpandMobile.dc.html` | **Build** — already embedded in `HomeMobile` as the features section | `<FeatureCards>` mobile |
| `Pitcher.dc.html` | **Build** — pitcher page desktop, docked rail | `/pitcher/[id]/[slug]` |
| `MobileSheetPeek.dc.html` | **Build** — pitcher page mobile, drawer collapsed (chosen: Option A) | same route, < 768px |
| `MobileSheetFilters.dc.html` | **Build** — same drawer, expanded on Filters tab | same |
| `Stats.dc.html` / `StatsMobile.dc.html` | **Build** — `?view=stats` | same route |
| `AtBat.dc.html` / `AtBatMobile.dc.html` | **Build** — at-bat mode (`?vsBatter&abGame&abNum`) | same route |
| `Pitchers.dc.html` / `PitchersMobile.dc.html` | **Build** — new page (nothing exists today) | `/pitchers` |
| `Explore.dc.html` / `ExploreMobile.dc.html` | **Build** — rework of the existing query builder | `/explore` |
| `AtBatReplays.dc.html` | **Build** — rework of `/at-bat` (matchup search first) | `/at-bat` |
| `Teams.dc.html` | **Build** — rework of `/browse` | `/browse` (consider `/teams` + redirect) |
| `TeamStaff.dc.html` | **Build** — team → staff step of browse | `/browse/[team]?season=` |
| `MobileToolbar.dc.html`, `MobileFilterPage.dc.html` | **Do not build** — Option B, rejected in favor of the drawer | — |
| `HeroOptA/B/C.dc.html` | **Reference only** — A was chosen and is already in `Main`/`HomeMobile` | — |

Mobile Stats and At-bat frames were drawn as full pages before the drawer was chosen. Implement them **inside the drawer pattern**: at-bat = scene on top + pitch sequence/transport as drawer content; Stats = drawer at full height. Open decision: drawer snap points — 2 (peek/full) or 3 (peek/half/full). Default to 3 unless told otherwise.

## 2. Tokens

### Color
| Token | Hex | Use |
|---|---|---|
| `--bg` | `#070B14` | page ground |
| `--bg-raised` | `#0A101C` | header, rail, drawer, footer |
| `--surface` | `#0F1626` | cards, inputs |
| `--surface-2` | `#131C30` | card headers, selected rows |
| `--hero-panel` | `#0C1526` | (option B only, unused) |
| `--line` | `#1B2438` | dividers, card borders |
| `--line-strong` | `#2A3650` | input borders, chips, overlay borders |
| `--avatar` | `#1E2A40` | initials avatar, step badges |
| `--text` | `#F3F5F9` | primary text; also the "selected" fill on segmented controls (with `--bg` text) |
| `--text-2` | `#C4CCDB` | secondary text |
| `--text-3` | `#B4BDCE` | body copy on cards |
| `--muted` | `#9AA6BD` | labels, meta (passes 4.5:1 on `--surface`) |
| `--accent` | `#E8364F` | brand crimson: CTAs, ticker, active tab underline, score-bug tag |
| `--accent-hover` | `#FF6B7A` | link hover, destructive text ("Reset", "Clear all") |
| `--highlight` | `#F6C344` | eyebrow labels ("FOR COACHES…", daily-pick labels, decision point) |
| overlay | `rgba(7,11,20,0.86–0.92)` | anything floating on the 3D scene |

### Pitch type colors (data — keep exact)
Four-Seam `#F0505A` · Cutter `#F5A524` · Slider `#B392F0` · Curveball `#4C8DF6` · Changeup `#2DD4BF` · Sinker `#FB7C3C`

### Outcome colors
Swinging strike `#F0505A` · Called strike `#F5A524` · Ball `#4C8DF6` · Foul `#9AA6BD` · In play `#22C55E`

### Type
- **Display / numbers:** Barlow Condensed 600/700/800, italic 700/800. Hero H1 = 800 italic uppercase, 92px desktop / 60px mobile, line-height 0.9, letter-spacing −0.5px. Section H2 = 800 italic uppercase 56px (desktop) / 40px (mobile), line-height 0.95. Card/board titles = 700–800 uppercase 22–32px. Stat values = 700, 20–34px.
- **UI / body:** Inter 400/500/600/700. Body 15–19px, line-height 1.55. Labels = 11px, 600, letter-spacing 1.2px, uppercase, `--muted`.
- Numbers: `font-variant-numeric: tabular-nums`.
- Google Fonts: `family=Barlow+Condensed:ital,wght@0,600;0,700;0,800;1,700;1,800&family=Inter:wght@400;500;600;700` (Next.js: `next/font/google` → `Barlow_Condensed`, `Inter`).

### Shape & spacing
- Radius: 4px controls/cards, 6px panels/monitors, 16px drawer top corners, pill chips = height/2.
- Container: max-width 1240px, side padding 32px (desktop) / 20–24px (mobile).
- Section rhythm: 56–96px vertical padding desktop, 32–56px mobile.
- Touch targets ≥ 44px everywhere (chips 34–40px tall sit inside 44px rows; icon buttons 44×44).

### Broadcast motifs (reusable components)
- **ScoreBug** — row of flush blocks: `[team: --bg-raised] [name: --text bg / --bg text] [tag: --accent]`, Barlow Condensed 700, 16–20px, letter-spacing 0.5–1px, no radius.
- **LowerThird** — overlay box with 4–5px left border (accent or current pitch color), 11px label + 22–30px Barlow value.
- **Eyebrow tag** — accent block with `clip-path: polygon(0 0,100% 0,92% 100%,0 100%)`.
- **Ticker** — full-bleed `--accent` band (edge to edge at any width, NOT capped at the 1240 container), 48px (44 mobile). Slanted black "2026 LEADERS" label pinned left (z-index above the track). Items scroll as a continuous broadcast crawl: render the list 4× in a `width: max-content` track, `translateX(0 → -50%)` over 45s linear infinite, pause on hover/focus; `prefers-reduced-motion` → no animation, track becomes horizontally scrollable. Items separated by 1px `rgba(255,255,255,.35)`. Data = the six leaderboard leaders.

## 3. Page specs

### Global nav (all pages)
- Items: Pitchers · Teams · At-bat replays · Explore · Ask PitchTracker. Active item: `--text`, 600, 3px `--accent` bottom border, `aria-current="page"`.
- Right CTA is **"Find a pitcher ⌘K"** (replaces "Open the tracker"): opens a global pitcher search overlay (command palette, `⌘K` / `Ctrl+K`, results jump to `/pitcher/[id]/[slug]`); with no query it navigates to `/pitchers`.
- Mobile: logo + search + menu buttons; menu opens a full-height sheet with the same items.

### Pitchers (`/pitchers`, new)
- Page head: eyebrow "PITCHERS · 2026", H1 "Find any arm.", name search (52px).
- Mode tabs: **All pitchers | Find by pitch** (`role=tablist`).
- All pitchers: filter bar (Team select, Throws All/RHP/LHP, Role All/SP/RP, Min pitches) + sortable table: Pitcher (avatar, name, team · hand · role) | K | Whiff% | CSW% | FB mph | FB spin | VAA | arsenal mix bar | ▶. Every stat header is a sort `<button>`; `aria-sort` on the `<th>`; active column renders in Barlow 19px. Default sort K desc. Paginate or virtualize. Table scrolls horizontally inside its box below ~1100px.
- Find by pitch: pitch-type chips (colored dot), min-velo stepper (−/+, 1 mph), rank-by select (whiff%, velo, spin, break, usage) → ranked cards (rank, name, team/hand, mini path, MPH/usage/whiff%/spin). Needs a per-pitcher-per-pitch-type aggregate endpoint.
- Mobile: search, mode tabs, filter pill row, stat sort pills (K, Whiff%, CSW%, FB mph, Spin) and a ranked card list showing the sorted stat large on the right.

### Explore (`/explore`, rework)
- Query sentence bar on top (accent left border): "PITCHES by [pitcher] · [types] vs [side] in [season] in [counts] → [results] in [zones]", generated from filter state; Clear.
- Left panel (400px; stacks on narrow) = 4 accordions **Who / What / When / Outcome**, each header shows a one-line summary when collapsed. Sticky footer: live "≈ N pitches" estimate + RUN SEARCH.
  - Who: pitcher multi-select (chips in an input), **batter name search** (replace the batter-ID text field; needs a batter search endpoint), Pitcher throws / Batter stands toggles.
  - What: pitch types grouped Fastballs / Breaking / Offspeed / Other with per-group Select all.
  - When: seasons chips, from/to dates, **count grid** (balls across × strikes down, 12 toggles) + presets (First pitch, Ahead, Even, Behind, 2 strikes, 3 balls), outs, game type select (Postseason group option).
  - Outcome: pitch-result groups (Whiff = swinging strike + blocked + foul tip, Called strike, Foul, Ball, In play, HBP) mapping to raw Statcast codes; at-bat result groups with "More…" for the long tail; batted ball; **clickable zone picker** (3×3 zones 1–9 inside 4 chase quadrants 11–14, catcher view) + In zone / Chase / Clear.
- Results: 5-up summary strip, view tabs (3D scene / Zone heat / Table only), Save query, Copy link (encode filters in the URL), Export CSV; 3D scene; result table with Replay ▶ per row; Load more.
- Mobile: query chips row, 3-up summary, scene, floating "EDIT FILTERS (n)" button → drawer with tabs Who/What/When/Outcome and a sticky "SHOW N PITCHES".

### At-bat replays (`/at-bat`, rework)
- Tabs **Matchup | By game date**; Matchup is default.
- Matchup form: Pitcher search VS Batter search (each shows avatar + team · hand once picked), seasons select, FIND AT-BATS. Batter optional (empty = every PA for the pitcher). Suggested matchup chips.
- Result: ScoreBug "PITCHER | VS | BATTER", 7-up summary (PA, AB, H, K, BB, pitches, whiff%), list rows: date, game, inning, pitch-sequence dots + count, result, Replay ▶ → at-bat mode.
- By game date: date + optional team; **off-season defaults to the last date with games** (not "yesterday"); results as game cards → pick an at-bat.

### Teams (`/browse`, rework) and team page
- Grid: search "Jump to a team", season toggle; American League then National League, each 3 division columns (East/Central/West) with slanted division tags; team rows 68px: abbreviation tile (swap for club logo), full name, optional ★ badge when a staff member leads a leaderboard (e.g. "J. Misiorowski · #1 in K").
- Team page logo: **152×152 club logo** slot left of the team name (dashed placeholder in the mock). Render the real logo from the same source the app already uses for club marks (e.g. `https://www.mlbstatic.com/team-logos/{teamId}.svg`, MIL = 158), `object-fit: contain`, on `--surface` with 16px padding; keep the abbreviation as `alt`-text fallback. Grid tiles on `/browse` use the same logo at 48px.
- Team page: breadcrumb, team tile + NL CENTRAL · PITCHING STAFF + name, season toggle, "Compare staff in 3D"; 6-up staff strip (pitchers, staff K, whiff%, CSW%, avg FB mph, K leader); throws filter; 3-col pitcher cards (avatar, name, hand · pitches, mix bar, K/Whiff%/CSW%/FB mph, ▶) → pitcher page; "Show all N".

### Homepage
- Hero bg: `/field-background.jpg` (existing asset), `object-fit: cover; object-position: 50% 45%` (mobile 50% 30%). Scrims — desktop: `linear-gradient(90deg, rgba(7,11,20,.95) 0%, rgba(7,11,20,.82) 42%, rgba(7,11,20,.45) 100%)` + bottom 120px fade to `.85`; mobile: `linear-gradient(180deg, rgba(7,11,20,.6) 0%, rgba(7,11,20,.88) 45%, #070B14 100%)`. Use `isolation: isolate` on the section and `z-index:-1` on the bg layer.
- Hero right = "monitor": the **real** 3D scene component in a 16:10.5 frame, non-interactive, FRONT camera, season paths, with ScoreBug top-left, LowerThird + camera pill bottom. Lazy-load; poster image fallback.
- Section order: Nav → Hero → Ticker → Feature cards → Daily picks → Leaderboards (3×2) → Film room → Ask → Featured pitchers → Footer (keep existing legal copy verbatim).
- Mobile leaderboards: one board at a time with a scrollable pill tablist (Velo, K, Whiff%, CSW%, Spin, VAA).
- Replace initials avatars with the real mlbstatic headshots; team abbreviation pills can become club logos as today.

### Feature cards (`FeatureExpand*`)
- Desktop: 4 cards in a flex row, height 540px. One card is always open (default index 0). Open card `flex: 2.6 1 0`, idle `flex: 1 1 0` (≈587px / ≈226px at 1240 container). Transition: `flex-grow .4s cubic-bezier(.2,.7,.2,1)`.
- Same DOM for idle and open — **do not swap layouts**: 250px visual band on top, header (number + title, top-aligned) below. Open adds (fade-up `.35s` with `.18s` delay): body copy, 3 steps in a 3-col grid, CTA; and per-visual extras (camera bar / mph+usage / pitch sequence).
- Triggers: `mouseenter` and `focus` open; leaving the row keeps the last-open card (no collapse-to-nothing). Keyboard: each idle card's "Preview" is a real `<button aria-expanded>`.
- Visuals: 01 real scene (lazy-mount R3F only for the open card; idle shows a static poster), 02 Tunnel camera, 03 arsenal bars from the featured pitcher's real arsenal, 04 zone map + sequence from a real at-bat.
- Mobile: accordion, one open at a time, chevron rotates 180°, 220px visual, steps stacked, full-width CTA.
- `prefers-reduced-motion`: no path draw/fade; width change only (or instant).

### Pitcher page — desktop (`Pitcher.dc.html`)
- Layout: 56px top bar + body row. Left rail 384px fixed (`--bg-raised`, border-right), scene fills the rest — the rail **no longer overlays** the scene.
- Rail: header (avatar, name, meta, season segmented control, 4-up stat strip K / Whiff% / CSW% / FB mph) → tabs **Arsenal | Filters (badge = active filter count) | Games** → scrolling tab body → sticky footer (pitch count + "Find at-bats").
- Arsenal rows are **toggle buttons** (`aria-pressed`) and are the pitch-type filter — remove the separate pitch-type chip group.
- Scene overlays: active-filter chips top-left (each removable, "+ Add filter" jumps to Filters tab); legend top-right with "Color by: Pitch type | Outcome"; LowerThird bottom-left; bottom-right camera group FRONT/BACK/TOP/SIDE/**TUNNEL** (Tunnel becomes a camera, not a checkbox), HEAT toggle, settings.
- "Ask" moves into the top bar (replaces the floating purple FAB).
- `3D scene | Stats` segmented control lives at the top of the main area (see Stats).

### Pitcher page — mobile (drawer)
- Header 56px (back, name + meta, Ask, Search). Scene below. Filter chips row overlaid at top of the scene, horizontally scrollable. Camera segmented control overlaid above the drawer.
- Drawer: 16px top radius, grab handle (24px hit area), pitch count line, tabs Arsenal | Filters | Games.
  - Peek (~248px): arsenal as horizontally scrolling toggle cards.
  - Expanded (top ≈ 150px): full tab content; Filters tab ends in sticky "Reset" + "View N pitches".
- Pitch count updates live as filters change (no apply step needed; the button just collapses the drawer).
- Use a proper sheet (e.g. Vaul / react-spring bottom sheet) with drag + snap, focus trap when expanded, Esc/back collapses.

### Stats view (`?view=stats`)
- Toggle `3D scene | Stats` (desktop top of main; mobile top of drawer/page).
- Game line as an 11-cell score strip (12 on mobile, 4 columns) with accent top border: IP, K, BB, H, HR, XBH, ER, BF, Pitches, Strikes, (Balls), Strike %.
- "By pitch type" table: #, usage bar, avg mph, max, spin, strike%, whiffs, CSW%. Mobile = one card per pitch type, 4-up mini stats.
- Outcome mix stacked bar + legend counts; Batter-side split; At-bat list rows (inning, batter, pitch-sequence dots, result, ▶) linking into at-bat mode.

### At-bat mode
- Desktop rail swaps to: "AT-BAT REPLAY" tag, pitcher-vs-batter header (names truncate with ellipsis, full names in `aria-label`), date/game/AB#, pitch sequence list (numbered color badge, type, result, mph, count after), result, prev/next at-bat, "All at-bats vs …". Top bar gets "Share at-bat" and "Exit at-bat".
- Scene: only pitches up to the current one are drawn; current = full opacity + thicker, earlier = 45%. ScoreBug "PITCH n OF N | count | mph" top-left; zone inset (catcher view, numbered dots, current ringed white) top-right; LowerThird with current pitch; transport bar (prev, play, next, scrubber ticks colored by pitch type, speed, camera group).
- Mobile: header with matchup (ellipsis per name), scene 520px with score bug + mini zone, then lower-third, horizontally scrolling pitch cards (100px wide so the 4th card is half visible as a scroll hint; labels `white-space: nowrap`, short names "4-Seam/Slider/Curve/Cutter", results "Called/Whiff/Ball/Foul"), transport row.
- Keyboard: ←/→ step pitches, Space play/pause (scope listeners to the scene, not global).

## 4. Data the frames assume

Real (from the live site): leaderboards, Misiorowski arsenal (velo/usage/counts), game list, Oct 11 vs LAD game line, Pitch/Whiff of the season.

**Sample / placeholder on the nav pages:** Pitchers table cells not from the leaderboards (and all arsenal mix bars except Misiorowski), Find-by-pitch results, Explore summary/table rows/estimates, matchup summary + at-bat rows on At-bat replays, all team staff stats and mix bars (roster names and handedness on the MIL page are real, from the MLB Stats API 2026 full-season roster).

**Sample / placeholder — wire to real data:** per-pitch-type stats on the Stats view, outcome counts, batter-side splits (`[n]`), at-bat list batter names (`[Batter 1]`…), the 6-pitch Crow-Armstrong sequence, the live filtered counts (frames use a rough multiplier), Ask example queries (confirm the app can answer them).

Needed per pitch for the at-bat view: sequence index, pitch type, release speed, description/outcome, balls-strikes before and after, plate_x / plate_z (zone inset), trajectory (already used by the scene).

## 5. Accessibility checklist
- Real `<button>`/`<a>`/`<input>`+`<label>`; tabs use `role="tablist"/"tab"` + `aria-selected`; toggles use `aria-pressed`; expanders `aria-expanded`; current pitch `aria-current="step"`.
- Icon-only buttons have `aria-label`. Decorative SVG `aria-hidden`; informative SVG (zone, tunnel) `role="img"` + label.
- Color is never the only signal: pitch types also carry names/numbers; outcomes carry labels.
- Contrast pairs above pass 4.5:1 for text; keep `--muted` as the floor for small text.
