"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { MixBar } from "@/components/pitch/MixBar";
import type { DirectoryRow } from "@/lib/pitchers/directory-shapes";
import { pitcherHeadshotUrl } from "@/lib/viz/headshot";

export interface StaffMember {
  id: number;
  name: string;
  href: string;
  hand: string | null;
  /** Null when the pitcher has no tracked pitches this season. */
  stats: DirectoryRow | null;
}

const INITIAL = 9;
const fmt1 = (n: number | null | undefined) => (n == null ? "—" : n.toFixed(1));
const fmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString());

export function StaffCards({ staff }: { staff: StaffMember[] }) {
  const [hand, setHand] = useState<"R" | "L" | null>(null);
  const [all, setAll] = useState(false);
  const filtered = staff.filter((p) => hand == null || p.hand === hand);
  const shown = all ? filtered : filtered.slice(0, INITIAL);

  return (
    <section aria-label="Pitching staff" className="flex flex-col gap-3">
      <div className="flex justify-between items-center gap-3 flex-wrap">
        <div role="group" aria-label="Throws" className="flex gap-1.5">
          {(
            [
              [null, "All pitchers"],
              ["R", "Right-handed"],
              ["L", "Left-handed"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={label}
              type="button"
              aria-pressed={hand === v}
              onClick={() => setHand(v)}
              className={`h-11 md:h-9 px-3.5 rounded-full border text-[13px] font-semibold ${
                hand === v ? "bg-ink text-bg border-ink" : "text-ink-2 border-line-strong hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="text-[13px] text-muted" aria-live="polite">
          {filtered.length} pitchers
        </span>
      </div>
      <ul className="list-none m-0 p-0 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {shown.map((p) => (
          <li key={p.id}>
            <Link
              href={p.href}
              className="h-full flex flex-col gap-3 px-[18px] py-4 bg-surface border border-line rounded-control text-ink hover:text-ink hover:border-line-strong transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="relative size-11 shrink-0 rounded-full bg-avatar overflow-hidden">
                  <Image src={pitcherHeadshotUrl(p.id, 88)} alt="" fill sizes="44px" className="object-cover" unoptimized />
                </span>
                <span className="grow min-w-0 flex flex-col">
                  <span className="font-display font-bold text-[22px] leading-[1.1] truncate">{p.name}</span>
                  <span className="text-xs text-muted">
                    {p.hand ? `${p.hand}HP` : "—"}
                    {p.stats ? ` · ${p.stats.pitches.toLocaleString()} pitches` : ""}
                  </span>
                </span>
                <span aria-hidden="true" className="size-[34px] shrink-0 rounded-full bg-accent flex items-center justify-center">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="#fff">
                    <path d="M7 4l13 8-13 8z" />
                  </svg>
                </span>
              </div>
              {p.stats ? (
                <>
                  <MixBar mix={p.stats.mix} />
                  <div className="grid grid-cols-4 gap-2">
                    <Mini k="K" v={fmtInt(p.stats.strikeouts)} />
                    <Mini k="Whiff/sw" v={fmt1(p.stats.whiffPerSwing)} />
                    <Mini k="FB mph" v={fmt1(p.stats.fbMph)} />
                    <Mini k="Spin" v={fmtInt(p.stats.fbSpin)} />
                  </div>
                </>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
      {!all && filtered.length > INITIAL ? (
        <button
          type="button"
          onClick={() => setAll(true)}
          className="self-center h-11 px-5 rounded-control border border-line-strong text-ink text-sm font-semibold hover:border-ink-2"
        >
          Show all {filtered.length} pitchers
        </button>
      ) : null}
    </section>
  );
}

function Mini({ k, v }: { k: string; v: string }) {
  return (
    <span className="flex flex-col">
      <span className="text-[10px] tracking-[1px] text-muted font-semibold uppercase">{k}</span>
      <span className="font-display font-bold text-xl num">{v}</span>
    </span>
  );
}
