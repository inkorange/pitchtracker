# Run Value Waterfall — design

A new stats-page card that shows, per pitch type, how many runs this
pitcher has saved or allowed across the active scope. Sits alongside
the existing analytical cards (Movement Plot, Velocity Histograms,
Heat Map Grid, VAA Bars).

## Purpose

`pitch_game_pitches.delta_run_exp` already encodes how every pitch
shifted run expectancy for the offense. Today nothing in the UI
surfaces it. The Run Value Waterfall reduces a season of pitches to
"which pitches are saving runs and which are leaking them," ranked,
with both **total impact** (volume) and **rate** (RV/100 pitches) so a
low-volume disaster pitch can't hide behind a low total.

## Placement

- File: `src/app/pitcher/[id]/stats/RunValueCard.tsx`.
- Slot: inside the `lg:grid-cols-2` grid in
  [`PitcherStatsView`](src/app/pitcher/[id]/PitcherStatsView.tsx),
  alongside `MovementPlot` / `VelocityHistograms` /
  `ReleaseCluster` / `HeatMapGrid` / `VAABars`. Wrapped in
  `<LazyMount minHeight={260}>` to match the other secondary cards.
- No header-tier promotion — this is a supporting card, not a
  replacement for the Arsenal radar.

## Visual treatment

```
Run value — 2026                            allows ← 0 → saves
FF  411                                            | ████████████████ +2.4 runs  (+0.58/100)
SL  180                                            |        ████████  +1.4 runs  (+0.78/100)
CH   95                                            | ████             +0.5 runs  (+0.53/100)
CU   60                                       ▓    |                  −0.1 runs  (−0.17/100)
ST   52                                    ████    |                  −0.7 runs  (−1.35/100) ⚠
                                                                       Net: +3.5 runs
```

- **Diverging horizontal bars** off a vertical zero line.
- **Sign convention** (decided 2026-06-07): pitcher frame, `runs_saved
  = -delta_run_exp`. Positive numbers and right-of-zero bars mean the
  pitch saved runs; negative numbers and left-of-zero bars mean it
  cost runs.
- **Sort**: descending by `rv_sum` (most saves at the top).
- **Per row**: pitch-type abbreviation + count badge (mirrors
  `ArsenalCard` and the pitcher card's arsenal panel), the bar, then
  total RV and RV/100 in muted secondary text.
- **Bar color**: `getPitchColor(pitch_type)` for continuity with the
  rest of the page.
- **Warning glyph** (⚠): shown next to the rate cell when
  `rv_per_100` is harmful enough to flag (threshold: `<= -1.0`, i.e.
  the pitch costs at least 1.0 runs per 100 thrown).
- **Footer**: `Net: ±N.N runs` (signed sum of the per-pitch totals).
- Bars normalized to the max `|rv_sum|` in the set so the longest bar
  fills the row.
- Zero line is the visual anchor; bars never extend past the row's
  vertical bounds.

## Data path

1. **Server-side** — extend the existing arsenal API select rather
   than introducing a new endpoint.
   - Add `delta_run_exp` to the SELECT in
     [`/api/pitcher/[id]/arsenal/route.ts`](src/app/api/pitcher/[id]/arsenal/route.ts).
   - Include `delta_run_exp` on the flattened `renderable` row shape
     returned in the response payload.
2. **Aggregation** — extend
   [`stats/aggregations.ts`](src/app/pitcher/[id]/stats/aggregations.ts).
   - Add `delta_run_exp: number | null` to `StatPitch`.
   - Extend `PerPitchStats` with:
     - `rv_sum: number | null` — sum of `-delta_run_exp` across
       non-null rows for the pitch type. `null` only when `rv_n === 0`.
     - `rv_per_100: number | null` — `rv_sum / rv_n * 100`. `null`
       when `rv_n` is below a noise floor (see edge cases).
     - `rv_n: number` — count of pitches in the bucket with a non-null
       `delta_run_exp`. Used as the denominator for `/100` and as the
       gate for `rv_per_100`.
3. **Component** — `RunValueCard` reads `aggregated.perPitch`, sorts
   descending by `rv_sum`, renders the diverging bars normalized to
   `max(|rv_sum|)` across the set.
4. **Filter scope** — automatic. The card reads from the same
   `pitches` array every other stats card uses, so it inherits the
   page's URL filters (`event`, `hand`, `pitch`, `outcome`, `veloMin`,
   `veloMax`, `vsBatter`, `game`) for free.

## Pagination bundling (out-of-scope-but-coupled)

The arsenal API at
[`/api/pitcher/[id]/arsenal/route.ts:81`](src/app/api/pitcher/[id]/arsenal/route.ts#L81)
still uses `.range(0, 4999)` against Supabase's hard 1000-row
`db-max-rows` cap — the same bug PR #50 fixed on the pitcher page.
Above 1000 pitches in a season the API silently truncates, and every
stats-mode card (including this one) undercounts.

The implementation plan bundles a paginated rewrite of that fetch
using the same primary-key-ordered loop landed on the page. Without
it, this new card would inherit the same lying-totals behavior the
combined HR count had before PR #50.

## Edge cases

- **No data** — `aggregated.perPitch` is empty OR every entry has
  `rv_n === 0`: card renders an empty-state line ("No run-value data
  for this filter."), matching the language of other cards.
- **Sparse pitch type** — `rv_n < 10` for a pitch type: still render
  the total bar (the season impact is real), but hide the `/100`
  cell. The number would be too noisy to display.
- **Null `delta_run_exp`** — skipped in both the numerator (`rv_sum`)
  and the denominator (`rv_n`). The card never imputes.
- **All zeroes** — `rv_sum === 0` across the set: bars all have zero
  length, footer reads `Net: 0.0 runs`. No special-casing.
- **Single-pitch-type scope** (`?pitch=FF`) — bar fills the row (its
  own value is the max), no comparison value but the absolute total is
  still meaningful.
- **`vsBatter` or `game` scope** — volume is small by definition;
  most pitch types fall under the `rv_n < 10` floor and show only the
  total. That's correct behavior, not degraded.

## Testing

- **Aggregations unit tests** in a new
  `src/app/pitcher/[id]/stats/__tests__/aggregations.test.ts` (no test
  file exists for `aggregations.ts` today; this work adds one):
  - Sum across pitch types, sign flip applied correctly.
  - `rv_per_100` denominator uses `rv_n`, not `pitches`.
  - Null `delta_run_exp` rows skipped from numerator AND denominator.
  - Empty input yields empty `perPitch` (no crashes).
  - All-null input yields `rv_n === 0` everywhere and `rv_sum === null`.
- **Card behavior** — manual smoke per the test plan in the PR:
  pitcher with >1000 pitches (642547 / 2026) renders, sign reads
  pitcher-frame, sort is correct, sparse `vsBatter` view hides /100,
  empty-state language fires when the filter has no pitches.

## Out of scope (v2 candidates)

- **League percentile band / Stuff+-style** RV/100 vs league for each
  pitch type. Would parallel `ArsenalCard`'s radar but for run value.
- **RV-over-time series** — a `SequencingDrift`-style line of
  cumulative RV across the season's starts.
- **Per-batter-hand split** in the card. Today the page-level `?hand=`
  filter already covers this, just not side-by-side.
