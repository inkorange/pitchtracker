"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { ScoreBug } from "@/components/broadcast/ScoreBug";
import { eventLabel, eventTone } from "@/lib/at-bat/plate-appearances";
import { byPitchType, outcomeMix, seasonStrip, sideSplit, type SummaryPitch } from "@/lib/pitcher/stats-summary";
import type { MlbPitcherGameLine } from "@/lib/statsapi/client";
import { getPitchColor, getPitchLabel, OUTCOME_COLORS, OUTCOME_LABELS } from "@/lib/viz/colors";

// The redesigned top of the Stats view (design/Stats.dc.html,
// StatsMobile.dc.html): score bug + line, By pitch type, outcome mix,
// batter-side split, at-bat list. The deeper analytics cards follow
// below in PitcherStatsView.

export interface StatsAtBat {
  gamePk: number;
  atBat: number;
  date: string | null;
  inning: number | null;
  half: "Top" | "Bot" | null;
  batterId: number;
  batterName: string;
  sequence: string[];
  count: string;
  event: string | null;
}

export interface StatsGame {
  line: MlbPitcherGameLine;
  xbh: number;
  date: string;
  opponent: string | null;
  teamAbbr: string | null;
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const shortDate = (iso: string | null) => {
  if (!iso) return "";
  const [, m, d] = iso.split("-").map(Number);
  return m && d ? `${MONTHS[m - 1]} ${d}` : iso;
};
const f1 = (n: number | null) => (n == null ? "—" : n.toFixed(1));

function Card({ title, aside, children, className = "" }: { title: string; aside?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`bg-surface border border-line rounded-control overflow-hidden ${className}`}>
      <header className="flex justify-between items-center gap-3 px-[18px] py-3.5 bg-surface-2 border-b border-line">
        <h2 className="m-0 font-display font-bold text-[22px] uppercase leading-none">{title}</h2>
        {aside ? <span className="text-xs text-muted">{aside}</span> : null}
      </header>
      {children}
    </section>
  );
}

