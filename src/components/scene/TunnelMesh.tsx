"use client";

import { useMemo } from "react";
import {
  BackSide,
  BufferGeometry,
  Float32BufferAttribute,
  FrontSide,
  TorusGeometry,
  Vector3,
} from "three";
import { statcastToThree } from "@/lib/viz/coords";
import type { TunnelEnvelope } from "@/lib/pitch/tunnelEnvelope";

const RADIAL_SEGMENTS = 24;
const COMMIT_Y_FT = 23.8;
// Color the cone in a neutral cyan so it reads as "guidance overlay"
// rather than competing with the per-pitch palette.
const TUNNEL_COLOR = "#5fc7d8";
const COMMIT_RING_COLOR = "#ffd166";

interface TunnelMeshProps {
  envelope: TunnelEnvelope;
  opacity?: number;
}

// Variable-radius tube around the tunnel spine. Cap-less (open at both
// ends) so the cone reads as a swept volume, not a closed pill.
export function TunnelMesh({ envelope, opacity = 0.4 }: TunnelMeshProps) {
  const tubeGeometry = useMemo(
    () => buildVariableTube(envelope.spine, envelope.radii, RADIAL_SEGMENTS),
    [envelope],
  );

  const commitRing = useMemo(() => {
    const ring = interpolateAtY(envelope.spine, envelope.radii, COMMIT_Y_FT);
    if (!ring) return null;
    return {
      center: statcastToThree(ring.point),
      // Torus's hole points along its local +Z; aligning that to the
      // tangent at this y puts the ring perpendicular to flight.
      axis: ring.tangent.normalize(),
      radius: ring.radius,
    };
  }, [envelope]);

  // Render the cone in two passes so each face composites cleanly
  // instead of blending unpredictably as a single DoubleSide pass.
  // Pass 1 (renderOrder=1): the back wall (far interior) at lower
  // opacity. Pass 2 (renderOrder=2): the front wall at higher opacity.
  // The combination reads as a solid translucent skin with the far
  // wall ghosting through — the cone shape is unambiguous.
  // A thin wireframe sits on top to nail down the silhouette.
  const farOpacity = Math.min(1, opacity * 0.65);
  const nearOpacity = Math.min(1, opacity);
  const wireOpacity = Math.min(1, opacity * 0.55);

  return (
    <group>
      <mesh geometry={tubeGeometry} renderOrder={1}>
        <meshStandardMaterial
          color={TUNNEL_COLOR}
          transparent
          opacity={farOpacity}
          roughness={0.4}
          metalness={0.05}
          depthWrite={false}
          side={BackSide}
        />
      </mesh>
      <mesh geometry={tubeGeometry} renderOrder={2}>
        <meshStandardMaterial
          color={TUNNEL_COLOR}
          transparent
          opacity={nearOpacity}
          roughness={0.4}
          metalness={0.05}
          depthWrite={false}
          side={FrontSide}
        />
      </mesh>
      <mesh geometry={tubeGeometry} renderOrder={3}>
        <meshBasicMaterial
          color={TUNNEL_COLOR}
          wireframe
          transparent
          opacity={wireOpacity}
          depthWrite={false}
        />
      </mesh>
      {commitRing ? (
        <CommitRing
          center={commitRing.center}
          axis={commitRing.axis}
          radius={commitRing.radius}
        />
      ) : null}
    </group>
  );
}

// Thin glowing torus at the BP commit point (~23.8 ft from plate),
// oriented perpendicular to the spine tangent.
function CommitRing({
  center,
  axis,
  radius,
}: {
  center: [number, number, number];
  axis: Vector3;
  radius: number;
}) {
  const geometry = useMemo(
    () => new TorusGeometry(Math.max(0.05, radius), 0.025, 8, 48),
    [radius],
  );
  // Build a quaternion that rotates the torus's default axis (+Z) onto
  // the desired axis. Use a target Vector3 we copy into via lookAt
  // mirror — easier to just compute the rotation imperatively at
  // render time via group.lookAt below.
  const targetWorld = useMemo(() => {
    return [
      center[0] + axis.x,
      center[1] + axis.y,
      center[2] + axis.z,
    ] as [number, number, number];
  }, [center, axis]);

  return (
    <group
      position={center}
      onUpdate={(self) => {
        // After mount we orient the group so its +Z points along axis.
        // (drei doesn't ship a quaternion-from-vector helper; this is
        // the cleanest way to align the torus.)
        self.lookAt(targetWorld[0], targetWorld[1], targetWorld[2]);
      }}
    >
      <mesh geometry={geometry}>
        <meshStandardMaterial
          color={COMMIT_RING_COLOR}
          emissive={COMMIT_RING_COLOR}
          emissiveIntensity={0.6}
          transparent
          opacity={0.8}
          roughness={0.3}
          metalness={0.1}
        />
      </mesh>
    </group>
  );
}

