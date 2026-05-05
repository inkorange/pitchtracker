// All positions in Three.js coords (Y up, plate at origin, mound at z = -60.5).

export type CameraPreset = "front" | "back" | "top" | "side";

export interface CameraPosition {
  position: [number, number, number];
  target: [number, number, number];
}

const PATH_MID: [number, number, number] = [0, 4, -30];

export const CAMERA_PRESETS: Record<CameraPreset, CameraPosition> = {
  // Hitter's eye: behind the plate looking toward the mound
  front: {
    position: [0, 5.5, 8],
    target: [0, 5, -60],
  },
  // Pitcher's view: behind the mound looking toward the plate
  back: {
    position: [0, 6.5, -65],
    target: [0, 3, 0],
  },
  // Bird's eye: straight down on the path
  top: {
    position: [0, 60, -30],
    target: [0, 0, -30],
  },
  // Third-base side profile
  side: {
    position: [-30, 6, -30],
    target: PATH_MID,
  },
};
