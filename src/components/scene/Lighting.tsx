"use client";

export function Lighting() {
  return (
    <>
      {/* Ambient: slightly lower than before so the directional lights
          contribute real shading, but not so low that the dirt + grass
          go muddy. */}
      <ambientLight intensity={0.18} />
      {/* Hemisphere: warm sky tone above, cool dirt tone below. Gives
          everything a subtle outdoor feel without baking in a single
          dominant color. */}
      <hemisphereLight args={["#b8cfe0", "#5a4426", 0.22]} />
      {/* Key light: warm, from up-and-to-the-right. Gives the plate,
          bases, and mound real shading and a soft side highlight. */}
      <directionalLight position={[16, 28, 8]} intensity={0.5} color="#fff2db" />
      {/* Fill: cooler, from the opposite side, so shadowed faces don't
          go pure black. */}
      <directionalLight position={[-14, 10, -12]} intensity={0.13} color="#9ab1c9" />
    </>
  );
}
