import type { ReactNode } from "react";

/**
 * Broadcast lower third: overlay box with a 4px left rule, an 11px
 * caps label and a Barlow Condensed value (design/DESIGN.md §2).
 * Pass `color` to key the rule to the current pitch type; defaults
 * to the brand accent.
 */
export function LowerThird({
  label,
  value,
  color,
  size = "md",
  className = "",
}: {
  label: ReactNode;
  value: ReactNode;
  color?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const valueSize = { sm: "text-[22px]", md: "text-2xl", lg: "text-[30px]" }[size];
  return (
    <div
      className={`flex flex-col gap-0.5 bg-overlay border-l-4 border-accent px-4 py-2.5 ${className}`}
      style={color ? { borderLeftColor: color } : undefined}
    >
      <span className="label-caps tracking-[1.5px]">{label}</span>
      <span
        className={`font-display font-bold uppercase leading-tight tracking-[0.5px] text-ink num ${valueSize}`}
      >
        {value}
      </span>
    </div>
  );
}
