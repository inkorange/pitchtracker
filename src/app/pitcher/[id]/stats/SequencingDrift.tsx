"use client";

import { useMemo, useState } from "react";
import type { SequencingDrift as SequencingDriftData } from "@/lib/pitch/sequencingDrift";
import { StatCard } from "./StatCard";

// Per-game sequence drift timeline. One dot per qualifying game,
// plotted chronologically; y-axis is total-variation distance from
// the season-baseline sequencing matrix (0 = same as season,
// higher = he called a meaningfully different game). Spike dots are
// the user's signal to dig into that start.
//
// Why a single chart instead of small-multiples-of-matrices: 30+
// starts compresses well into one timeline, but a grid of 30 mini
// matrices is unreadable at any reasonable card width. Small
// multiples remain a viable follow-up (?seqView=multiples) for
// users zoomed in on a short window.

interface SequencingDriftProps {
  data: SequencingDriftData | null;
  /** When the batter scope is active the parent should skip
   *  rendering this card entirely (per-(pitcher × batter × game)
   *  samples are too small for the metric). We still accept the
   *  prop so the empty/scoped path renders a useful message rather
   *  than nothing. */
  batterScoped?: boolean;
}

export function SequencingDrift({ data, batterScoped }: SequencingDriftProps) {
  // Drop noisy partial-game appearances so the spike signal stays
  // meaningful — small samples produce wild drift values. Memo runs
  // unconditionally (rules-of-hooks); the early returns below decide
  // whether the result actually gets used.
  const qualified = useMemo(
    () =>
      data
        ? data.games.filter(
            (g) =>
              g.pitchCount >= data.minPitchesPerGame &&
              g.transitionCount >= data.minTransitionsPerGame,
          )
        : [],
    [data],
  );

  const help = (
    <>
      <p>
        Did he change his approach today? For each qualifying game,
        we compare that start&apos;s sequencing pattern to the season
        baseline and plot the difference as one dot on the timeline.
      </p>
      <p>
        Metric is <strong>Total Variation Distance</strong> between
        the game&apos;s and season&apos;s sequencing matrices (first-pitch
        distribution + conditional after-pitch matrix), weighted by
        per-row sample size. <strong>0% = same as season</strong>;
        higher = more departure. Dot size and color scale with the
        drift so spike games stand out.
      </p>
      <p>
        Games with fewer than {data?.minPitchesPerGame ?? 20} pitches
        or {data?.minTransitionsPerGame ?? 10} consecutive-pitch
        pairs are excluded — small samples produce noisy spikes
        that aren&apos;t meaningful signal.
      </p>
    </>
  );

  if (batterScoped) {
    return (
      <StatCard title="Sequencing drift" help={help}>
        <div className="text-[11px] text-white/55 italic">
          Drift comparison isn&apos;t computed when a specific batter is
          selected — per-game samples vs one hitter are too small to
          measure approach shifts reliably.
        </div>
      </StatCard>
    );
  }

  if (!data || data.games.length === 0) {
    return (
      <StatCard title="Sequencing drift" help={help}>
        <div className="text-[11px] text-white/55 italic">
          Not enough games to plot per-game drift yet.
        </div>
      </StatCard>
    );
  }

  if (qualified.length < 2) {
    return (
      <StatCard
        title="Sequencing drift"
        hint={`Need ≥${data.minPitchesPerGame} pitches per game`}
        help={help}
      >
        <div className="text-[11px] text-white/55 italic">
          Only {qualified.length} game{qualified.length === 1 ? "" : "s"} meet
          the sample threshold so far — the drift series populates as
          more starts accumulate.
        </div>
      </StatCard>
    );
  }

  return (
    <StatCard
      title="Sequencing drift"
      hint={`${qualified.length} games · per-game vs season baseline`}
      help={help}
    >
      <DriftPlot games={qualified} />
    </StatCard>
  );
}

// Plot internals ----------------------------------------------------

const PAD_LEFT = 36; // room for y-axis tick labels
const PAD_RIGHT = 12;
const PAD_TOP = 14;
const PAD_BOTTOM = 28; // room for date ticks
const HEIGHT = 200;

interface DriftPlotProps {
  games: SequencingDriftData["games"];
}

