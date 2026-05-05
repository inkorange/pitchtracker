// Statcast coords: x lateral (third-base side positive), y distance from plate
// (mound positive at ~60.5), z height (up positive).
// Three.js convention: x lateral (right positive), y up positive, z toward viewer
// positive (out of screen).
//
// Mapping puts plate at origin (0, 0, 0), mound at z = -60.5, ball at sz height.

export function statcastToThree(p: [number, number, number]): [number, number, number] {
  return [p[0], p[2], -p[1]];
}
