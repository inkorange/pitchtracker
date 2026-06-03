// Plate heat grid: bucket pitches into a 2D grid covering the strike
// zone + a chase margin, then compute per-cell rates (whiff%, etc.)
// for the heat-overlay visualization on the pitcher page.
//
// Coordinates here are Statcast plate_x / plate_z (feet). plate_x is
// lateral (positive = catcher's right / 3B side), plate_z is height.
// The Stage's strike-zone wireframe uses w=0.71 (half-width) and
// vertical bounds 1.5 → 3.55 ft, so we pad slightly to capture chases.
//
// All outcome classification flows through the project-wide
// categorizeDescription so the heat grid speaks the exact same
// language as the outcome filter chips (notably: foul_tip is a
// "whiff" on this site, matching Statcast/FanGraphs whiff_rate
// convention and the user's mental model when they filter by
// outcome=whiff).

import { categorizeDescription } from "@/lib/viz/colors";

export interface HeatPitch {
  plate_x: number | null;
  plate_z: number | null;
  description: string | null;
}

export type HeatMetric = "whiff" | "chase" | "called" | "csw";

export interface HeatCell {
  col: number;
  row: number;
  total: number; // every pitch that landed in this cell
  swings: number; // any swing (whiff/foul/foul tip/in-play/missed bunt)
  whiffs: number; // whiff category (swstr / swstr blocked / missed bunt / foul tip)
  called: number; // called strikes
  /** Whether the cell sits inside the strike zone. Drives the
   *  chase-density numerator (chase is a swing in a NON-zone cell). */
  inZone: boolean;
  /** Count of "chase swings" in this cell — swings on out-of-zone
   *  pitches. Zero for in-zone cells. Tracked separately so chase%
   *  density divides correctly. */
  chaseSwings: number;
  /**
   * The active metric's value in [0, 1]. Density semantics: the
   * cell's share of the metric event total across the whole grid.
   * NaN when the grid-wide event total is zero — the renderer
   * treats NaN as "no data" and draws nothing.
   */
  value: number;
}

export interface HeatGridSpec {
  cols: number;
  rows: number;
  // Bounds in Statcast plate coords (feet).
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
  metric: HeatMetric;
  cells: HeatCell[];
  /** Total pitches that fell inside the grid bounds. */
  total: number;
  /** Grid-wide event totals. The per-cell `value` is each cell's
   *  share of the metric event total (density semantics), so the
   *  selected metric's total is the active denominator. When zero
   *  the renderer shows an empty-state hint instead of a blank
   *  grid. */
  totalWhiffs: number;
  totalCalled: number;
  totalChaseSwings: number;
  totalCsw: number;
}

// Strike zone (Statcast convention).
const ZONE_HALF_WIDTH = 0.71;
const ZONE_TOP = 3.55;
const ZONE_BOTTOM = 1.5;

// Chase margin extending past the zone — captures pitches batters
// commonly chase. Tuned so the outer cells are visibly heatmap-able
// without being so wide that interior detail gets washed out.
const X_MARGIN = 0.85;
const Z_MARGIN_TOP = 0.7;
const Z_MARGIN_BOTTOM = 0.65;

export const HEAT_GRID_DEFAULT_COLS = 5;
export const HEAT_GRID_DEFAULT_ROWS = 5;

export const HEAT_GRID_BOUNDS = {
  xMin: -ZONE_HALF_WIDTH - X_MARGIN,
  xMax: ZONE_HALF_WIDTH + X_MARGIN,
  zMin: ZONE_BOTTOM - Z_MARGIN_BOTTOM,
  zMax: ZONE_TOP + Z_MARGIN_TOP,
};

// Categories that count as a swing (bat moved at the pitch). Drawn
// from categorizeDescription so the definition stays in lockstep
// with the outcome filter chips.
const SWING_CATEGORIES = new Set(["whiff", "foul", "inplay"]);

