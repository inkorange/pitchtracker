# AI Route Vocabulary

The reference document the AI chat layer uses to translate natural-language
requests into pitchtracker URLs. Every user-visible feature on the site should
be reachable from a URL alone — no client-side handshake, no localStorage —
so the AI can deep-link to any view, and so visitors can share snapshots.

When you add a new feature that changes what's on screen, add the
corresponding URL parameter here and document the enum values it accepts.

---

## Routes

### `/pitcher/{mlb_id}` — pitcher arsenal in 3D

| Param     | Type                          | Default       | Description                                                        |
| --------- | ----------------------------- | ------------- | ------------------------------------------------------------------ |
| `season`  | integer (year)                | current year  | Active season. e.g. `2025`                                          |
| `pitch`   | comma list of pitch codes     | all           | Filter to pitch types. See PITCH_TYPES below                       |
| `hand`    | `L` \| `R`                    | both          | Batter handedness filter                                            |
| `game`    | integer (game_pk)             | (off)         | Filter to a single game's pitches                                   |
| `outcome` | comma list                    | all           | One or more of `whiff`, `called`, `ball`, `foul`, `inplay`         |
| `tun`     | `true` \| (omit)              | off           | Show the pitch-tunneling envelope around the visible pitches       |
| `view`    | `arsenal` \| `stats`          | `arsenal`     | Switch between the 3D arsenal scene and the analytics-cards view  |
| `vsBatter`| integer (mlb_id)              | (off)         | When set, opens the matchups panel filtered to that batter         |
| `abGame`  | integer (game_pk)             | (off)         | Replay mode: the at-bat's game                                      |
| `abNum`   | integer (1-indexed)           | (off)         | Replay mode: the at-bat's number within that game                  |

**Examples**

- All of pitcher 694973's curveballs in 2025:
  `/pitcher/694973?season=2025&pitch=CU`
- Whiffs against lefties only:
  `/pitcher/694973?hand=L&outcome=whiff`
- Tunneling overlay on fastballs + sliders:
  `/pitcher/694973?pitch=FF,SL&tun=true`
- Pitcher's stats-card view:
  `/pitcher/694973?view=stats`

### `/at-bat` — at-bat index

| Param   | Type                  | Default     | Description                                  |
| ------- | --------------------- | ----------- | -------------------------------------------- |
| `date`  | YYYY-MM-DD            | yesterday   | Browse games on this date                    |
| `team`  | integer (team_id)     | all teams   | Filter the day's games to a single team      |

### `/at-bat/{game_pk}` — game at-bat list

(No optional params; lists every at-bat in the game.)

### `/at-bat/{game_pk}/{at_bat_number}` — at-bat replay

| Param    | Type     | Description                                       |
| -------- | -------- | ------------------------------------------------- |
| `camera` | string   | Camera preset (`front`, `pitcher`, `batter`)      |
| `pitch`  | integer  | Highlight this pitch index inside the at-bat      |

### `/explore` — advanced pitch search

All filters are short codes managed by `nuqs` for compact share-links. Multi-value
params are comma-separated.

| Param  | Type                              | Description                                                                 |
| ------ | --------------------------------- | --------------------------------------------------------------------------- |
| `pid`  | int list                          | Pitcher mlb_ids                                                              |
| `bid`  | int list                          | Batter mlb_ids                                                               |
| `pth`  | `L` \| `R`                        | Pitcher throws                                                               |
| `bst`  | `L` \| `R`                        | Batter stands                                                                |
| `pt`   | string list (pitch codes)         | Pitch types                                                                  |
| `s`    | int list (years)                  | Seasons                                                                      |
| `df`   | YYYY-MM-DD                        | Game date from                                                               |
| `dt`   | YYYY-MM-DD                        | Game date to                                                                 |
| `c`    | string list                       | Counts (e.g. `0-0`, `3-2`)                                                   |
| `o`    | int list                          | Outs in inning (0, 1, 2)                                                     |
| `inn`  | int list                          | Inning numbers                                                               |
| `gt`   | string list                       | Game types (see GAME_TYPES below; default to `R` if user just says "games") |
| `d`    | string list                       | Pitch descriptions (see DESCRIPTIONS below)                                  |
| `ev`   | string list                       | At-bat events (see EVENTS below)                                             |
| `bb`   | string list                       | Batted-ball types (see BATTED_BALL_TYPES below)                              |
| `z`    | int list                          | Strike-zone codes (see ZONES below)                                          |

**Examples**

- All matchups between Cease (656302) and Lindor (596019):
  `/explore?pid=656302&bid=596019`
- Fastballs against left-handed hitters in 2026:
  `/explore?pt=FF,SI,FC,FA&bst=L&s=2026`

### `/compare` — two-pitcher overlay

