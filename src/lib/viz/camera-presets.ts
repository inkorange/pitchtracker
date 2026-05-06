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

// Path midpoint (release ~55 ft from plate, plate at z=0): z = -28, y = 4.
const PATH_MID: [number, number, number] = [0, 4.2, -28];

export const CAMERA_PRESETS: Record<CameraPreset, CameraPosition> = {
  // Hitter's eye: behind the plate looking toward the mound. Camera pulled
  // back to 16 ft and aimed at chest-area in the distance so the plate and
  // the full strike zone both fit in the lower portion of the frame.
  front: {
    position: [0, 4, 16],
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
  // Third-base side profile: pulled back so the entire pitch path is visible
  // horizontally on a 16:9 frame with comfortable margin (~10 ft each side).
  side: {
    position: [-50, 5.5, -28],
    target: PATH_MID,
  },
};
