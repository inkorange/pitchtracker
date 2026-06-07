# Run Value Waterfall Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a `Run Value Waterfall` card on the pitcher stats page that ranks each pitch type by runs saved/allowed (using `delta_run_exp`), with both total and per-100 figures.

**Architecture:** New `RunValueCard.tsx` under `src/app/pitcher/[id]/stats/`, fed by an extended `aggregations.ts` over the existing `/api/pitcher/[id]/arsenal` payload — no new endpoint. Bundles a paginated rewrite of the arsenal API's pitch fetch (Supabase enforces a hard 1000-row cap that `.range(0, 4999)` does NOT bypass; PR #50 fixed this on the pitcher page but the stats-view API still has the bug, so this new card would inherit it).

**Tech Stack:** Next.js App Router 16, React 19, TypeScript, Supabase (anon-key SSR client), vitest, Tailwind. Spec: [docs/superpowers/specs/2026-06-07-run-value-waterfall-design.md](../specs/2026-06-07-run-value-waterfall-design.md).

---

## Task 1: Paginate the arsenal API and add `delta_run_exp` to the SELECT

The arsenal API at [src/app/api/pitcher/[id]/arsenal/route.ts:81](../../../src/app/api/pitcher/[id]/arsenal/route.ts#L81) uses `.range(0, 4999)`, which Supabase silently caps at 1000 rows. Mirror the pagination pattern PR #50 applied to `src/app/pitcher/[id]/page.tsx` — primary-key-ordered loop in 1000-row pages with a 20-page soft cap. Also add `delta_run_exp` to the SELECT so downstream tasks can sum it.

**Files:**
- Modify: `src/app/api/pitcher/[id]/arsenal/route.ts:66-86`

- [ ] **Step 1: Read the current fetch shape**

Run: `sed -n '60,90p' src/app/api/pitcher/[id]/arsenal/route.ts`

Expected output is a `Promise.all` with pitcher + pitches, the pitches inner IIFE using `.range(0, 4999)` and SELECT missing `delta_run_exp`.

- [ ] **Step 2: Replace the `Promise.all` block with a parallel pitcher fetch and a paginated pitch fetch**

Find the block (currently lines ~66-86):

```ts
  const [{ data: pitcher }, { data: pitchesRaw }] = await Promise.all([
    supabase
      .from("pitch_pitchers")
      .select("mlb_id, full_name, last_name")
      .eq("mlb_id", pitcherId)
      .maybeSingle(),
    (() => {
      let q = supabase
        .from("pitch_game_pitches")
        .select(
          "game_pk, at_bat_number, pitch_number, pitch_type, stand, description, events, batter_id, release_pos_x, release_pos_y, release_pos_z, vx0, vy0, vz0, ax, ay, az, plate_x, plate_z, release_speed, release_spin_rate, spin_axis, pfx_x, pfx_z, release_extension, pitch_games!inner(season, game_type, game_date)",
        )
        .eq("pitcher_id", pitcherId)
        .eq("pitch_games.season", season)
        .eq("pitch_games.game_type", "R")
        .range(0, 4999);
      if (hand === "L" || hand === "R") q = q.eq("stand", hand);
      if (game) q = q.eq("game_pk", Number(game));
      return q;
    })(),
  ]);
```

Replace with (note: SELECT gains `delta_run_exp`, fetch is paginated, comment block explains the cap):

```ts
  // Fire the pitcher metadata fetch in parallel with page 1 of the
  // pitch pagination loop. We await pitcher after the loop finishes.
  const pitcherPromise = supabase
    .from("pitch_pitchers")
    .select("mlb_id, full_name, last_name")
    .eq("mlb_id", pitcherId)
    .maybeSingle();

  // Paginate the pitch fetch — Supabase enforces a hard 1000-row
  // server-side cap (`db-max-rows`) that `.range(0, N)` does NOT
  // bypass. PR #50 fixed this on src/app/pitcher/[id]/page.tsx; the
  // same pattern is required here so the Stats view doesn't silently
  // undercount above 1000 pitches.
  //
  // Ordered on the primary key so pages are stable across requests.
  const PITCH_SELECT =
    "game_pk, at_bat_number, pitch_number, pitch_type, stand, description, events, batter_id, delta_run_exp, release_pos_x, release_pos_y, release_pos_z, vx0, vy0, vz0, ax, ay, az, plate_x, plate_z, release_speed, release_spin_rate, spin_axis, pfx_x, pfx_z, release_extension, pitch_games!inner(season, game_type, game_date)";
  const PITCH_PAGE_SIZE = 1000;
  const PITCH_MAX_PAGES = 20;

  function buildPitchPageQuery(page: number) {
    let q = supabase
      .from("pitch_game_pitches")
      .select(PITCH_SELECT)
      .eq("pitcher_id", pitcherId)
      .eq("pitch_games.season", season)
      .eq("pitch_games.game_type", "R")
      .order("game_pk", { ascending: true })
      .order("at_bat_number", { ascending: true })
      .order("pitch_number", { ascending: true })
      .range(page * PITCH_PAGE_SIZE, (page + 1) * PITCH_PAGE_SIZE - 1);
    if (hand === "L" || hand === "R") q = q.eq("stand", hand);
    if (game) q = q.eq("game_pk", Number(game));
    return q;
  }

  type PitchRow = NonNullable<
    Awaited<ReturnType<typeof buildPitchPageQuery>>["data"]
  >[number];

  const pitchesRaw: PitchRow[] = [];
  for (let page = 0; page < PITCH_MAX_PAGES; page++) {
    const { data, error } = await buildPitchPageQuery(page);
    if (error || !data) break;
    pitchesRaw.push(...(data as PitchRow[]));
    if (data.length < PITCH_PAGE_SIZE) break;
  }

  const { data: pitcher } = await pitcherPromise;
```

Note: the surrounding code already references `pitchesRaw` (e.g. `const cached = pitchesRaw ?? [];` at line 92) — but since `pitchesRaw` is now a non-null array, change that line as part of this step:

```ts
  const cached = pitchesRaw;
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`

Expected: no errors.

- [ ] **Step 4: Manually verify pagination via the API**

Start the dev server (or use the user's existing one):

```bash
pnpm dev
```

Hit the arsenal API for pitcher 642547 / 2026 (the pitcher whose 1,242 pitches surfaced the cap in PR #50). Use `jq` to count returned pitches and HRs:

```bash
curl -s "http://localhost:3001/api/pitcher/642547/arsenal?season=2026" | \
  jq '{pitches: (.pitches | length), hrs: ([.pitches[] | select(.events == "home_run")] | length)}'
```

Expected: `{"pitches": 1242, "hrs": 9}` (matches the database count).

For comparison the pre-fix response returns `{"pitches": 1000, "hrs": 7}` — confirms the bug existed and is now fixed.

- [ ] **Step 5: Confirm `delta_run_exp` is in the response**

```bash
curl -s "http://localhost:3001/api/pitcher/642547/arsenal?season=2026" | \
  jq '.pitches[0] | keys'
```

Expected output includes `"delta_run_exp"`.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/pitcher/[id]/arsenal/route.ts
git commit -m "Arsenal API: paginate pitch fetch + add delta_run_exp to SELECT"
```

---

## Task 2: Extend `aggregations.ts` with run-value fields and unit tests

Add `delta_run_exp` to `StatPitch`. Add `rv_sum`, `rv_per_100`, `rv_n` to `PerPitchStats`. Compute them in `aggregate()`. Apply the pitcher-frame sign flip (`runs_saved = -delta_run_exp`) and the `rv_n < 10` sparse floor (suppress `rv_per_100`, never `rv_sum`).

**Files:**
- Modify: `src/app/pitcher/[id]/stats/aggregations.ts`
- Create: `src/app/pitcher/[id]/stats/__tests__/aggregations.test.ts`

- [ ] **Step 1: Write the failing test file**

Create `src/app/pitcher/[id]/stats/__tests__/aggregations.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { aggregate, type StatPitch } from "../aggregations";

// Minimal StatPitch factory — only the fields the run-value math
// reads. Other fields default to null so the existing aggregations
// stay valid; this also exercises the null-safety guarantees.
function pitch(overrides: Partial<StatPitch>): StatPitch {
  return {
    pitch_type: "FF",
    description: null,
    release_speed: null,
    release_pos_x: null,
    release_pos_z: null,
    plate_x: null,
    plate_z: null,
    pfx_x: null,
    pfx_z: null,
    spin_axis: null,
    release_spin_rate: null,
    vy0: null,
    vz0: null,
    az: null,
    delta_run_exp: null,
    ...overrides,
  };
}

describe("aggregate – run value", () => {
  it("sums -delta_run_exp into rv_sum (pitcher frame: positive = saves)", () => {
    // Two FF pitches: one saved 0.1 runs (delta_run_exp = -0.1), one
    // gave up 0.05 runs (delta_run_exp = +0.05). Pitcher-frame net:
    // +0.05 runs saved.
    const rows = [
      pitch({ pitch_type: "FF", delta_run_exp: -0.1 }),
      pitch({ pitch_type: "FF", delta_run_exp: 0.05 }),
    ];
    const { perPitch } = aggregate(rows);
    expect(perPitch).toHaveLength(1);
    expect(perPitch[0].pitch_type).toBe("FF");
    expect(perPitch[0].rv_sum).toBeCloseTo(0.05, 5);
    expect(perPitch[0].rv_n).toBe(2);
  });

  it("skips null delta_run_exp from both numerator and denominator", () => {
    const rows = [
      pitch({ pitch_type: "FF", delta_run_exp: -0.2 }),
      pitch({ pitch_type: "FF", delta_run_exp: null }),
      pitch({ pitch_type: "FF", delta_run_exp: 0.1 }),
    ];
    const { perPitch } = aggregate(rows);
    expect(perPitch[0].rv_sum).toBeCloseTo(0.1, 5);
    expect(perPitch[0].rv_n).toBe(2);
    expect(perPitch[0].pitches).toBe(3); // pitch count unaffected
  });

  it("computes rv_per_100 using rv_n (not pitches) as the denominator", () => {
    // 50 pitches with delta_run_exp -0.1 (saves 5 total). 50 more with
    // null delta_run_exp. rv_n=50, rv_sum=5.0, /100 = 5.0/50 * 100 = 10.0.
    const rows = [
      ...Array.from({ length: 50 }, () =>
        pitch({ pitch_type: "FF", delta_run_exp: -0.1 }),
      ),
      ...Array.from({ length: 50 }, () =>
        pitch({ pitch_type: "FF", delta_run_exp: null }),
      ),
    ];
    const { perPitch } = aggregate(rows);
    expect(perPitch[0].rv_n).toBe(50);
    expect(perPitch[0].rv_sum).toBeCloseTo(5.0, 5);
    expect(perPitch[0].rv_per_100).toBeCloseTo(10.0, 5);
  });

  it("suppresses rv_per_100 when rv_n < 10 (sparse-data noise floor)", () => {
    const rows = Array.from({ length: 9 }, () =>
      pitch({ pitch_type: "SL", delta_run_exp: -0.05 }),
    );
    const { perPitch } = aggregate(rows);
    expect(perPitch[0].rv_n).toBe(9);
    expect(perPitch[0].rv_sum).toBeCloseTo(0.45, 5); // total still shown
    expect(perPitch[0].rv_per_100).toBeNull();
  });

  it("yields rv_n=0 and rv_sum=null when every delta_run_exp is null", () => {
    const rows = [
      pitch({ pitch_type: "FF", delta_run_exp: null }),
      pitch({ pitch_type: "FF", delta_run_exp: null }),
    ];
    const { perPitch } = aggregate(rows);
    expect(perPitch[0].rv_n).toBe(0);
    expect(perPitch[0].rv_sum).toBeNull();
    expect(perPitch[0].rv_per_100).toBeNull();
  });

  it("returns empty perPitch when input is empty", () => {
    const { perPitch } = aggregate([]);
    expect(perPitch).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/app/pitcher/[id]/stats/__tests__/aggregations.test.ts`

Expected: FAIL with TypeScript errors (`StatPitch` doesn't have `delta_run_exp`) and/or "Property 'rv_sum' does not exist on type 'PerPitchStats'".

- [ ] **Step 3: Extend `StatPitch` and `PerPitchStats` interfaces**

In `src/app/pitcher/[id]/stats/aggregations.ts`, find:

```ts
export interface StatPitch {
  pitch_type: string | null;
  description: string | null;
  release_speed: number | null;
  release_pos_x: number | null;
  release_pos_z: number | null;
  plate_x: number | null;
  plate_z: number | null;
  pfx_x: number | null;
  pfx_z: number | null;
  spin_axis: number | null;
  release_spin_rate: number | null;
  vy0: number | null;
  vz0: number | null;
  az: number | null;
}
```

Replace with (add `delta_run_exp`):

```ts
export interface StatPitch {
  pitch_type: string | null;
  description: string | null;
  release_speed: number | null;
  release_pos_x: number | null;
  release_pos_z: number | null;
  plate_x: number | null;
  plate_z: number | null;
  pfx_x: number | null;
  pfx_z: number | null;
  spin_axis: number | null;
  release_spin_rate: number | null;
  vy0: number | null;
  vz0: number | null;
  az: number | null;
  // Statcast run expectancy delta from the offense's point of view.
  // Negative = pitch reduced offensive run expectancy = good for the
  // pitcher. RunValueCard sums `-delta_run_exp` so positive numbers
  // mean "saved runs".
  delta_run_exp: number | null;
}
```

Then find:

```ts
export interface PerPitchStats {
  pitch_type: string;
  pitches: number;
  usage_pct: number;
  velo_mean: number | null;
  velo_std: number | null;
  csw_pct: number; // (called + swinging strikes) / pitches
  whiff_pct: number; // swinging strikes / pitches
  vaa_mean: number | null;
}
```

Replace with (add three RV fields):

```ts
export interface PerPitchStats {
  pitch_type: string;
  pitches: number;
  usage_pct: number;
  velo_mean: number | null;
  velo_std: number | null;
  csw_pct: number; // (called + swinging strikes) / pitches
  whiff_pct: number; // swinging strikes / pitches
  vaa_mean: number | null;
  // Run-value math (RunValueCard). Pitcher frame: rv_sum is sum of
  // -delta_run_exp across pitches in the bucket, so positive = saves
  // runs. rv_n is the count of pitches whose delta_run_exp was
  // non-null (denominator for /100). rv_per_100 is suppressed (null)
  // when rv_n < 10 — too noisy to display.
  rv_sum: number | null;
  rv_per_100: number | null;
  rv_n: number;
}
```

- [ ] **Step 4: Extend the bucket type and accumulate RV in the aggregate loop**

Find the `buckets` map declaration around line 77:

```ts
  const buckets = new Map<
    string,
    {
      pitches: number;
      veloSum: number;
      veloSumSq: number;
      veloN: number;
      called: number;
      whiff: number;
      vaaSum: number;
      vaaN: number;
    }
  >();
```

Replace with (add `rvSum` and `rvN`):

```ts
  const buckets = new Map<
    string,
    {
      pitches: number;
      veloSum: number;
      veloSumSq: number;
      veloN: number;
      called: number;
      whiff: number;
      vaaSum: number;
      vaaN: number;
      rvSum: number;
      rvN: number;
    }
  >();
```

Find the bucket-init block inside the for-loop:

```ts
    if (!b) {
      b = {
        pitches: 0,
        veloSum: 0,
        veloSumSq: 0,
        veloN: 0,
        called: 0,
        whiff: 0,
        vaaSum: 0,
        vaaN: 0,
      };
      buckets.set(p.pitch_type, b);
    }
```

Replace with:

```ts
    if (!b) {
      b = {
        pitches: 0,
        veloSum: 0,
        veloSumSq: 0,
        veloN: 0,
        called: 0,
        whiff: 0,
        vaaSum: 0,
        vaaN: 0,
        rvSum: 0,
        rvN: 0,
      };
      buckets.set(p.pitch_type, b);
    }
```

Then find the VAA accumulator at the end of the loop:

```ts
    const vaa = approachAngleDeg(p);
    if (vaa != null && Number.isFinite(vaa)) {
      b.vaaSum += vaa;
      b.vaaN += 1;
    }
  }
```

Insert the RV accumulator right after VAA (before the closing `}` of the for-loop):

```ts
    const vaa = approachAngleDeg(p);
    if (vaa != null && Number.isFinite(vaa)) {
      b.vaaSum += vaa;
      b.vaaN += 1;
    }
    // Run value, pitcher frame: -delta_run_exp. Skip nulls in BOTH
    // numerator (sum) and denominator (count) so the /100 rate
    // reflects only pitches whose RV is actually known.
    if (p.delta_run_exp != null && Number.isFinite(p.delta_run_exp)) {
      b.rvSum += -p.delta_run_exp;
      b.rvN += 1;
    }
  }
```

- [ ] **Step 5: Compute `rv_sum`, `rv_per_100`, `rv_n` in the `perPitch` projection**

Find the `perPitch` map projection (around line 134):

```ts
  const perPitch: PerPitchStats[] = Array.from(buckets.entries())
    .map(([pitch_type, b]) => {
      const veloMean = b.veloN > 0 ? b.veloSum / b.veloN : null;
      const veloVar =
        b.veloN > 0
          ? Math.max(0, b.veloSumSq / b.veloN - (veloMean ?? 0) ** 2)
          : null;
      const veloStd = veloVar != null ? Math.sqrt(veloVar) : null;
      return {
        pitch_type,
        pitches: b.pitches,
        usage_pct: totalPitches > 0 ? (b.pitches / totalPitches) * 100 : 0,
        velo_mean: veloMean,
        velo_std: veloStd,
        csw_pct: b.pitches > 0 ? ((b.called + b.whiff) / b.pitches) * 100 : 0,
        whiff_pct: b.pitches > 0 ? (b.whiff / b.pitches) * 100 : 0,
        vaa_mean: b.vaaN > 0 ? b.vaaSum / b.vaaN : null,
      };
    })
    .sort((a, b) => b.pitches - a.pitches);
```

Replace with (add RV computation + sparse floor):

```ts
  // Pitches per bucket below this floor have too noisy a rate to
  // show. The total (`rv_sum`) is still meaningful — it's the season
  // impact in raw runs — so only `rv_per_100` is suppressed.
  const RV_PER_100_MIN_N = 10;

  const perPitch: PerPitchStats[] = Array.from(buckets.entries())
    .map(([pitch_type, b]) => {
      const veloMean = b.veloN > 0 ? b.veloSum / b.veloN : null;
      const veloVar =
        b.veloN > 0
          ? Math.max(0, b.veloSumSq / b.veloN - (veloMean ?? 0) ** 2)
          : null;
      const veloStd = veloVar != null ? Math.sqrt(veloVar) : null;
      const rvSum = b.rvN > 0 ? b.rvSum : null;
      const rvPer100 =
        b.rvN >= RV_PER_100_MIN_N ? (b.rvSum / b.rvN) * 100 : null;
      return {
        pitch_type,
        pitches: b.pitches,
        usage_pct: totalPitches > 0 ? (b.pitches / totalPitches) * 100 : 0,
        velo_mean: veloMean,
        velo_std: veloStd,
        csw_pct: b.pitches > 0 ? ((b.called + b.whiff) / b.pitches) * 100 : 0,
        whiff_pct: b.pitches > 0 ? (b.whiff / b.pitches) * 100 : 0,
        vaa_mean: b.vaaN > 0 ? b.vaaSum / b.vaaN : null,
        rv_sum: rvSum,
        rv_per_100: rvPer100,
        rv_n: b.rvN,
      };
    })
    .sort((a, b) => b.pitches - a.pitches);
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm test src/app/pitcher/[id]/stats/__tests__/aggregations.test.ts`

Expected: all 6 tests PASS.

- [ ] **Step 7: Run the full typecheck**

Run: `pnpm typecheck`

Expected: no errors. (The `StatPitch` field addition flows into the API route response via the existing destructure pattern — the API's `renderable` map already spreads the row.)

- [ ] **Step 8: Commit**

```bash
git add src/app/pitcher/[id]/stats/aggregations.ts src/app/pitcher/[id]/stats/__tests__/aggregations.test.ts
git commit -m "Aggregations: add run-value sum + /100 per pitch type"
```

---

## Task 3: Create `RunValueCard.tsx`

A diverging horizontal-bar SVG card, one row per pitch type, sorted descending by `rv_sum`. Follows the same SVG pattern as `VAABars` and uses `StatCard` chrome.

**Files:**
- Create: `src/app/pitcher/[id]/stats/RunValueCard.tsx`

- [ ] **Step 1: Create the card**

Create `src/app/pitcher/[id]/stats/RunValueCard.tsx`:

```tsx
"use client";

import { getPitchColor, getPitchLabel } from "@/lib/viz/colors";
import type { PerPitchStats } from "./aggregations";
import { StatCard } from "./StatCard";

// One diverging horizontal bar per pitch type, sorted descending by
// rv_sum (most-saves at the top). Pitcher frame: positive = saved
// runs, bar grows right; negative = allowed runs, bar grows left.
//
// Bars normalized to the max |rv_sum| in the set so the longest row
// fills the row. Per-100 cell is muted secondary text and is hidden
// when rv_n < 10 (suppressed by aggregations).
const W = 320;
const ROW_H = 22;
// Below this rate (runs per 100 pitches lost), show a warning glyph.
// Half a run per 100 thrown is bad; 1.0+ is the "this pitch is
// actively costing him games" threshold.
const RV_PER_100_WARN = -1.0;

const RV_HELP = (
  <>
    <p>
      <strong>Run Value</strong> is the sum of how much each pitch
      shifted the offense's expected runs in the inning. Negative for
      the offense = saved for the pitcher; this card flips the sign
      so positive numbers and right-of-zero bars mean &quot;runs
      saved.&quot;
    </p>
    <p>
      <strong>Total</strong> is volume — what actually moved the
      scoreboard this season. <strong>/100</strong> is rate — how
      good the pitch is on average, normalized per 100 pitches.
      Hidden when the bucket has fewer than 10 pitches (too noisy).
    </p>
  </>
);

function formatRv(rv: number): string {
  const sign = rv > 0 ? "+" : rv < 0 ? "−" : "";
  return `${sign}${Math.abs(rv).toFixed(1)}`;
}

function formatRvPer100(rate: number): string {
  const sign = rate > 0 ? "+" : rate < 0 ? "−" : "";
  return `${sign}${Math.abs(rate).toFixed(2)}/100`;
}

export function RunValueCard({ rows }: { rows: PerPitchStats[] }) {
  const usable = rows.filter(
    (r): r is PerPitchStats & { rv_sum: number } => r.rv_sum != null,
  );
  if (usable.length === 0) {
    return (
      <StatCard title="Run value" help={RV_HELP}>
        <div className="text-[11px] text-white/55 italic">
          No run-value data for this filter.
        </div>
      </StatCard>
    );
  }

  // Sort most-saves (highest rv_sum) at the top.
  const sorted = [...usable].sort((a, b) => b.rv_sum - a.rv_sum);

  // Normalize bar length to the largest absolute total in the set so
  // the longest bar fills the row. Half the chart width is available
  // to each side (left for "allowed" / right for "saved").
  const maxAbs = Math.max(...sorted.map((r) => Math.abs(r.rv_sum)));
  const totalH = sorted.length * ROW_H + 28;
  const labelCol = 56; // left-edge text (pitch label + count)
  const valueCol = 96; // right-edge text (total + /100)
  const chartLeft = labelCol;
  const chartRight = W - valueCol;
  const zeroX = (chartLeft + chartRight) / 2;
  const halfChart = (chartRight - chartLeft) / 2;
  const net = sorted.reduce((acc, r) => acc + r.rv_sum, 0);

  return (
    <StatCard
      title="Run value"
      hint="allows ← 0 → saves"
      help={RV_HELP}
    >
      <svg
        viewBox={`0 0 ${W} ${totalH}`}
        width="100%"
        style={{ aspectRatio: `${W} / ${totalH}` }}
        className="block font-sans"
      >
        {/* Zero line */}
        <line
          x1={zeroX}
          y1={0}
          x2={zeroX}
          y2={totalH - 16}
          stroke="rgba(255,255,255,0.22)"
        />
        {sorted.map((r, i) => {
          const y = i * ROW_H + 4;
          const len =
            maxAbs > 0 ? (Math.abs(r.rv_sum) / maxAbs) * halfChart : 0;
          const barX = r.rv_sum >= 0 ? zeroX : zeroX - len;
          const fill = getPitchColor(r.pitch_type);
          const warn =
            r.rv_per_100 != null && r.rv_per_100 <= RV_PER_100_WARN;
          return (
            <g key={r.pitch_type}>
              {/* Label + count on the left */}
              <text
                x={4}
                y={y + (ROW_H - 8) / 2}
                fill="rgba(255,255,255,0.85)"
                fontSize={10}
                dominantBaseline="middle"
              >
                {getPitchLabel(r.pitch_type)}
              </text>
              <text
                x={labelCol - 4}
                y={y + (ROW_H - 8) / 2}
                fill="rgba(255,255,255,0.45)"
                fontSize={9}
                textAnchor="end"
                dominantBaseline="middle"
              >
                {r.pitches}
              </text>
              {/* Diverging bar */}
              <rect
                x={barX}
                y={y}
                width={len}
                height={ROW_H - 8}
                fill={fill}
                fillOpacity={0.7}
                rx={2}
              />
              {/* Total + /100 on the right */}
              <text
                x={W - 4}
                y={y + (ROW_H - 8) / 2}
                fill="rgba(255,255,255,0.85)"
                fontSize={10}
                textAnchor="end"
                dominantBaseline="middle"
              >
                {formatRv(r.rv_sum)} runs
              </text>
              {r.rv_per_100 != null ? (
                <text
                  x={W - 4}
                  y={y + (ROW_H - 8) / 2 + 9}
                  fill={
                    warn
                      ? "rgba(255,180,120,0.85)"
                      : "rgba(255,255,255,0.40)"
                  }
                  fontSize={8}
                  textAnchor="end"
                  dominantBaseline="middle"
                >
                  {formatRvPer100(r.rv_per_100)}
                  {warn ? " ⚠" : ""}
                </text>
              ) : null}
            </g>
          );
        })}
        {/* Net footer */}
        <text
          x={W - 4}
          y={totalH - 4}
          fill="rgba(255,255,255,0.75)"
          fontSize={10}
          textAnchor="end"
          dominantBaseline="middle"
        >
          Net: {formatRv(net)} runs
        </text>
      </svg>
    </StatCard>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`

Expected: no errors.

- [ ] **Step 3: Lint the new file**

Run: `pnpm lint src/app/pitcher/[id]/stats/RunValueCard.tsx`

Expected: 0 errors. Warnings carried over from the project-wide config (e.g. unused-disable directives) are pre-existing and unrelated.

- [ ] **Step 4: Commit**

```bash
git add src/app/pitcher/[id]/stats/RunValueCard.tsx
git commit -m "Stats: add RunValueCard (diverging-bar season run value per pitch)"
```

---

## Task 4: Wire `RunValueCard` into `PitcherStatsView`

Drop the card into the existing `lg:grid-cols-2` grid alongside the other secondary cards. Wrap in `<LazyMount minHeight={260}>` to match the surrounding pattern.

**Files:**
- Modify: `src/app/pitcher/[id]/PitcherStatsView.tsx`

- [ ] **Step 1: Add the import**

Find the existing card imports (around lines 10-17):

```ts
import { ArsenalCard } from "./stats/ArsenalCard";
import { MovementPlot } from "./stats/MovementPlot";
import { VelocityHistograms } from "./stats/VelocityHistograms";
import { ReleaseCluster } from "./stats/ReleaseCluster";
import { HeatMapGrid } from "./stats/HeatMapGrid";
import { VAABars } from "./stats/VAABars";
import { SequencingMatrix } from "./stats/SequencingMatrix";
import { SequencingDrift } from "./stats/SequencingDrift";
```

Add a `RunValueCard` import (alphabetical-ish, near `ReleaseCluster`):

```ts
import { ArsenalCard } from "./stats/ArsenalCard";
import { MovementPlot } from "./stats/MovementPlot";
import { VelocityHistograms } from "./stats/VelocityHistograms";
import { ReleaseCluster } from "./stats/ReleaseCluster";
import { RunValueCard } from "./stats/RunValueCard";
import { HeatMapGrid } from "./stats/HeatMapGrid";
import { VAABars } from "./stats/VAABars";
import { SequencingMatrix } from "./stats/SequencingMatrix";
import { SequencingDrift } from "./stats/SequencingDrift";
```

- [ ] **Step 2: Slot the card into the grid**

Find the 2-col grid block (around lines 223-239):

```tsx
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <LazyMount minHeight={340}>
          <MovementPlot pitches={pitches} />
        </LazyMount>
        <LazyMount minHeight={260}>
          <VelocityHistograms pitches={pitches} perPitch={aggregated.perPitch} />
        </LazyMount>
        <LazyMount minHeight={340}>
          <ReleaseCluster pitches={pitches} />
        </LazyMount>
        <LazyMount minHeight={300}>
          <HeatMapGrid pitches={pitches} perPitch={aggregated.perPitch} />
        </LazyMount>
        <LazyMount minHeight={220}>
          <VAABars rows={aggregated.perPitch} />
        </LazyMount>
      </div>
```

Add the new card after `<VAABars>` (last in the grid, simplest diff):

```tsx
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <LazyMount minHeight={340}>
          <MovementPlot pitches={pitches} />
        </LazyMount>
        <LazyMount minHeight={260}>
          <VelocityHistograms pitches={pitches} perPitch={aggregated.perPitch} />
        </LazyMount>
        <LazyMount minHeight={340}>
          <ReleaseCluster pitches={pitches} />
        </LazyMount>
        <LazyMount minHeight={300}>
          <HeatMapGrid pitches={pitches} perPitch={aggregated.perPitch} />
        </LazyMount>
        <LazyMount minHeight={220}>
          <VAABars rows={aggregated.perPitch} />
        </LazyMount>
        <LazyMount minHeight={260}>
          <RunValueCard rows={aggregated.perPitch} />
        </LazyMount>
      </div>
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/pitcher/[id]/PitcherStatsView.tsx
git commit -m "Stats: render RunValueCard alongside the other secondary cards"
```

---

## Task 5: End-to-end verification

Confirm the full feature works against the running app and the prior pagination bug stays fixed in stats mode.

- [ ] **Step 1: Start the dev server (or use the user's existing one)**

Run: `pnpm dev`

Expected: server boots; "Ready in Xms" appears.

- [ ] **Step 2: Open the stats page for pitcher 642547 (the season-2026 pitcher with 1,242 pitches and 9 HRs)**

Visit: `http://localhost:3001/pitcher/642547?season=2026&view=stats`

Expected: Run Value card renders inside the 2-col grid, with one row per pitch type the pitcher throws. The total volume of pitches summed across the per-pitch table should be 1,242 (not 1,000) — confirming the pagination fix took.

- [ ] **Step 3: Verify HR-scoped numbers**

Visit: `http://localhost:3001/pitcher/642547?season=2026&event=home_run&view=stats`

Expected: Run Value card shows one row per pitch type that produced an HR (5 pitch types from earlier diagnosis: FF, SL, CU, CS, CH). Sum of `rv_sum` matches the 9 HR pitches' aggregate `−delta_run_exp` from the database:

```bash
psql "$DATABASE_URL" -c "select round(sum(-delta_run_exp)::numeric, 2) as net_runs from pitch_game_pitches p join pitch_games g on g.game_pk = p.game_pk where p.pitcher_id = 642547 and g.season = 2026 and g.game_type = 'R' and p.events = 'home_run';"
```

The card's `Net:` footer should match this number to one decimal place.

(If `psql` isn't wired up locally, use the Supabase MCP / SQL editor with the same query.)

- [ ] **Step 4: Verify a low-volume bucket suppresses /100**

Visit: `http://localhost:3001/pitcher/642547?season=2026&event=home_run&view=stats`

Expected: pitch types whose `rv_n` (HR pitches) is < 10 — all 5 here since the most-HR pitch type maxes out at 4 — show the total RV but no `/100` cell.

- [ ] **Step 5: Visit a no-data scope**

Visit: `http://localhost:3001/pitcher/642547?season=2020&view=stats` (a season the pitcher had no data in)

Expected: Run Value card renders the empty-state line: `No run-value data for this filter.` (Other cards may render their own empty states too — that's fine.)

- [ ] **Step 6: Push the branch and open a PR**

```bash
git push -u origin run-value-waterfall
gh pr create --title "Stats: Run Value Waterfall card" --body "$(cat <<'EOF'
## Summary
- New `RunValueCard` on the pitcher stats page: diverging horizontal bars per pitch type, sorted most-saves-first, with total RV and a /100 rate (suppressed when the bucket has < 10 pitches).
- Bundles a paginated rewrite of `/api/pitcher/[id]/arsenal`'s pitch fetch — the same Supabase 1000-row `db-max-rows` cap that PR #50 fixed on the pitcher page was still in effect here, so every stats-mode card silently undercounted above 1000 pitches.
- Adds `delta_run_exp` to the API select and to `StatPitch`; extends `aggregations.ts` with `rv_sum` / `rv_per_100` / `rv_n` plus unit tests.

## Spec
[docs/superpowers/specs/2026-06-07-run-value-waterfall-design.md](docs/superpowers/specs/2026-06-07-run-value-waterfall-design.md)

## Verification
- Pitcher 642547 / 2026, no filter: stats-page card renders 1,242 total pitches across the per-pitch rows (pre-fix the API returned 1,000).
- Pitcher 642547 / 2026 / `?event=home_run`: card sums to the database's net `−delta_run_exp` across the 9 HR pitches (footer matches the SQL `select sum(-delta_run_exp)` to one decimal).
- Empty scope (`?season=2020`): card shows `No run-value data for this filter.`
- Sparse buckets (`?event=home_run`, max 4 pitches per type): rows show the total but no /100 cell.

## Test plan
- [ ] Visit `/pitcher/642547?season=2026&view=stats` — card renders, Net matches the season RV.
- [ ] Visit `/pitcher/642547?season=2026&event=home_run&view=stats` — Net matches `select round(sum(-delta_run_exp)::numeric,2) … where events='home_run'`.
- [ ] Toggle `?hand=L` / `?hand=R` / `?vsBatter=…` — card respects each filter; pitch types may drop out under narrow scopes.
- [ ] Visit a no-data season — empty state renders.
EOF
)"
```

---

## Self-review notes

- Spec coverage: every spec section maps to a task.
  - "Placement" → Task 4
  - "Visual treatment" → Task 3
  - "Data path: server-side / aggregation / component / filter scope" → Task 1 (server), Task 2 (aggregation), Task 3 (component), Task 4 (wiring; filters inherit from the existing `arsenalQuery` builder)
  - "Pagination bundling" → Task 1
  - "Edge cases" → Task 2 tests (sparse / null / empty) + Task 3 empty-state + Task 5 verification
  - "Testing" → Task 2
- Type consistency: `rv_sum` / `rv_per_100` / `rv_n` field names used identically across the spec, the aggregations interface, the tests, and the card.
- No placeholders in any task step.
