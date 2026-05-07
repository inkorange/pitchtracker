"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  CanvasTexture,
  CatmullRomCurve3,
  SRGBColorSpace,
  Vector3,
  type Mesh,
} from "three";
import { statcastToThree } from "@/lib/viz/coords";

// Lazily build a procedural baseball texture once and reuse it across
// every in-flight ball. Two figure-8-ish seam curves in red with
// perpendicular stitch ticks — wraps cleanly onto a standard sphere
// UV so the seam reads as a baseball at any rotation.
let cachedBaseballTexture: CanvasTexture | null = null;
function getBaseballTexture(): CanvasTexture {
  if (cachedBaseballTexture) return cachedBaseballTexture;
  const w = 512;
  const h = 256;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  // Off-white base — slightly warmer than pure white reads more like
  // a real ball under stadium lighting.
  ctx.fillStyle = "#f4f1ea";
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = "#9a2222";
  ctx.lineCap = "round";

  // Two opposing sine waves form the seam pattern. They cross at
  // x = 0 / w/2, which look like the figure-8 nodes when wrapped.
  const amp = h * 0.22;
  const seamY = (x: number, sign: number) =>
    h / 2 + sign * amp * Math.sin((x / w) * Math.PI * 2);

  const drawSeam = (sign: number) => {
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let x = 0; x <= w; x++) {
      const y = seamY(x, sign);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  };
  drawSeam(+1);
  drawSeam(-1);

  // Stitch ticks: short perpendicular dashes along each seam, evenly
  // spaced so the rotation reads as discrete stitches when the ball
  // spins past the camera.
  ctx.lineWidth = 2.5;
  const stitchCount = 36;
  for (let i = 0; i < stitchCount; i++) {
    const x = (i / stitchCount) * w + w / stitchCount / 2;
    for (const sign of [+1, -1]) {
      const y = seamY(x, sign);
      const dy =
        sign * amp * ((Math.PI * 2) / w) * Math.cos((x / w) * Math.PI * 2);
      const len = Math.hypot(dy, 1);
      const px = -dy / len;
      const py = 1 / len;
      const tickHalf = 7;
      ctx.beginPath();
      ctx.moveTo(x - px * tickHalf, y - py * tickHalf);
      ctx.lineTo(x + px * tickHalf, y + py * tickHalf);
      ctx.stroke();
    }
  }

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  cachedBaseballTexture = tex;
  return tex;
}

interface BallTracerProps {
  path: Array<[number, number, number]>;
  // 0 = at release, 1 = at plate. Owned by parent (the playback bar).
  progress: number;
}

export function BallTracer({ path, progress }: BallTracerProps) {
  const meshRef = useRef<Mesh>(null);
  const curve = useMemo(() => {
    const points = path.map((p) => new Vector3(...statcastToThree(p)));
    return new CatmullRomCurve3(points);
  }, [path]);
  const texture = useMemo(() => getBaseballTexture(), []);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const t = Math.max(0, Math.min(1, progress));
    const point = curve.getPoint(t);
    meshRef.current.position.copy(point);
    // Visual spin: ~4 rev/sec wall-clock. Real MLB spin is ~33-40 Hz
    // which would alias on a 60 fps display, so we tune for legibility
    // rather than physical accuracy. Rotation around X reads as
    // backspin/topspin from the front-preset camera.
    meshRef.current.rotation.x += delta * Math.PI * 8;
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[0.13, 32, 32]} />
      <meshStandardMaterial map={texture} roughness={0.4} metalness={0.05} />
    </mesh>
  );
}
