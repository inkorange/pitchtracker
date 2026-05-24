import type { MlbPitcherGameLine } from "@/lib/statsapi/client";

// Compact stat-line panel shown on the pitcher card when ?game=N is
// active. Renders the official boxscore figures (IP, ER, K, BB, H,
// HR, # pitches, # strikes, strike %, decision) plus the XBH count
// we derive from our cached pitch data.

interface Props {
  line: MlbPitcherGameLine;
  xbh: number;
  gameDate: string | null;
  opponentName: string | null;
}

const DECISION_STYLE: Record<MlbPitcherGameLine["decision"], string> = {
  W: "bg-emerald-500/20 border-emerald-400/60 text-emerald-100",
  L: "bg-red-500/20 border-red-400/60 text-red-100",
  S: "bg-amber-500/20 border-amber-400/60 text-amber-100",
  H: "bg-sky-500/20 border-sky-400/60 text-sky-100",
  ND: "bg-white/[0.06] border-white/15 text-white/70",
};

function strikePct(line: MlbPitcherGameLine): string {
  if (line.numberOfPitches <= 0) return "—";
  return `${Math.round((line.strikes / line.numberOfPitches) * 100)}%`;
}

export function PitcherGameStats({ line, xbh, gameDate, opponentName }: Props) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] uppercase tracking-[0.14em] text-white/45">
          Game line{gameDate ? ` · ${gameDate}` : ""}
          {opponentName ? ` vs ${opponentName}` : ""}
        </div>
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase tracking-[0.1em] ${DECISION_STYLE[line.decision]}`}
          title={line.noteRaw ?? line.decision}
        >
          {line.decision === "ND" ? "N/D" : line.decision}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-x-2 gap-y-1.5 text-[11px] tabular-nums">
        <Stat label="IP" value={line.inningsPitched} />
        <Stat label="K" value={line.strikeouts} />
        <Stat label="BB" value={line.baseOnBalls} />
        <Stat label="H" value={line.hits} />

        <Stat label="HR" value={line.homeRuns} />
        <Stat label="XBH" value={xbh} />
        <Stat label="ER" value={line.earnedRuns} />
        <Stat label="BF" value={line.battersFaced} />

        <Stat label="Pitches" value={line.numberOfPitches} />
        <Stat label="Strikes" value={line.strikes} />
        <Stat label="Balls" value={line.numberOfPitches - line.strikes} />
        <Stat label="Strike %" value={strikePct(line)} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded bg-white/[0.04] border border-white/[0.06] px-2 py-1">
      <div className="text-[9px] uppercase tracking-[0.12em] text-white/45">
        {label}
      </div>
      <div className="text-white/90 font-medium">{value}</div>
    </div>
  );
}
