import type { PitchTypeLine } from "@/lib/pitchers/directory-shapes";
import { getPitchColor, getPitchLabel } from "@/lib/viz/colors";

/** Stacked usage bar, one segment per pitch type. Omit `width` to fill. */
export function MixBar({
  mix,
  width,
  height = 8,
}: {
  mix: Pick<PitchTypeLine, "type" | "usage">[];
  width?: number;
  height?: number;
}) {
  const label = mix.map((m) => `${getPitchLabel(m.type)} ${Math.round(m.usage)}%`).join(", ");
  return (
    <span
      role="img"
      aria-label={`Arsenal mix: ${label}`}
      className={`flex rounded overflow-hidden bg-line ${width == null ? "w-full" : ""}`}
      style={{ width, height }}
    >
      {mix.map((m) => (
        <span key={m.type} className="block" style={{ width: `${m.usage}%`, background: getPitchColor(m.type) }} />
      ))}
    </span>
  );
}
