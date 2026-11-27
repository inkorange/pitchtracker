"use client";

import { getPitchColor, getPitchLabel } from "@/lib/viz/colors";
import { pitchResult, ZONE, zonePoint, type SeqPitch } from "./labels";

/** Catcher-view strike zone with numbered pitch locations up to the
 *  current pitch; the current one is ringed white. */
export function ZoneInset({
  pitches,
  currentIdx,
  landed = true,
  compact = false,
}: {
  pitches: SeqPitch[];
  currentIdx: number;
  /** The current pitch's dot appears once it reaches the plate. */
  landed?: boolean;
  compact?: boolean;
}) {
  const shown = pitches.slice(0, landed ? currentIdx + 1 : currentIdx);
  const r = compact ? 14 : 11;
  const label = shown.length
    ? `Strike zone, catcher view: ${shown
        .map((p, i) => `pitch ${i + 1} ${p.pitch_type ? getPitchLabel(p.pitch_type) : ""} ${pitchResult(p.description)}`)
        .join("; ")}`
    : "Strike zone, catcher view";
  return (
    <figure className={`m-0 bg-overlay border border-line-strong rounded-control flex flex-col gap-2 ${compact ? "p-1.5" : "p-3 w-[196px]"}`}>
      {compact ? null : (
        <figcaption className="label-caps">Zone · catcher view</figcaption>
      )}
      <svg
        role="img"
        aria-label={label}
        viewBox="0 0 172 200"
        className={compact ? "w-[86px] h-[100px] block" : "w-[172px] h-[200px] block"}
      >
        <rect
          x={ZONE.left}
          y={ZONE.top}
          width={ZONE.right - ZONE.left}
          height={ZONE.bottom - ZONE.top}
          fill="none"
          stroke="var(--text-2)"
          strokeWidth={compact ? 2 : 1.5}
        />
        {compact ? null : (
          <g stroke="var(--line-strong)">
            {[1, 2].map((k) => {
              const x = ZONE.left + ((ZONE.right - ZONE.left) * k) / 3;
              const y = ZONE.top + ((ZONE.bottom - ZONE.top) * k) / 3;
              return (
                <g key={k}>
                  <line x1={x} y1={ZONE.top} x2={x} y2={ZONE.bottom} />
                  <line x1={ZONE.left} y1={y} x2={ZONE.right} y2={y} />
                </g>
              );
            })}
          </g>
        )}
        <path d="M60 186 L112 186 L118 192 L86 198 L54 192 Z" fill="var(--text-2)" opacity="0.5" />
        {shown.map((p, i) => {
          const pt = zonePoint(p.plate_x, p.plate_z);
          if (!pt) return null;
          const cur = i === currentIdx;
          return (
            <g key={i} opacity={cur ? 1 : 0.6}>
              <circle
                cx={pt.x}
                cy={pt.y}
                r={r}
                fill={p.pitch_type ? getPitchColor(p.pitch_type) : "var(--muted)"}
                stroke={cur ? "#fff" : "none"}
                strokeWidth={compact ? 3 : 2.5}
              />
              <text
                x={pt.x}
                y={pt.y + (compact ? 6 : 5)}
                textAnchor="middle"
                fontFamily="var(--font-display), 'Barlow Condensed', sans-serif"
                fontWeight={700}
                fontSize={compact ? 18 : 14}
                fill="#070B14"
              >
                {i + 1}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
