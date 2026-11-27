import type { ReactNode } from "react";

/**
 * Slanted accent tag ("STATCAST IN 3D", "AT-BAT REPLAY") —
 * design/DESIGN.md §2 "Eyebrow tag".
 */
export function EyebrowTag({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-block slant-right bg-accent text-white font-display font-bold text-[15px] leading-tight tracking-[1.5px] uppercase pl-2.5 pr-3.5 py-1 ${className}`}
    >
      {children}
    </span>
  );
}
