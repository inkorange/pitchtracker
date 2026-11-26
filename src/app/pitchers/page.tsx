import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteHeader } from "@/components/chrome/SiteHeader";
import { EyebrowTag } from "@/components/broadcast";
import { getCachedTeamMap } from "@/lib/pitcher/cached-reads";
import { getPitcherDirectory, toWire } from "@/lib/pitchers/directory";
import { PitchersBrowser } from "./PitchersBrowser";

export const metadata: Metadata = {
  title: "All MLB pitchers — sort by strikeouts, velocity, spin & whiff rate",
  description:
    "Every MLB pitcher with tracked pitches: sort the league by strikeouts, fastball velocity, spin and whiff rate, or find every pitcher who throws a given pitch at a given speed.",
  alternates: { canonical: "/pitchers" },
};

// Data is a frozen season aggregate + a cached Stats API read; an hour
// of ISR is plenty.
export const revalidate = 3600;

// Server payload floor: the smallest "Min pitches" option is 250, so
// pitchers below it never reach the client.
const PAYLOAD_MIN_PITCHES = 250;

export default async function PitchersPage() {
  const [{ season, rows }, teamMap] = await Promise.all([getPitcherDirectory(), getCachedTeamMap()]);
  const teams = [...teamMap.values()]
    .map((t) => ({ id: t.mlb_id, abbr: t.abbreviation, name: t.name }))
    .sort((a, b) => a.abbr.localeCompare(b.abbr));
  const payload = rows.filter((r) => r.pitches >= PAYLOAD_MIN_PITCHES).map(toWire);

  return (
    <main className="min-h-screen bg-bg text-ink">
      <SiteHeader active="pitchers" />
      <section className="container-page pt-6 pb-3 md:pt-12 md:pb-6 flex flex-col gap-3 md:gap-3.5">
        <EyebrowTag className="self-start">Pitchers · {season}</EyebrowTag>
        <h1 className="m-0 font-display font-extrabold italic uppercase text-[46px] md:text-[64px] leading-[0.92] text-ink">
          Find any arm.
        </h1>
        <p className="hidden md:block m-0 text-[17px] leading-[1.55] text-ink-2 max-w-[680px]">
          Search every pitcher with tracked pitches, sort the league by the numbers that matter, or
          start from a pitch: find every 95+ cutter, every sweeper with elite spin.
        </p>
      </section>
      {/* nuqs reads search params on the client → needs a Suspense boundary. */}
      <Suspense fallback={<div className="container-page h-96" aria-busy="true" />}>
        <PitchersBrowser rows={payload} teams={teams} />
      </Suspense>
    </main>
  );
}
