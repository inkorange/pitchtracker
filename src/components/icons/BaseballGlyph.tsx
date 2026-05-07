// Tiny inline baseball — used as the active-pitch dot in the at-bat
// playback stepper while a pitch is mid-flight, so the dot reads like
// the spinning baseball rendered in the 3D scene rather than a flat
// white circle.
//
// Sized to fill its parent box. Kept stroke-based so it stays crisp
// at any size and avoids needing an asset.
//
// `spinning` toggles a 0.25s linear rotation on the whole glyph so
// the dot visually mirrors the 3D ball's spin in flight.
export function BaseballGlyph({
  className,
  spinning = false,
}: {
  className?: string;
  spinning?: boolean;
}) {
  const animClass = spinning
    ? "[animation:spin_0.25s_linear_infinite]"
    : "";
  return (
    <svg
      viewBox="0 0 24 24"
      width="100%"
      height="100%"
      className={`${animClass} ${className ?? ""}`.trim()}
      aria-hidden
    >
      <circle cx="12" cy="12" r="11.25" fill="#f4f1ea" />
      {/* Two seam curves on the left/right edges — the classic
          baseball "()" pattern. Bolder strokes than v1 so the seams
          read at small sizes. */}
      <path
        d="M 5 3 Q 1 12 5 21"
        stroke="#9a2222"
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M 19 3 Q 23 12 19 21"
        stroke="#9a2222"
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
      />
      {/* Stitches — 7 per side, perpendicular to each curve. The
          extra stitches above the v1 count make the seam pattern
          unmistakable when the glyph spins. */}
      <g stroke="#9a2222" strokeWidth="0.9" strokeLinecap="round">
        {/* Left seam stitches */}
        <line x1="2.2" y1="5.5" x2="5.2" y2="4.6" />
        <line x1="1.4" y1="7.8" x2="4.4" y2="7.2" />
        <line x1="0.9" y1="10" x2="3.9" y2="10" />
        <line x1="0.7" y1="12" x2="3.7" y2="12" />
        <line x1="0.9" y1="14" x2="3.9" y2="14" />
        <line x1="1.4" y1="16.2" x2="4.4" y2="16.8" />
        <line x1="2.2" y1="18.5" x2="5.2" y2="19.4" />
        {/* Right seam stitches (mirrored) */}
        <line x1="21.8" y1="5.5" x2="18.8" y2="4.6" />
        <line x1="22.6" y1="7.8" x2="19.6" y2="7.2" />
        <line x1="23.1" y1="10" x2="20.1" y2="10" />
        <line x1="23.3" y1="12" x2="20.3" y2="12" />
        <line x1="23.1" y1="14" x2="20.1" y2="14" />
        <line x1="22.6" y1="16.2" x2="19.6" y2="16.8" />
        <line x1="21.8" y1="18.5" x2="18.8" y2="19.4" />
      </g>
    </svg>
  );
}