function DriftPlot({ games }: DriftPlotProps) {
  const [hover, setHover] = useState<number | null>(null);

  // Y range: cap at a friendly upper bound but expand if any point
  // exceeds it so spike outliers stay visible.
  const yMax = Math.max(0.5, ...games.map((g) => g.drift)) + 0.05;

  // X positions evenly spaced — game count, not calendar time. The
  // tick labels still show dates so the reader knows when each
  // game was; even spacing keeps adjacent dots from collapsing
  // when starts cluster.
  const xFor = (i: number, width: number) => {
    const inner = width - PAD_LEFT - PAD_RIGHT;
    if (games.length === 1) return PAD_LEFT + inner / 2;
    return PAD_LEFT + (inner * i) / (games.length - 1);
  };

  const yFor = (drift: number) => {
    const inner = HEIGHT - PAD_TOP - PAD_BOTTOM;
    return PAD_TOP + inner * (1 - drift / yMax);
  };

  // The chart sizes by container width — we render with a stable
  // viewBox and let CSS scale the SVG. 720 viewBox width plays
  // well at sidebar / desktop / mobile breakpoints.
  const VIEW_WIDTH = 720;

  // Tick marks: at most 6 evenly spaced date labels so the axis
  // doesn't collide with itself on dense seasons.
  const tickCount = Math.min(6, games.length);
  const tickIndices =
    tickCount <= 1
      ? [0]
      : Array.from({ length: tickCount }, (_, k) =>
          Math.round(((games.length - 1) * k) / (tickCount - 1)),
        );

  // Polyline trace under the dots — a faint thread connecting the
  // points helps the eye read drift movement game-to-game.
  const polyline = games
    .map((g, i) => `${xFor(i, VIEW_WIDTH).toFixed(1)},${yFor(g.drift).toFixed(1)}`)
    .join(" ");

  const yTicks = [0, 0.25, 0.5, 0.75].filter((t) => t <= yMax);

  return (
    <div className="space-y-2">
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${HEIGHT}`}
        width="100%"
        className="block"
        role="img"
        aria-label="Per-game sequence drift timeline"
      >
        {/* y-axis grid + tick labels */}
        {yTicks.map((t) => (
          <g key={`yt-${t}`}>
            <line
              x1={PAD_LEFT}
              y1={yFor(t)}
              x2={VIEW_WIDTH - PAD_RIGHT}
              y2={yFor(t)}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth={1}
            />
            <text
              x={PAD_LEFT - 6}
              y={yFor(t) + 3}
              fill="rgba(255,255,255,0.45)"
              fontSize={9}
              textAnchor="end"
            >
              {Math.round(t * 100)}%
            </text>
          </g>
        ))}

        {/* season baseline (0% drift) reference line — emphasized */}
        <line
          x1={PAD_LEFT}
          y1={yFor(0)}
          x2={VIEW_WIDTH - PAD_RIGHT}
          y2={yFor(0)}
          stroke="rgba(255,255,255,0.18)"
          strokeWidth={1}
        />

        <polyline
          points={polyline}
          fill="none"
          stroke="rgba(255,255,255,0.25)"
          strokeWidth={1}
        />

        {games.map((g, i) => {
          const cx = xFor(i, VIEW_WIDTH);
          const cy = yFor(g.drift);
          const isHovered = hover === i;
          // Bigger dot for higher drift so spike games visually
          // pop out of the chart even at a glance.
          const r = 3 + g.drift * 4;
          return (
            <g key={g.game_pk}>
              <circle
                cx={cx}
                cy={cy}
                r={isHovered ? r + 1.5 : r}
                fill={driftColor(g.drift)}
                stroke="rgba(0,0,0,0.4)"
                strokeWidth={0.5}
              />
              {/* Invisible hover target — larger than the visual dot
                  so touch / fat-cursor users can hit it. */}
              <circle
                cx={cx}
                cy={cy}
                r={12}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                tabIndex={0}
                role="button"
                aria-label={`Game ${g.game_date}, drift ${Math.round(g.drift * 100)}%`}
                style={{ outline: "none", cursor: "pointer" }}
              />
            </g>
          );
        })}

        {/* x-axis: faint baseline + date tick labels */}
        <line
          x1={PAD_LEFT}
          y1={HEIGHT - PAD_BOTTOM}
          x2={VIEW_WIDTH - PAD_RIGHT}
          y2={HEIGHT - PAD_BOTTOM}
          stroke="rgba(255,255,255,0.12)"
          strokeWidth={1}
        />
        {tickIndices.map((i) => (
          <text
            key={`xt-${i}`}
            x={xFor(i, VIEW_WIDTH)}
            y={HEIGHT - PAD_BOTTOM + 14}
            fill="rgba(255,255,255,0.45)"
            fontSize={9}
            textAnchor={
              i === 0
                ? "start"
                : i === games.length - 1
                  ? "end"
                  : "middle"
            }
          >
            {shortDate(games[i].game_date)}
          </text>
        ))}
      </svg>

      {/* Hover details panel — locked-in row beneath the chart so
          mobile users can tap a dot and see the same info desktop
          users get on hover. Sticks to the last hovered game until
          the user picks another. */}
      <HoverDetail
        game={hover != null ? games[hover] : null}
        fallback={games[games.length - 1]}
      />
    </div>
  );
}

function HoverDetail({
  game,
  fallback,
}: {
  game: SequencingDriftData["games"][number] | null;
  fallback: SequencingDriftData["games"][number];
}) {
  const g = game ?? fallback;
  const focused = game != null;
  return (
    <div
      className={`text-[11px] tabular-nums flex items-center gap-3 px-2 py-1.5 rounded border ${
        focused
          ? "border-white/15 bg-white/[0.04]"
          : "border-white/[0.06] bg-white/[0.02]"
      }`}
    >
      <span className="text-white/55 uppercase tracking-[0.14em] text-[9px]">
        {focused ? "Game" : "Latest"}
      </span>
      <span className="text-white/95">{g.game_date}</span>
      <span className="text-white/30">·</span>
      <span className="text-white/85">
        {g.atBatCount} AB · {g.pitchCount} pitches
      </span>
      <span className="text-white/30">·</span>
      <span
        className="font-medium"
        style={{ color: driftColor(g.drift) }}
      >
        {Math.round(g.drift * 100)}% drift
      </span>
    </div>
  );
}

// 0% drift → cool teal (season-baseline), 50%+ → red-orange (clear
// departure). Continuous interpolation so the eye reads "more
// different" as "warmer".
function driftColor(drift: number): string {
  const t = Math.max(0, Math.min(1, drift / 0.5));
  // teal #4cd2cc → orange #f97316
  const lerp = (a: number, b: number) => Math.round(a + (b - a) * t);
  return `rgb(${lerp(76, 249)}, ${lerp(210, 115)}, ${lerp(204, 22)})`;
}

function shortDate(iso: string): string {
  // 2026-04-27 → "Apr 27"
  const [, m, d] = iso.split("-");
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const mi = Number(m);
  if (!Number.isFinite(mi) || mi < 1 || mi > 12 || !d) return iso;
  return `${monthNames[mi - 1]} ${Number(d)}`;
}