| Param        | Type                          | Description                                       |
| ------------ | ----------------------------- | ------------------------------------------------- |
| `a`          | integer (mlb_id)              | Pitcher A                                          |
| `b`          | integer (mlb_id)              | Pitcher B                                          |
| `aSeason`    | integer                       | Pitcher A's season                                 |
| `bSeason`    | integer                       | Pitcher B's season                                 |
| `aPitch`     | comma list                    | Pitcher A pitch-type filter                        |
| `bPitch`     | comma list                    | Pitcher B pitch-type filter                        |
| `aGame`      | integer (game_pk)             | Pitcher A single-game filter                       |
| `bGame`      | integer (game_pk)             | Pitcher B single-game filter                       |
| `hand`       | `L` \| `R`                    | Batter handedness (applied to both)                |
| `outcome`    | comma list                    | Shared outcome filter (same set as `/pitcher`)     |
| `syncRelease`| `true` \| (omit)              | Lock the two pitchers' release points together     |

### `/browse` / `/browse/{team_id}` / `/daily` / `/`

No optional params. These are landing pages; the AI should send users to one
of the routes above whenever the request implies specific data.

---

## Enum vocabularies

### PITCH_TYPES (2-letter Statcast codes)

`FF` 4-Seam Fastball, `SI` Sinker, `FC` Cutter, `FS` Splitter, `FA` Fastball (other),
`SL` Slider, `ST` Sweeper, `SV` Slurve, `CU` Curveball, `KC` Knuckle Curve,
`CS` Slow Curve, `CH` Changeup, `FO` Forkball, `SC` Screwball, `EP` Eephus,
`KN` Knuckleball, `UN` Unidentified.

When the user says "fastballs", expand to `FF,SI,FC,FS,FA`. "Breaking ball"
expands to `SL,ST,SV,CU,KC,CS`. "Offspeed" expands to `CH,FO,SC,EP,KN`.

### Pitcher-page `outcome`

`whiff` (swinging strike), `called` (called strike), `ball`, `foul`,
`inplay` (hit into play).

### DESCRIPTIONS (Statcast per-pitch result)

`ball`, `blocked_ball`, `called_strike`, `swinging_strike`,
`swinging_strike_blocked`, `foul`, `foul_tip`, `foul_bunt`, `missed_bunt`,
`hit_into_play`, `hit_by_pitch`, `pitchout`.

### EVENTS (at-bat outcome)

`single`, `double`, `triple`, `home_run`, `walk`, `intent_walk`,
`hit_by_pitch`, `strikeout`, `strikeout_double_play`, `field_out`,
`force_out`, `fielders_choice`, `fielders_choice_out`,
`grounded_into_double_play`, `double_play`, `triple_play`, `sac_fly`,
`sac_bunt`, `field_error`, `catcher_interf`.

### BATTED_BALL_TYPES

`ground_ball`, `line_drive`, `fly_ball`, `popup`.

### GAME_TYPES

`R` Regular season, `F` Wild card, `D` Division series, `L` League championship,
`W` World Series, `S` Spring training, `E` Exhibition, `A` All-star.

### ZONES

`1`–`9` form the in-zone 3×3 grid (top-left to bottom-right reading).
`11`–`14` are the four "chase" quadrants outside the zone.

---

## Translation rules for the AI

1. **Resolve names first.** Always call `search_pitcher` / `search_batter`
   before constructing a URL containing a player ID. Never guess a player's
   mlb_id.
2. **Context-aware pronouns.** This is a pitch-tracking app. On a pitcher
   page, "his/her" refers to that pitcher in their *pitching* role. Never
   ask whether the user meant the pitcher as a batter — even for two-way
   players, the pitcher page implies the pitching role.
3. **"His last game" → recent-games tool.** When the user asks about a
   pitcher's recent or last game, call `get_pitcher_recent_games` to look
   up the actual `game_pk`, then navigate to `/at-bat/{game_pk}`.
4. **Single pitcher → `/pitcher/{id}`.** The pitcher page is richer than
   `/explore` for a single arsenal (3D scene, tunneling, stats view).
5. **Pitcher × batter → `/explore`.** The pitcher page has a `vsBatter` mode,
   but `/explore?pid=...&bid=...` returns a clean filtered list with the
   complete query state in the URL.
6. **"Yesterday" / "today".** Convert relative dates to absolute YYYY-MM-DD in
   MLB's calendar (assume `today = current local date`).
7. **Season default.** If the user doesn't specify a year, omit `season`; the
   page picks the current year.
8. **Game type default.** When the user just says "games", filter `gt=R` to
   exclude spring training / all-star / exhibition.
9. **Clarify minimally.** Only ask a clarifying question when a name search
   returns multiple plausible candidates from different teams/eras. Never
   ask for clarification on role, year, or game-type — apply the defaults
   above instead.