export function buildHeatGrid(
  pitches: HeatPitch[],
  metric: HeatMetric = "whiff",
  cols = HEAT_GRID_DEFAULT_COLS,
  rows = HEAT_GRID_DEFAULT_ROWS,
): HeatGridSpec {
  const { xMin, xMax, zMin, zMax } = HEAT_GRID_BOUNDS;
  const cellW = (xMax - xMin) / cols;
  const cellH = (zMax - zMin) / rows;

  const cells: HeatCell[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const xCenter = xMin + (col + 0.5) * cellW;
      const zCenter = zMin + (row + 0.5) * cellH;
      const inZone =
        Math.abs(xCenter) <= ZONE_HALF_WIDTH &&
        zCenter >= ZONE_BOTTOM &&
        zCenter <= ZONE_TOP;
      cells.push({
        col,
        row,
        total: 0,
        swings: 0,
        whiffs: 0,
        called: 0,
        chaseSwings: 0,
        inZone,
        value: NaN,
      });
    }
  }

  let total = 0;
  let totalWhiffs = 0;
  let totalCalled = 0;
  let totalChaseSwings = 0;
  for (const p of pitches) {
    if (p.plate_x == null || p.plate_z == null) continue;
    if (p.plate_x < xMin || p.plate_x >= xMax) continue;
    if (p.plate_z < zMin || p.plate_z >= zMax) continue;
    const col = Math.floor((p.plate_x - xMin) / cellW);
    const row = Math.floor((p.plate_z - zMin) / cellH);
    const idx = row * cols + col;
    const c = cells[idx];
    if (!c) continue;
    c.total += 1;
    total += 1;
    const category = categorizeDescription(p.description);
    const isSwing = SWING_CATEGORIES.has(category);
    if (isSwing) {
      c.swings += 1;
      if (!c.inZone) {
        c.chaseSwings += 1;
        totalChaseSwings += 1;
      }
    }
    if (category === "whiff") {
      c.whiffs += 1;
      totalWhiffs += 1;
    }
    if (category === "called") {
      c.called += 1;
      totalCalled += 1;
    }
  }
  const totalCsw = totalCalled + totalWhiffs;

  // Second pass: compute each cell's share of the active metric's
  // grid-wide event total (density). With this definition the cells
  // sum to 100% (or near it, modulo cells with zero events).
  for (const c of cells) {
    c.value = computeMetric(c, metric, {
      totalWhiffs,
      totalCalled,
      totalChaseSwings,
      totalCsw,
    });
  }

  return {
    cols,
    rows,
    xMin,
    xMax,
    zMin,
    zMax,
    metric,
    cells,
    total,
    totalWhiffs,
    totalCalled,
    totalChaseSwings,
    totalCsw,
  };
}

/** Grid-wide total of the active metric's event type. When zero,
 *  every cell ends up NaN and the grid renders blank — the label
 *  should explain why instead of just showing a pitch count over
 *  an empty grid. */
export function heatMetricDenominator(grid: HeatGridSpec): number {
  switch (grid.metric) {
    case "whiff":
      return grid.totalWhiffs;
    case "chase":
      return grid.totalChaseSwings;
    case "called":
      return grid.totalCalled;
    case "csw":
      return grid.totalCsw;
  }
}

/** Singular / plural event labels paired with the denominator so
 *  the chip can read "14 whiffs", "0 chases", etc. */
export const HEAT_METRIC_EVENT_LABELS: Record<HeatMetric, [string, string]> = {
  whiff: ["whiff", "whiffs"],
  chase: ["chase", "chases"],
  called: ["called strike", "called strikes"],
  csw: ["called-or-whiff", "called-or-whiffs"],
};

export const HEAT_METRIC_EMPTY_HINTS: Record<HeatMetric, string> = {
  whiff:
    "No whiffs in this selection — adjust the outcome / pitch-type filters to include whiff pitches.",
  chase:
    "No chase swings in this selection — chases are swings on out-of-zone pitches.",
  called:
    "No called strikes in this selection — include called-strike outcomes to populate the heat.",
  csw: "No called strikes or whiffs in this selection.",
};

interface GridTotals {
  totalWhiffs: number;
  totalCalled: number;
  totalChaseSwings: number;
  totalCsw: number;
}

function computeMetric(
  c: HeatCell,
  metric: HeatMetric,
  totals: GridTotals,
): number {
  switch (metric) {
    case "whiff":
      // Cell's share of all whiffs in the grid.
      return totals.totalWhiffs > 0 ? c.whiffs / totals.totalWhiffs : NaN;
    case "chase":
      // Cell's share of all chase swings (in-zone cells contribute 0).
      return totals.totalChaseSwings > 0
        ? c.chaseSwings / totals.totalChaseSwings
        : NaN;
    case "called":
      // Cell's share of all called strikes.
      return totals.totalCalled > 0 ? c.called / totals.totalCalled : NaN;
    case "csw":
      // Cell's share of all called-strike + whiff events.
      return totals.totalCsw > 0
        ? (c.called + c.whiffs) / totals.totalCsw
        : NaN;
  }
}

export function parseHeatMetric(value: string | null): HeatMetric | null {
  switch (value) {
    case "whiff":
    case "chase":
    case "called":
    case "csw":
      return value;
    default:
      return null;
  }
}

export const HEAT_METRIC_LABELS: Record<HeatMetric, string> = {
  whiff: "Whiff %",
  chase: "Chase %",
  called: "Called strike %",
  csw: "CSW %",
};

export const HEAT_METRIC_DESCRIPTIONS: Record<HeatMetric, string> = {
  whiff:
    "Each cell's share of all whiffs in the selection. Cells sum to 100% — answers 'where do his whiffs land?'.",
  chase:
    "Each cell's share of all chase swings (swings on out-of-zone pitches). In-zone cells stay blank since a swing in zone isn't a chase.",
  called:
    "Each cell's share of all called strikes in the selection. Reveals the spots a pitcher gets the umpire's call.",
  csw:
    "Each cell's share of all called-strike + whiff events combined. Standard 'dominant pitch' density map.",
};
