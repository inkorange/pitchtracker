// Plate heat grid: bucket pitches into a 2D grid covering the strike
// zone + a chase margin, then compute per-cell rates (whiff%, etc.)
// for the heat-overlay visualization on the pitcher page.
//
// Coordinates here are Statcast plate_x / plate_z (feet). plate_x is
// lateral (positive = catcher's right / 3B side), plate_z is height.
// The Stage's strike-zone wireframe uses w=0.71 (half-width) and
// vertical bounds 1.5 → 3.55 ft, so we pad slightly to capture chases.

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
  swings: number; // foul, foul tip, swstr, swstr blocked, in-play, missed bunt
  whiffs: number; // swstr, swstr blocked, missed bunt
  called: number; // called strikes
  inZone: boolean;
  /**
   * The active metric's value in [0, 1]. NaN when the denominator is
   * zero (e.g. "whiff%" in a cell with no swings) — the renderer
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

const SWING_DESCRIPTIONS = new Set([
  "foul",
  "foul_tip",
  "foul_bunt",
  "hit_into_play",
  "swinging_strike",
  "swinging_strike_blocked",
  "missed_bunt",
]);

const WHIFF_DESCRIPTIONS = new Set([
  "swinging_strike",
  "swinging_strike_blocked",
  "missed_bunt",
]);

const CALLED_DESCRIPTIONS = new Set(["called_strike"]);

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
        inZone,
        value: NaN,
      });
    }
  }

  let total = 0;
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
    const d = p.description ?? "";
    if (SWING_DESCRIPTIONS.has(d)) c.swings += 1;
    if (WHIFF_DESCRIPTIONS.has(d)) c.whiffs += 1;
    if (CALLED_DESCRIPTIONS.has(d)) c.called += 1;
  }

  // Second pass: compute the active metric per cell.
  for (const c of cells) {
    c.value = computeMetric(c, metric);
  }

  return { cols, rows, xMin, xMax, zMin, zMax, metric, cells, total };
}

function computeMetric(c: HeatCell, metric: HeatMetric): number {
  switch (metric) {
    case "whiff":
      // Swing-and-miss rate among swings.
      return c.swings > 0 ? c.whiffs / c.swings : NaN;
    case "chase":
      // Out-of-zone swing rate.
      if (c.inZone) return NaN;
      return c.total > 0 ? c.swings / c.total : NaN;
    case "called":
      // Called-strike rate among takes (non-swings).
      const takes = c.total - c.swings;
      return takes > 0 ? c.called / takes : NaN;
    case "csw":
      // Called Strikes + Whiffs share of all pitches.
      return c.total > 0 ? (c.called + c.whiffs) / c.total : NaN;
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
    "Share of swings batters miss entirely, computed per grid cell. Higher = more unhittable stuff in that zone.",
  chase:
    "Share of out-of-zone pitches batters swing at. Cells inside the strike zone are blank since 'chase' only applies to balls.",
  called:
    "Share of takes that were called strikes, per cell. Higher = batters letting good pitches go by — freeze-em territory.",
  csw:
    "Called Strikes + Whiffs as a share of all pitches in that cell. Best single-pitch dominance metric in zone.",
};
