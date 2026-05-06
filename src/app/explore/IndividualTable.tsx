"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { SavantPitchRow } from "@/lib/savant/client";
import { getPitchColor, getPitchLabel } from "@/lib/viz/colors";

interface IndividualTableProps {
  rows: SavantPitchRow[];
}

type SortKey =
  | "date"
  | "pitchType"
  | "velocity"
  | "spin"
  | "horizBreak"
  | "vertBreak";

interface SortState {
  key: SortKey;
  direction: "asc" | "desc";
}

// Cap the rendered rows. Render-all on a 5,000-row result drops dev
// frame rate to a crawl; 250 is plenty to scan and trigger drill-in,
// and the user can always re-sort to surface other ends of the
// distribution.
const RENDER_CAP = 250;

// Compact, sortable table over the matched pitch rows. Each row is a
// link to /at-bat/[gamePk]/[atBatNumber]?pitch=N so the user can jump
// from the discovery view straight into the trajectory replay.
export function IndividualTable({ rows }: IndividualTableProps) {
  const [sort, setSort] = useState<SortState>({
    key: "velocity",
    direction: "desc",
  });

  const sorted = useMemo(() => {
    const copy = [...rows];
    const { key, direction } = sort;
    const factor = direction === "asc" ? 1 : -1;
    copy.sort((a, b) => {
      const av = sortValue(a, key);
      const bv = sortValue(b, key);
      // Push nulls to the end regardless of direction so they don't
      // dominate the visible top.
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (typeof av === "string" && typeof bv === "string") {
        return av.localeCompare(bv) * factor;
      }
      return ((av as number) - (bv as number)) * factor;
    });
    return copy;
  }, [rows, sort]);

  const visible = sorted.slice(0, RENDER_CAP);

  function setOrToggle(key: SortKey) {
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "desc" },
    );
  }

  return (
    <div className="rounded-lg bg-[#081a32]/80 backdrop-blur-md border border-white/10 shadow-lg overflow-hidden">
      {rows.length > RENDER_CAP ? (
        <div className="px-4 py-2 text-[11px] text-white/55 border-b border-white/[0.08]">
          Showing the first {RENDER_CAP.toLocaleString()} of{" "}
          {rows.length.toLocaleString()} matched pitches. Sort to surface
          other ends of the distribution.
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] tabular-nums">
          <thead>
            <tr className="text-left text-white/55 uppercase tracking-[0.12em] text-[10px]">
              <Th onClick={() => setOrToggle("date")} active={sort.key === "date"} dir={sort.direction}>
                Date
              </Th>
              <Th onClick={() => setOrToggle("pitchType")} active={sort.key === "pitchType"} dir={sort.direction}>
                Pitch
              </Th>
              <Th onClick={() => setOrToggle("velocity")} active={sort.key === "velocity"} dir={sort.direction} numeric>
                Velo
              </Th>
              <Th onClick={() => setOrToggle("spin")} active={sort.key === "spin"} dir={sort.direction} numeric>
                Spin
              </Th>
              <Th onClick={() => setOrToggle("horizBreak")} active={sort.key === "horizBreak"} dir={sort.direction} numeric>
                HB
              </Th>
              <Th onClick={() => setOrToggle("vertBreak")} active={sort.key === "vertBreak"} dir={sort.direction} numeric>
                iVB
              </Th>
              <th className="px-3 py-2">Count</th>
              <th className="px-3 py-2">Outcome</th>
              <th className="px-3 py-2 sr-only">Open replay</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((p, i) => {
              const color = getPitchColor(p.pitch_type ?? "UN");
              const replayHref = `/at-bat/${p.game_pk}/${p.at_bat_number}?pitch=${p.pitch_number}`;
              return (
                <tr
                  // game_pk + at_bat_number + pitch_number isn't always
                  // unique across the 5k cap (rare repeats from join
                  // shapes), so the index keeps keys stable.
                  key={`${p.game_pk}-${p.at_bat_number}-${p.pitch_number}-${i}`}
                  className="border-t border-white/[0.04] hover:bg-white/[0.04] transition-colors"
                >
                  <td className="px-3 py-1.5 text-white/65 whitespace-nowrap">
                    {p.game_date ?? "—"}
                  </td>
                  <td className="px-3 py-1.5">
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ background: color }}
                        aria-hidden
                      />
                      <span className="text-white/95">
                        {p.pitch_type
                          ? getPitchLabel(p.pitch_type)
                          : "Unknown"}
                      </span>
                    </span>
                  </td>
                  <Td>{fmt1(p.release_speed)}</Td>
                  <Td>{fmt0(p.release_spin_rate)}</Td>
                  <Td>{fmtBreak(p.pfx_x)}</Td>
                  <Td>{fmtBreak(p.pfx_z)}</Td>
                  <td className="px-3 py-1.5 text-white/85 whitespace-nowrap">
                    {p.balls ?? 0}-{p.strikes ?? 0}
                  </td>
                  <td className="px-3 py-1.5 text-white/85 whitespace-nowrap max-w-[14rem] truncate">
                    {labelOutcome(p.events ?? p.description ?? null)}
                  </td>
                  <td className="px-3 py-1.5">
                    <Link
                      href={replayHref}
                      className="text-[10px] uppercase tracking-[0.14em] text-white/55 hover:text-white"
                    >
                      Replay →
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({
  children,
  onClick,
  active,
  dir,
  numeric,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  dir: "asc" | "desc";
  numeric?: boolean;
}) {
  return (
    <th className="px-3 py-2">
      <button
        type="button"
        onClick={onClick}
        className={`flex items-center gap-1 ${numeric ? "ml-auto" : ""} ${
          active ? "text-white/85" : "text-white/55 hover:text-white/85"
        } transition-colors`}
      >
        <span>{children}</span>
        {active ? (
          <span aria-hidden>{dir === "asc" ? "↑" : "↓"}</span>
        ) : null}
      </button>
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td className="px-3 py-1.5 text-white/85 text-right whitespace-nowrap">
      {children}
    </td>
  );
}

function sortValue(p: SavantPitchRow, key: SortKey): number | string | null {
  switch (key) {
    case "date":
      return p.game_date ?? null;
    case "pitchType":
      return p.pitch_type ?? null;
    case "velocity":
      return typeof p.release_speed === "number" ? p.release_speed : null;
    case "spin":
      return typeof p.release_spin_rate === "number"
        ? p.release_spin_rate
        : null;
    case "horizBreak":
      return typeof p.pfx_x === "number" ? p.pfx_x : null;
    case "vertBreak":
      return typeof p.pfx_z === "number" ? p.pfx_z : null;
  }
}

function fmt1(n: number | null | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return n.toFixed(1);
}

function fmt0(n: number | null | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString();
}

function fmtBreak(pfx: number | null | undefined): string {
  if (typeof pfx !== "number" || !Number.isFinite(pfx)) return "—";
  const inches = pfx * 12;
  const sign = inches >= 0 ? "+" : "";
  return `${sign}${inches.toFixed(1)}"`;
}

// Quick humanization — full Statcast labels live in
// /at-bat metadata, but here we just want a readable cell.
function labelOutcome(raw: string | null): string {
  if (!raw) return "—";
  return raw
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
