// Snap math for BottomSheet. Positions are the sheet's *visible height*
// in px (bigger = more open).

/**
 * Pick the snap point to settle on after a drag. A quick flick
 * (|velocity| over the threshold, px/ms, positive = upward/opening)
 * moves one step in the flick's direction; otherwise the nearest snap
 * to where the drag ended wins.
 */
export function settleSnap(visible: number, velocity: number, snaps: readonly number[], fromIndex: number): number {
  const FLICK = 0.5;
  if (velocity > FLICK) return Math.min(fromIndex + 1, snaps.length - 1);
  if (velocity < -FLICK) return Math.max(fromIndex - 1, 0);
  let best = 0;
  for (let i = 1; i < snaps.length; i++) {
    if (Math.abs(snaps[i] - visible) < Math.abs(snaps[best] - visible)) best = i;
  }
  return best;
}

/** Keep a dragged height inside the snap range, with a little rubber band past the ends. */
export function clampVisible(visible: number, snaps: readonly number[]): number {
  const min = snaps[0];
  const max = snaps[snaps.length - 1];
  if (visible < min) return min - (min - visible) * 0.3;
  if (visible > max) return max + (visible - max) * 0.3;
  return visible;
}
