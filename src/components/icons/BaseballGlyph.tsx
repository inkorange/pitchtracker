// Tiny inline baseball — used as the active-pitch dot in the at-bat
// playback stepper while a pitch is mid-flight, so the dot reads like
// the spinning baseball rendered in the 3D scene rather than a flat
// white circle.
//
// Sized to fill its parent box. Kept stroke-based so it stays crisp
// at any size and avoids needing an asset.
export function BaseballGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="100%"
      height="100%"
      className={className}
      aria-hidden
    >
      <circle cx="10" cy="10" r="9.5" fill="#f4f1ea" />
      {/* Two seam curves on the left and right edges — the classic
          baseball "C" pattern as seen from one side. */}
      <path
        d="M 4 3 Q 0 10 4 17"
        stroke="#9a2222"
        strokeWidth="1"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M 16 3 Q 20 10 16 17"
        stroke="#9a2222"
        strokeWidth="1"
        fill="none"
        strokeLinecap="round"
      />
      {/* Stitches: short ticks straddling each seam curve. */}
      <g stroke="#9a2222" strokeWidth="0.7" strokeLinecap="round">
        <line x1="1.5" y1="6" x2="4.5" y2="5.2" />
        <line x1="0.8" y1="10" x2="3.7" y2="10" />
        <line x1="1.5" y1="14" x2="4.5" y2="14.8" />
        <line x1="18.5" y1="6" x2="15.5" y2="5.2" />
        <line x1="19.2" y1="10" x2="16.3" y2="10" />
        <line x1="18.5" y1="14" x2="15.5" y2="14.8" />
      </g>
    </svg>
  );
}
