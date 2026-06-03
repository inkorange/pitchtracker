// Tuning knobs for 3D scene rendering performance. Shared between
// the server (so the pitcher-card caption can reflect what the
// scene will actually render) and the client (where the split is
// applied).

/**
 * Maximum pitches rendered as full ribbon tubes. Past this count
 * (after recency sort), the older cohort drops to a single merged
 * LineSegments mesh — one draw call total — so the canvas stays
 * smooth at season-volume pitcher pools (~2500+ pitches by EOY).
 *
 * Tuned for ~60fps on a desktop GPU while keeping ribbon hover /
 * click feeling responsive in the recent cohort. Bump down for
 * mobile if perf complaints land; bump up if instancing lands and
 * makes the per-ribbon cost negligible.
 */
export const RECENT_RIBBON_CAP = 500;