// Sweep a circle of `radialSegments` points around each spine point and
// stitch quads between consecutive rings. Frame is computed per-vertex
// using world-up as a reference normal (pitches are never vertical so
// this stays stable). Coords are converted Statcast → three.js inside.
function buildVariableTube(
  spineStatcast: Array<[number, number, number]>,
  radii: number[],
  radialSegments: number,
): BufferGeometry {
  const points = spineStatcast.map((p) => statcastToThree(p));
  const N = points.length;
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

  const upRef = new Vector3(0, 1, 0);
  const altRef = new Vector3(0, 0, 1);
  const tangent = new Vector3();
  const normalVec = new Vector3();
  const binormal = new Vector3();

  for (let i = 0; i < N; i++) {
    const p = points[i];
    const r = radii[i];

    if (i === 0) {
      tangent.set(
        points[1][0] - points[0][0],
        points[1][1] - points[0][1],
        points[1][2] - points[0][2],
      );
    } else if (i === N - 1) {
      tangent.set(
        points[N - 1][0] - points[N - 2][0],
        points[N - 1][1] - points[N - 2][1],
        points[N - 1][2] - points[N - 2][2],
      );
    } else {
      tangent.set(
        points[i + 1][0] - points[i - 1][0],
        points[i + 1][1] - points[i - 1][1],
        points[i + 1][2] - points[i - 1][2],
      );
    }
    tangent.normalize();

    const ref = Math.abs(tangent.dot(upRef)) > 0.99 ? altRef : upRef;
    normalVec.copy(ref).addScaledVector(tangent, -ref.dot(tangent)).normalize();
    binormal.crossVectors(tangent, normalVec).normalize();

    for (let j = 0; j < radialSegments; j++) {
      const a = (j / radialSegments) * Math.PI * 2;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      const nx = normalVec.x * cos + binormal.x * sin;
      const ny = normalVec.y * cos + binormal.y * sin;
      const nz = normalVec.z * cos + binormal.z * sin;
      positions.push(p[0] + r * nx, p[1] + r * ny, p[2] + r * nz);
      normals.push(nx, ny, nz);
    }
  }

  for (let i = 0; i < N - 1; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = i * radialSegments + j;
      const b = i * radialSegments + ((j + 1) % radialSegments);
      const c = (i + 1) * radialSegments + j;
      const d = (i + 1) * radialSegments + ((j + 1) % radialSegments);
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  const geom = new BufferGeometry();
  geom.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geom.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  geom.setIndex(indices);
  return geom;
}

// Walk the spine to find the segment bracketing y=targetY (in Statcast
// coords; spine y is monotonically decreasing from release toward
// plate). Returns the interpolated point, the local tangent (in
// Three.js coords, ready to use as an axis), and the interpolated
// radius. Returns null when targetY falls outside the spine's range.
function interpolateAtY(
  spineStatcast: Array<[number, number, number]>,
  radii: number[],
  targetY: number,
): { point: [number, number, number]; tangent: Vector3; radius: number } | null {
  for (let i = 0; i < spineStatcast.length - 1; i++) {
    const a = spineStatcast[i];
    const b = spineStatcast[i + 1];
    if (a[1] >= targetY && b[1] <= targetY) {
      const span = a[1] - b[1];
      const t = span > 0 ? (a[1] - targetY) / span : 0;
      const point: [number, number, number] = [
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t,
      ];
      const radius = radii[i] + (radii[i + 1] - radii[i]) * t;
      // Tangent in three.js coords pointing release→plate.
      const aThree = statcastToThree(a);
      const bThree = statcastToThree(b);
      const tangent = new Vector3(
        bThree[0] - aThree[0],
        bThree[1] - aThree[1],
        bThree[2] - aThree[2],
      );
      return { point, tangent, radius };
    }
  }
  return null;
}
