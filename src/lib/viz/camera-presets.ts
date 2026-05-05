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
  // Bird's eye: the dirt extends ~155 ft from home in the outfield direction
  // (95 ft arc from the rubber). Camera is high enough to fit the full dirt
  // area plus a slice of outfield grass.
  top: {
    position: [0, 230, -85],
    target: [0, 0, -85],
  },
  // Third-base side profile: pulled back so the entire pitch path is visible
  // horizontally on a 16:9 frame with comfortable margin (~10 ft each side).
  side: {
    position: [-50, 5.5, -28],
    target: PATH_MID,
  },
};
