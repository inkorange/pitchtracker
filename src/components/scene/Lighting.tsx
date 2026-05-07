"use client";

// Global, omnidirectional lighting — no directional/spot lights, no
// shadows. The bump-mapped grass + dirt materials still pick up
// hemispheric variation (sky-tinted from above, ground-tinted from
// below) so the surface relief reads, but every face of every mesh
// gets the same flat illumination so nothing produces a hard
// highlight or cast.
export function Lighting() {
  return (
    <>
      <ambientLight intensity={0.55} />
      <hemisphereLight args={["#cfdcec", "#6f5538", 0.45]} />
    </>
  );
}
