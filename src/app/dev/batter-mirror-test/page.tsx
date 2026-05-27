"use client";

import { useMemo } from "react";
import { Html, useGLTF } from "@react-three/drei";
import { Box3, DoubleSide, Mesh, Vector3 } from "three";
import { Scene } from "@/components/scene/Scene";

// Dev page for picking the correct LHB mirror config.
// Visit: /dev/batter-mirror-test
//
// Five batter variants laid out in a row across home plate. The
// labels above each one describe its transform config. Identify the
// LHB stance you want — bat on the opposite shoulder from the
// reference RHB at the far right — and tell me which label. I'll
// commit that single config back into BatterModel.

const MODEL_URL = "/models/batter.glb";
const HEIGHT_FT = 6.2;

interface VariantProps {
  position: [number, number]; // (x, z) on the field
  label: string;
  scaleSignX?: 1 | -1;
  scaleSignY?: 1 | -1;
  scaleSignZ?: 1 | -1;
  rotationDeg?: number;
}

function DebugBatter({
  position,
  label,
  scaleSignX = 1,
  scaleSignY = 1,
  scaleSignZ = 1,
  rotationDeg = 90,
}: VariantProps) {
  const gltf = useGLTF(MODEL_URL);
  const clone = useMemo(() => gltf.scene.clone(true), [gltf.scene]);

  const { scale, feetOffsetY } = useMemo(() => {
    const box = new Box3().setFromObject(clone);
    const size = new Vector3();
    box.getSize(size);
    const s = size.y > 0 ? HEIGHT_FT / size.y : 1;
    return { scale: s, feetOffsetY: -box.min.y * s };
  }, [clone]);

  useMemo(() => {
    clone.traverse((obj) => {
      if (obj instanceof Mesh && obj.material) {
        const m = obj.material;
        if (Array.isArray(m)) for (const mat of m) mat.side = DoubleSide;
        else m.side = DoubleSide;
      }
    });
  }, [clone]);

  const rotY = (rotationDeg * Math.PI) / 180;

  return (
    <group position={[position[0], feetOffsetY, position[1]]}>
      <group
        rotation={[0, rotY, 0]}
        scale={[scaleSignX * scale, scaleSignY * scale, scaleSignZ * scale]}
      >
        <primitive object={clone} />
      </group>
      <Html position={[0, HEIGHT_FT + 1.5, 0]} center zIndexRange={[10, 0]}>
        <div
          style={{
            color: "white",
            background: "rgba(8, 26, 50, 0.85)",
            border: "1px solid rgba(255,255,255,0.15)",
            padding: "4px 8px",
            borderRadius: "6px",
            fontFamily: "ui-monospace, monospace",
            fontSize: "11px",
            whiteSpace: "nowrap",
            textAlign: "center",
            pointerEvents: "none",
          }}
        >
          {label}
        </div>
      </Html>
    </group>
  );
}

useGLTF.preload(MODEL_URL);

export default function BatterMirrorTestPage() {
  // Spread variants along scene X. Z = -8 puts them slightly toward
  // the pitcher's mound from home plate, away from the plate clutter.
  const Z_LANE = -8;
  return (
    <main className="fixed inset-0 bg-[#0a0e14]">
      <Scene
        preset="front"
        presetOverride={{
          // Pull the camera back and up so all 6 variants are framed.
          position: [0, 16, 28],
          target: [0, 3, -8],
        }}
      >
        {/* Reference: RHB pose. The model as-shipped, no mirror, the
            rotation we settled on previously. */}
        <DebugBatter
          position={[-30, Z_LANE]}
          label="A · RHB control (no mirror, rot 90°)"
        />
        <DebugBatter
          position={[-18, Z_LANE]}
          label="B · scaleX=-1, rot 90°"
          scaleSignX={-1}
        />
        <DebugBatter
          position={[-6, Z_LANE]}
          label="C · scaleZ=-1, rot 90°"
          scaleSignZ={-1}
        />
        <DebugBatter
          position={[6, Z_LANE]}
          label="D · scaleX=-1, rot 270°"
          scaleSignX={-1}
          rotationDeg={270}
        />
        <DebugBatter
          position={[18, Z_LANE]}
          label="E · scaleZ=-1, rot 270°"
          scaleSignZ={-1}
          rotationDeg={270}
        />
        <DebugBatter
          position={[30, Z_LANE]}
          label="F · scaleX=-1 + scaleZ=-1, rot 90°"
          scaleSignX={-1}
          scaleSignZ={-1}
        />
      </Scene>

      <div className="absolute top-4 left-4 z-20 px-4 py-3 rounded-md bg-black/70 backdrop-blur-md border border-white/15 text-white/90 text-[12px] leading-relaxed max-w-md pointer-events-auto">
        <div className="font-semibold mb-1">Batter mirror picker</div>
        <div className="text-white/70">
          Reference (A) is the RHB pose. Find the variant where the bat
          is on the <em>opposite</em> shoulder and the body faces the
          plate from the LHB box. Tell me which letter (A–F) and I&apos;ll
          lock that config into <code className="text-[11px]">BatterModel</code>.
        </div>
      </div>
    </main>
  );
}
