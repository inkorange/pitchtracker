"use client";

import { useEnvToggles } from "@/lib/env-toggles-store";

// Base ambient + hemisphere give every face flat, coherent lighting.
// The directional light is added on top ONLY when the shadows toggle
// is on — it's the caster that produces the batter's ground shadow.
// Toggling it off drops back to purely ambient/hemisphere lighting
// (no shadow map generated, cheap and flat).
export function Lighting() {
  const { shadows } = useEnvToggles();
  // Base ambient + hemisphere intensities compensate for the
  // directional light being on or off — with shadows on we split the
  // light budget across all three so the scene's total illumination
  // stays close to the original 1.0 (0.55 ambient + 0.45 hemisphere).
  // Overshooting that budget washes out grass and dirt colors, so we
  // tune the ambient/hemi split conservatively when shadows are on:
  //   0.22 + 0.22 + 0.5 ≈ 0.94, slightly UNDER the original 1.0 to
  //   preserve the colors' saturation and let the shadow provide the
  //   remaining perceived brightness. Values under 1.0 are fine —
  //   MeshStandardMaterial's color response is nonlinear so a small
  //   dip below 1.0 doesn't crush the scene.
  const ambientI = shadows ? 0.22 : 0.55;
  const hemiI = shadows ? 0.22 : 0.45;
  return (
    <>
      <ambientLight intensity={ambientI} />
      <hemisphereLight args={["#cfdcec", "#6f5538", hemiI]} />
      {shadows ? (
        <directionalLight
          // Positioned mostly OVERHEAD with a small offset so the
          // batter's shadow lands right below the batter — inside the
          // home-plate dirt circle (an opaque receiver) rather than
          // falling off into transparent grass which doesn't receive
          // shadows well.
          position={[10, 80, 5]}
          intensity={0.5}
          castShadow
          // 2k shadow map — sharp enough for a batter-sized caster
          // without stressing perf. Larger sizes give crisper edges
          // but double memory each step.
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          // Orthographic shadow camera bounds: the sun projects an
          // orthographic frustum onto the scene, and anything OUTSIDE
          // this box gets no shadow. Widen to cover the mound → plate
          // area with generous margin so the batter's cast shadow
          // always lands inside the map.
          shadow-camera-left={-60}
          shadow-camera-right={60}
          shadow-camera-top={60}
          shadow-camera-bottom={-60}
          shadow-camera-near={0.5}
          shadow-camera-far={200}
          // normalBias pushes shadow-test samples along the surface
          // normal by this many world units — the modern replacement
          // for `bias`, and it doesn't over-shift the projected shadow
          // onto adjacent surfaces the way the raw bias did. Previous
          // -0.0005 bias pushed the batter's shadow BELOW the ground
          // plane and it was invisible from above.
          shadow-normalBias={0.05}
        />
      ) : null}
    </>
  );
}
