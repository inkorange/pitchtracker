"use client";

export function Lighting() {
  return (
    <>
      <ambientLight intensity={0.15} />
      <directionalLight position={[10, 20, 5]} intensity={0.6} color="#ffffff" />
      <directionalLight position={[-10, 8, -10]} intensity={0.3} color="#88aaff" />
      <pointLight position={[0, 8, -30]} intensity={50} color="#ffffff" distance={60} decay={1.5} />
    </>
  );
}
