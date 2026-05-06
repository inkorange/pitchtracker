"use client";

import { statcastToThree } from "@/lib/viz/coords";
import { getPitchColor } from "@/lib/viz/colors";

interface TunnelMarkerProps {
  // World-space (Statcast) position of the tunnel point. The component
  // converts to Three.js coords internally.
  position: [number, number, number];
  pitchType: string;
}

// Small glowing sphere at the tunnel point — visually marks where the
// two paths "diverge" at the threshold. One marker per matched pitch
// type, colored by the pitch type so the user can read which pitch
// each marker corresponds to.
export function TunnelMarker({ position, pitchType }: TunnelMarkerProps) {
  const three = statcastToThree(position);
  const color = getPitchColor(pitchType);
  return (
    <mesh position={three}>
      <sphereGeometry args={[0.18, 16, 16]} />
      <meshStandardMaterial color={color} roughness={0.3} metalness={0.1} />
    </mesh>
  );
}
