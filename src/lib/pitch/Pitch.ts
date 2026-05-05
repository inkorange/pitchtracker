// Reconstructs the trajectory of a Statcast pitch from the constant-acceleration
// model parameters recorded at y=50ft.
//
// Coordinate system (Statcast):
//   x = lateral, positive = catcher's right (third base side)
//   y = distance from home plate, positive toward the pitcher's mound (~60.5 ft)
//   z = vertical, positive up
//
// Time t is measured in seconds relative to the y=50ft reference frame, where
// t=0 corresponds to the moment the ball was at y=50. Release happens before
// t=0 (negative t), plate arrival happens after (positive t).

export interface StatcastRow {
  release_pos_x: number;
  release_pos_y: number;
  release_pos_z: number;
  vx0: number;
  vy0: number;
  vz0: number;
  ax: number;
  ay: number;
  az: number;
  plate_x: number;
  plate_z: number;
  release_speed: number;
  release_spin_rate?: number;
  spin_axis?: number;
  pfx_x?: number;
  pfx_z?: number;
  pitch_type: string;
  pitch_name?: string;
  description?: string;
  events?: string;
}

const REFERENCE_Y = 50;
const FT_PER_SEC_TO_MPH = 0.681818;

export class Pitch {
  readonly row: StatcastRow;
  private readonly _x0: number;
  private readonly _z0: number;

  constructor(row: StatcastRow) {
    this.row = row;
    const tRelease = this._solveTimeAtY(row.release_pos_y);
    this._x0 = row.release_pos_x - row.vx0 * tRelease - 0.5 * row.ax * tRelease * tRelease;
    this._z0 = row.release_pos_z - row.vz0 * tRelease - 0.5 * row.az * tRelease * tRelease;
  }

  positionAtTime(t: number): [number, number, number] {
    const { vx0, vy0, vz0, ax, ay, az } = this.row;
    return [
      this._x0 + vx0 * t + 0.5 * ax * t * t,
      REFERENCE_Y + vy0 * t + 0.5 * ay * t * t,
      this._z0 + vz0 * t + 0.5 * az * t * t,
    ];
  }

  path(samples = 50, plateY = 0): Array<[number, number, number]> {
    const tStart = this._solveTimeAtY(this.row.release_pos_y);
    const tEnd = this._solveTimeAtY(plateY);
    const step = (tEnd - tStart) / (samples - 1);
    const points: Array<[number, number, number]> = [];
    for (let i = 0; i < samples; i++) {
      points.push(this.positionAtTime(tStart + i * step));
    }
    return points;
  }

  velocityAt(y: number): number {
    const t = this._solveTimeAtY(y);
    const { vx0, vy0, vz0, ax, ay, az } = this.row;
    const vx = vx0 + ax * t;
    const vy = vy0 + ay * t;
    const vz = vz0 + az * t;
    return Math.sqrt(vx * vx + vy * vy + vz * vz) * FT_PER_SEC_TO_MPH;
  }

  breakAt(_y: number): [number, number] {
    // For MVP: returns Statcast's cumulative break at the plate (pfx_x, pfx_z).
    // The y argument will be honored when we replace this with a path-relative
    // break calculation against the gravity-only "no movement" trajectory.
    void _y;
    return [this.row.pfx_x ?? 0, this.row.pfx_z ?? 0];
  }

  flightDuration(plateY = 0): number {
    return this._solveTimeAtY(plateY) - this._solveTimeAtY(this.row.release_pos_y);
  }

  private _solveTimeAtY(targetY: number): number {
    const { vy0, ay } = this.row;
    // Solve: 0.5 * ay * t^2 + vy0 * t + (REFERENCE_Y - targetY) = 0
    const a = 0.5 * ay;
    const b = vy0;
    const c = REFERENCE_Y - targetY;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return NaN;
    const root1 = (-b - Math.sqrt(disc)) / (2 * a);
    const root2 = (-b + Math.sqrt(disc)) / (2 * a);
    // For a pitch (vy0 < 0, decreasing y), the physically reasonable root is the one
    // closer to t=0. Release time is negative, plate time is positive.
    return Math.abs(root1) < Math.abs(root2) ? root1 : root2;
  }
}
