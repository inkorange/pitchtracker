import type { ReactNode } from "react";

export type ScoreBugSegment = {
  content: ReactNode;
  /**
   * - `team`  — dark block (--bg-raised, white text), e.g. "MIL"
   * - `name`  — light block (--text fill, --bg text), e.g. "J. MISIOROWSKI"
   * - `tag`   — accent block, e.g. "RHP"
   * - `plain` — dark overlay block for extra readouts ("0-2", "98.1 MPH")
   */
  tone: "team" | "name" | "tag" | "plain";
};

const TONE: Record<ScoreBugSegment["tone"], string> = {
  team: "bg-bg-raised text-white",
  name: "bg-ink text-bg",
  tag: "bg-accent text-white",
  plain: "bg-overlay text-ink",
};

const SIZE = {
  sm: "text-base px-2.5 py-1",
  md: "text-lg px-3 py-1.5",
  lg: "text-xl px-3.5 py-1.5",
} as const;

/**
 * Broadcast score bug: a row of flush, square-cornered blocks in
 * Barlow Condensed (design/DESIGN.md §2 "ScoreBug").
 */
export function ScoreBug({
  segments,
  size = "md",
  className = "",
  label,
}: {
  segments: ScoreBugSegment[];
  size?: keyof typeof SIZE;
  className?: string;
  /** Accessible summary, e.g. "Milwaukee, Jacob Misiorowski, right-handed pitcher". */
  label?: string;
}) {
  return (
    <div
      className={`inline-flex items-stretch font-display font-bold tracking-[1px] uppercase leading-none shadow-[0_4px_16px_rgba(0,0,0,0.35)] num ${className}`}
      role={label ? "group" : undefined}
      aria-label={label}
    >
      {segments.map((s, i) => (
        <span key={i} className={`flex items-center ${TONE[s.tone]} ${SIZE[size]}`}>
          {s.content}
        </span>
      ))}
    </div>
  );
}
