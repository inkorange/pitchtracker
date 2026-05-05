"use client";

export function Lighting() {
  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[12, 22, 6]} intensity={0.85} color="#ffffff" />
      <directionalLight position={[-12, 8, -10]} intensity={0.35} color="#9ab1c9" />
    </>
  );
}
