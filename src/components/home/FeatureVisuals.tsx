import type { ArsenalBar, FeaturedAtBat, SlimPitch } from "@/lib/home/feature-shapes";
import { TUNNEL_VIEW, type TunnelDiagram } from "@/lib/home/tunnel";
import { getPitchColor, getPitchLabel } from "@/lib/viz/colors";
import { LazyMiniScene } from "./LazyMiniScene";
import { PlateDotsPoster } from "./PlateDotsPoster";

// The four feature-card visuals (design/FeatureExpand.dc.html). Each
// is the same element idle and open; `open` only reveals extras.

const FADE = "motion-safe:animate-[pt-fade_.35s_ease_.18s_both]";

export function SceneVisual({ pitches, open }: { pitches: SlimPitch[]; open: boolean }) {
  return (
    <>
      {/* R3F mounts only for the open card; idle shows the poster. */}
      {open ? (
        <LazyMiniScene pitches={pitches} fallback={<PlateDotsPoster pitches={pitches} />} />
      ) : (
        <PlateDotsPoster pitches={pitches} />
      )}
      {open ? (
        <div
          aria-hidden="true"
          className={`absolute left-3 bottom-3 flex bg-overlay rounded-control p-[3px] font-display font-bold text-sm tracking-[1px] ${FADE}`}
        >
          <span className="px-2.5 py-1 bg-ink text-bg rounded-[2px]">FRONT</span>
          <span className="px-2.5 py-1 text-ink-2">BACK</span>
          <span className="px-2.5 py-1 text-ink-2">TOP</span>
          <span className="px-2.5 py-1 text-ink-2">SIDE</span>
        </div>
      ) : null}
    </>
  );
}

export function TunnelVisual({ diagram, pitcherShort }: { diagram: TunnelDiagram; pitcherShort: string }) {
  const names = diagram.lines.map((l) => getPitchLabel(l.pitchType)).join(", ");
  return (
    <div className="absolute inset-4 flex flex-col gap-2">
      <svg
        role="img"
        aria-label={`${pitcherShort}'s average ${names} paths, side view: they share a lane out of the hand, then split after the decision point`}
        viewBox={`0 0 ${TUNNEL_VIEW.w} ${TUNNEL_VIEW.h}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full grow min-h-0"
      >
        <line
          x1={diagram.decisionX}
          y1={20}
          x2={diagram.decisionX}
          y2={230}
          stroke="var(--highlight)"
          strokeWidth={2}
          strokeDasharray="5 5"
        />
        <text x={diagram.decisionX + 8} y={36} fill="var(--highlight)" fontSize={15} fontWeight={600}>
          DECISION POINT
        </text>
        {diagram.lines.map((l) => (
          <path
            key={l.pitchType}
            d={l.d}
            pathLength={100}
            stroke={getPitchColor(l.pitchType)}
            strokeWidth={5}
            fill="none"
            strokeLinecap="round"
            className="pt-draw"
          />
        ))}
        <circle cx={diagram.release.x} cy={diagram.release.y} r={9} fill="var(--text)" />
        <rect
          x={diagram.plate.x - 7}
          y={diagram.plate.top}
          width={14}
          height={diagram.plate.bottom - diagram.plate.top}
          fill="none"
          stroke="var(--text-2)"
        />
      </svg>
      <div className="flex gap-4 flex-wrap text-xs text-ink-2" aria-hidden="true">
        {diagram.lines.map((l) => (
          <span key={l.pitchType} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ background: getPitchColor(l.pitchType) }} />
            {getPitchLabel(l.pitchType)}
          </span>
        ))}
      </div>
    </div>
  );
}

export function ArsenalVisual({ arsenal, open }: { arsenal: ArsenalBar[]; open: boolean }) {
  return (
    <ul className="absolute inset-0 list-none m-0 px-[18px] py-4 flex flex-col justify-center gap-1.5">
      {arsenal.slice(0, 6).map((p) => (
        <li key={p.type} className="flex items-center gap-2.5 h-[30px]">
          <span className="size-3 rounded-full shrink-0" style={{ background: p.color }} aria-hidden="true" />
          <span className="w-[86px] shrink-0 text-[13px] font-semibold whitespace-nowrap truncate">{p.label}</span>
          <span className="grow min-w-5 h-1.5 bg-line rounded-[3px] block" aria-hidden="true">
            <span
              className="block h-1.5 rounded-[3px]"
              style={{ background: p.color, width: `${Math.max(p.pct, 1)}%` }}
            />
          </span>
          {open ? (
            <>
              <span className={`font-display font-bold text-lg w-12 text-right num ${FADE}`}>{p.mph}</span>
              <span className={`text-xs text-muted w-[72px] text-right num ${FADE}`}>
                {p.pct}% · {p.count.toLocaleString()}
              </span>
            </>
          ) : (
            <span className="sr-only">
              {p.pct}% usage, {p.mph} mph
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

// Zone box: ±0.83 ft wide, 1.6–3.4 ft tall, drawn in a 172×200 view.
const ZX = (x: number) => 86 + (x / 0.83) * 50;
const ZY = (z: number) => 160 - ((z - 1.6) / 1.8) * 130;

export function AtBatVisual({ atBat, open }: { atBat: FeaturedAtBat; open: boolean }) {
  const pts = atBat.pitches.slice(0, 8);
  return (
    <div className="absolute inset-0 px-[18px] py-3.5 flex items-center justify-center gap-6">
      <svg
        role="img"
        aria-label={`Strike zone with ${pts.length} numbered pitch locations, ${atBat.pitcherShort} vs ${atBat.batterShort}`}
        viewBox="0 0 172 200"
        className="h-[200px] md:h-[220px] w-[170px] md:w-[190px] shrink-0"
      >
        <rect x={36} y={30} width={100} height={130} fill="none" stroke="var(--text-2)" strokeWidth={1.5} />
        {pts.map((p) =>
          p.plateX == null || p.plateZ == null ? null : (
            <g key={p.n} className="pt-pop">
              <circle
                cx={Math.min(166, Math.max(6, ZX(p.plateX)))}
                cy={Math.min(194, Math.max(6, ZY(p.plateZ)))}
                r={11}
                fill={p.color}
              />
              <text
                x={Math.min(166, Math.max(6, ZX(p.plateX)))}
                y={Math.min(194, Math.max(6, ZY(p.plateZ))) + 5}
                textAnchor="middle"
                fontWeight={700}
                fontSize={14}
                fill="var(--bg)"
                className="font-display"
              >
                {p.n}
              </text>
            </g>
          ),
        )}
      </svg>
      {open ? (
        <div className={`grow max-w-[240px] flex flex-col gap-1.5 ${FADE}`}>
          <span className="label-caps truncate">
            vs {atBat.batterShort}
            {atBat.date ? ` · ${atBat.date}` : ""}
          </span>
          <ol className="list-none m-0 p-0 flex flex-col gap-1.5">
            {pts.map((p) => (
              <li key={p.n} className="flex items-center gap-2.5 text-[13px]">
                <span
                  className="size-[22px] rounded-full flex items-center justify-center font-display font-bold text-[13px] text-bg shrink-0"
                  style={{ background: p.color }}
                >
                  {p.n}
                </span>
                <span className="grow truncate">{p.label}</span>
                <span className="font-display font-bold text-[17px] num">{p.mph}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