export function StatsSummary({
  pitches,
  game,
  atBats,
  season,
}: {
  pitches: SummaryPitch[];
  game: StatsGame | null;
  atBats: StatsAtBat[] | null;
  season: number;
}) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const types = useMemo(() => byPitchType(pitches), [pitches]);
  const mix = useMemo(() => outcomeMix(pitches), [pitches]);
  const sides = useMemo(() => sideSplit(pitches), [pitches]);
  // Season line: regular season only, matching the rail and homepage
  // leaderboards. Everything else (tables, splits, at-bats) keeps
  // postseason pitches in scope.
  const strip = useMemo(() => seasonStrip(pitches.filter((p) => (p.game_type ?? "R") === "R")), [pitches]);

  const line: [string, string][] = game
    ? [
        ["IP", game.line.inningsPitched],
        ["K", String(game.line.strikeouts)],
        ["BB", String(game.line.baseOnBalls)],
        ["H", String(game.line.hits)],
        ["HR", String(game.line.homeRuns)],
        ["XBH", String(game.xbh)],
        ["ER", String(game.line.earnedRuns)],
        ["BF", String(game.line.battersFaced)],
        ["Pitches", String(game.line.numberOfPitches)],
        ["Strikes", String(game.line.strikes)],
        ["Balls", String(game.line.numberOfPitches - game.line.strikes)],
        ["Str %", game.line.numberOfPitches ? ((game.line.strikes / game.line.numberOfPitches) * 100).toFixed(1) : "—"],
      ]
    : [
        ["Pitches", strip.pitches.toLocaleString()],
        ["BF", String(strip.bf)],
        ["K", String(strip.k)],
        ["BB", String(strip.bb)],
        ["H", String(strip.h)],
        ["HR", String(strip.hr)],
        ["Strike %", f1(strip.strikePct)],
        ["Whiff %", f1(strip.whiffPct)],
        ["CSW %", f1(strip.cswPct)],
      ];

  // At-bat replay link: in-page at-bat mode on this pitcher page.
  const atBatHref = (ab: StatsAtBat) => {
    const q = new URLSearchParams(sp.toString());
    q.delete("view");
    q.set("vsBatter", String(ab.batterId));
    q.set("abGame", String(ab.gamePk));
    q.set("abNum", String(ab.atBat));
    return `${pathname}?${q}`;
  };

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <ScoreBug
        size="md"
        className="self-start flex-wrap"
        segments={[
          ...(game?.teamAbbr ? [{ tone: "team" as const, content: game.teamAbbr }] : []),
          game
            ? { tone: "name" as const, content: game.opponent ? `vs ${game.opponent}` : "Game" }
            : { tone: "name" as const, content: `${season} regular season` },
          ...(game ? [{ tone: "tag" as const, content: shortDate(game.date) }] : []),
          ...(game ? [{ tone: "plain" as const, content: game.line.decision }] : []),
        ]}
      />

      <section
        aria-label={game ? "Game line" : "Season line"}
        className={`grid grid-cols-4 ${game ? "lg:grid-cols-12" : "lg:grid-cols-9"} bg-surface border border-line border-t-[3px] border-t-accent rounded-control`}
      >
        {line.map(([k, v]) => (
          <div key={k} className="px-3 py-3 lg:py-3.5 border-r border-b lg:border-b-0 border-line flex flex-col gap-0.5 min-w-0">
            <span className="label-caps truncate">{k}</span>
            <span className="font-display font-bold text-[26px] lg:text-[30px] leading-none num">{v}</span>
          </div>
        ))}
      </section>

      <Card title="By pitch type" className="min-w-0">
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-right label-caps">
                  <th scope="col" className="text-left px-[18px] py-2.5 font-semibold">Pitch</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">#</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Usage</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Avg mph</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Max</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Spin</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Strike %</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Whiffs</th>
                  <th scope="col" className="px-[18px] py-2.5 font-semibold">CSW %</th>
                </tr>
              </thead>
              <tbody>
                {types.map((t) => (
                  <tr key={t.type} className="border-t border-line text-right num">
                    <th scope="row" className="text-left px-[18px] py-3 font-semibold whitespace-nowrap">
                      <span className="flex items-center gap-2.5">
                        <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: getPitchColor(t.type) }} />
                        {getPitchLabel(t.type)}
                      </span>
                    </th>
                    <td className="px-3 py-3">{t.n.toLocaleString()}</td>
                    <td className="px-3 py-3">
                      <span className="flex items-center justify-end gap-2">
                        <span aria-hidden="true" className="w-[60px] h-1 bg-line rounded-sm block">
                          <span className="block h-1 rounded-sm" style={{ width: `${Math.max(t.usage, 1)}%`, background: getPitchColor(t.type) }} />
                        </span>
                        {t.usage.toFixed(0)}%
                      </span>
                    </td>
                    <td className="px-3 py-3 font-display font-bold text-lg">{f1(t.mph)}</td>
                    <td className="px-3 py-3 text-ink-2">{f1(t.max)}</td>
                    <td className="px-3 py-3 text-ink-2">{t.spin?.toLocaleString() ?? "—"}</td>
                    <td className="px-3 py-3">{f1(t.strikePct)}</td>
                    <td className="px-3 py-3">{t.whiffs}</td>
                    <td className="px-[18px] py-3">{f1(t.cswPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile: one card per pitch type */}
          <ul className="md:hidden list-none m-0 p-3 flex flex-col gap-2">
            {types.map((t) => (
              <li key={t.type} className="p-3 rounded-control bg-bg border border-line border-l-4" style={{ borderLeftColor: getPitchColor(t.type) }}>
                <div className="flex justify-between items-baseline mb-2">
                  <span className="font-semibold">{getPitchLabel(t.type)}</span>
                  <span className="text-xs text-muted num">
                    {t.n.toLocaleString()} · {t.usage.toFixed(0)}%
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2 num">
                  {(
                    [
                      ["Mph", f1(t.mph)],
                      ["Spin", t.spin?.toLocaleString() ?? "—"],
                      ["Strike%", f1(t.strikePct)],
                      ["CSW%", f1(t.cswPct)],
                    ] as const
                  ).map(([k, v]) => (
                    <span key={k} className="flex flex-col">
                      <span className="text-[10px] tracking-[1px] text-muted font-semibold uppercase">{k}</span>
                      <span className="font-display font-bold text-lg">{v}</span>
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-5 items-start">
          <Card title="Pitch outcomes">
            <div className="p-4 flex flex-col gap-3">
              <div
                role="img"
                aria-label={`Outcome mix: ${mix.map((o) => `${OUTCOME_LABELS[o.cat]} ${o.pct.toFixed(0)}%`).join(", ")}`}
                className="flex h-3.5 rounded-[3px] overflow-hidden bg-line"
              >
                {mix.map((o) => (
                  <span key={o.cat} style={{ width: `${o.pct}%`, background: OUTCOME_COLORS[o.cat] }} />
                ))}
              </div>
              <ul className="list-none m-0 p-0 flex flex-col gap-1.5">
                {mix.map((o) => (
                  <li key={o.cat} className="flex items-center gap-2 text-sm">
                    <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: OUTCOME_COLORS[o.cat] }} />
                    <span className="grow">{OUTCOME_LABELS[o.cat]}</span>
                    <span className="font-display font-bold text-lg num">{o.n.toLocaleString()}</span>
                    <span className="w-12 text-right text-xs text-muted num">{o.pct.toFixed(1)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
          <Card title="Split by batter">
            <div className="p-4 grid grid-cols-2 gap-2.5">
              {sides.map((s) => (
                <div key={s.side} className="border border-line rounded-control px-3 py-2.5">
                  <span className="label-caps">vs {s.side}HB · BF</span>
                  <div className="font-display font-bold text-[28px] leading-tight num">{s.bf}</div>
                  <div className="text-xs text-ink-2 num">
                    {s.k} K · {s.bb} BB · {s.h} H
                  </div>
                  <div className="text-xs text-muted num">Whiff {f1(s.whiffPct)}%</div>
                </div>
              ))}
            </div>
          </Card>
        </div>

      {atBats && atBats.length > 0 ? (
        <Card title="At-bats" aside={`${atBats.length} plate appearances`}>
          <ol className="list-none m-0 p-0">
            {atBats.map((ab) => {
              const tone = eventTone(ab.event);
              return (
                <li key={`${ab.gamePk}-${ab.atBat}`} className="border-t border-line first:border-t-0">
                  <Link
                    href={atBatHref(ab)}
                    className="grid grid-cols-[48px_minmax(0,1fr)_auto_40px] md:grid-cols-[56px_minmax(0,180px)_minmax(0,1fr)_140px_44px] items-center gap-3 px-[18px] min-h-14 py-2 text-sm text-ink hover:text-ink hover:bg-surface-2/60"
                  >
                    <span className="text-muted num">
                      {ab.half === "Bot" ? "B" : "T"}
                      {ab.inning}
                    </span>
                    <span className="font-semibold truncate">{ab.batterName}</span>
                    <span
                      className="hidden md:flex gap-1 items-center"
                      role="img"
                      aria-label={`${ab.sequence.length} pitches: ${ab.sequence.map(getPitchLabel).join(", ")}; count ${ab.count}`}
                    >
                      {ab.sequence.map((t, i) => (
                        <span key={i} className="size-2.5 rounded-full" style={{ background: getPitchColor(t) }} />
                      ))}
                      <span className="ml-2 text-xs text-muted num">{ab.count}</span>
                    </span>
                    <span className={`font-display font-bold text-base ${tone === "batter" ? "text-highlight" : tone === "pitcher" ? "text-ink" : "text-ink-2"}`}>
                      {ab.event ? eventLabel(ab.event) : "Unfinished"}
                    </span>
                    <span aria-hidden="true" className="justify-self-end size-9 rounded-full bg-accent flex items-center justify-center">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="#fff">
                        <path d="M7 4l13 8-13 8z" />
                      </svg>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </Card>
      ) : null}
    </div>
  );
}
