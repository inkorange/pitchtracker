// All positions in Three.js coords (Y up, plate at origin, mound at z = -60.5).
//
// Framing target: a typical pitch path spans ~55 ft in z (release to plate),
// ~4 ft vertically, ~2 ft laterally. At 45° vertical FOV on 16:9 desktop,
// horizontal FOV is ~72°, so the camera distance has to be enough to fit
// 55+ ft in the relevant axis with margin.

export type CameraPreset = "front" | "back" | "top" | "side";

export interface CameraPosition {
  position: [number, number, number];
  target: [number, number, number];
}

export const CAMERA_PRESETS: Record<CameraPreset, CameraPosition> = {
  // Hitter's eye: behind the plate looking toward the mound. Slightly
  // off-center (toward the 1B side) and slightly elevated so the view
  // feels less like a centered diagram and more like a real broadcast
  // camera; pulled in to 11 ft for a tighter framing on the release-to-
  // plate path.
  front: {
    position: [1.2, 4.3, 11],
    target: [0, 2.5, -55],
  },
  // Pitcher's view: behind the mound looking at the plate.
  back: {
    position: [0, 6.5, -68],
    target: [0, 3, 0],
  },
  // Bird's eye, tight: just the plate, batter's box, and mound in full
  // view. Camera at y=100 over the midpoint between home and mound
  // (z=-30) so the visible area spans roughly z=-71 to z=+11 — enough
  // for home plate area, mound, and a slice past it.
  // Camera is nudged 1 ft toward the plate (z=-29) so the view isn't
  // exactly gimbal-locked above the target — that locks screen-up to
  // world -z, putting the mound at the top and home plate at the bottom.
  top: {
    position: [0, 100, -29],
    target: [0, 0, -30],
  },
  // Third-base side profile. Camera moved closer to home plate (z=-10
  // instead of z=-28) so the strike zone area + batter silhouette sit
  // central in the frame. The release end of the path (z≈-55) lands
  // near the left edge of the canvas — still visible on desktop, may
  // clip slightly on mobile portrait, which is the right tradeoff
  // since the batter and plate are the focus of an at-bat.
  side: {
    position: [-55, 5.5, -10],
    target: [0, 3, -15],
  },
};
