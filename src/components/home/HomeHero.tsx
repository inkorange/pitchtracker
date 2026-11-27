import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { EyebrowTag, LowerThird, ScoreBug } from "@/components/broadcast";
import { PitcherSearch } from "@/components/search/PitcherSearch";
import { getHomeFeature } from "@/lib/home/feature-data";
import { getHomeRankings } from "@/lib/home/rankings";
import { LazyMiniScene } from "./LazyMiniScene";
import { PlateDotsPoster } from "./PlateDotsPoster";

// Homepage hero — design/Main.dc.html "HERO" (option A) + HomeMobile.
// Photo background with scrims; copy + search on the left; a
// broadcast "monitor" showing the real 3D scene on the right (below
// on mobile).

const CAMERAS = ["Front", "Back", "Top", "Side", "Tunnel"] as const;

export function HomeHero() {
  return (
    <section className="relative overflow-hidden isolate border-b border-line bg-bg">
      <div aria-hidden="true" className="absolute inset-0 -z-10">
        <Image
          src="/field-background.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-[50%_30%] md:object-[50%_45%]"
        />
        {/* Mobile scrim: top-to-bottom into the page ground. */}
        <div className="absolute inset-0 md:hidden bg-[linear-gradient(180deg,rgba(7,11,20,0.6)_0%,rgba(7,11,20,0.88)_45%,#070B14_100%)]" />
        {/* Desktop scrims: left-heavy for the copy, plus a bottom fade. */}
        <div className="absolute inset-0 hidden md:block bg-[linear-gradient(90deg,rgba(7,11,20,0.95)_0%,rgba(7,11,20,0.82)_42%,rgba(7,11,20,0.45)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-[120px] hidden md:block bg-[linear-gradient(180deg,rgba(7,11,20,0)_0%,rgba(7,11,20,0.85)_100%)]" />
      </div>

      <div className="container-page pt-8 pb-7 md:pt-[72px] md:pb-16">
        {/* Eyebrow sits above both columns so the monitor's top edge
            lines up with the headline's. */}
        <div className="flex items-center gap-2.5 flex-wrap mb-[18px] md:mb-6">
          <EyebrowTag>Statcast in 3D</EyebrowTag>
          <Suspense fallback={null}>
            <HeroSeasons />
          </Suspense>
        </div>
        <div className="flex flex-wrap gap-7 md:gap-14 items-start">
        <div className="flex-[1_1_440px] min-w-0 flex flex-col gap-[18px] md:gap-6">
          <h1 className="m-0 font-display font-extrabold italic uppercase text-[60px] md:text-[92px] leading-[0.9] tracking-[-0.5px] text-ink">
            See the pitch <br className="hidden md:inline" />
            <span className="text-accent">the hitter saw.</span>
          </h1>
          <p className="m-0 text-base md:text-[19px] leading-[1.55] text-ink-2 max-w-[520px]">
            PitchTracker rebuilds every MLB pitch as a full 3D flight path from Statcast
            tracking. Study tunnels, break and approach angle from any camera — by pitcher,
            by count side, by at-bat.
          </p>
          <div className="max-w-[520px]" data-hero-search>
            <PitcherSearch variant="hero" placeholder="Search a pitcher — try “Misiorowski”" />
          </div>
          <div className="flex gap-5 flex-wrap text-sm font-semibold">
            <Link href="/browse" className="flex items-center gap-2 min-h-11 text-ink hover:text-accent-hover">
              Browse all 30 teams <span aria-hidden="true">→</span>
            </Link>
            <Link href="/at-bat" className="flex items-center gap-2 min-h-11 text-ink hover:text-accent-hover">
              Replay an at-bat <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>

        <Suspense fallback={<MonitorFrame />}>
          <HeroMonitor />
        </Suspense>
        </div>
      </div>
    </section>
  );
}

// Rankings are a fast Supabase read; the Savant-backed feature data
// may be cold, so the season line doesn't wait on it.
async function HeroSeasons() {
  const { season } = await getHomeRankings();
  return (
    <span className="text-[13px] text-muted tracking-[0.5px]">
      {season - 1} &amp; {season} seasons
    </span>
  );
}

function MonitorFrame({ children }: { children?: React.ReactNode }) {
  return (
    <figure className="flex-[1_1_560px] min-w-0 m-0 relative h-[400px] md:h-auto md:aspect-[16/10.5] rounded-panel overflow-hidden border border-line-strong bg-surface">
      {children}
    </figure>
  );
}

async function HeroMonitor() {
  const feature = await getHomeFeature().catch(() => null);
  if (!feature || feature.monitorPitches.length === 0) return <MonitorFrame />;
  const { pitcher, season, pitchCount, pitchTypeCount, monitorPitches } = feature;

  return (
    <MonitorFrame>
      <Link
        href={pitcher.href}
        className="absolute inset-0 z-10"
        aria-label={`Open ${pitcher.name} in 3D — ${pitchCount.toLocaleString()} pitches in ${season}`}
      />
      <LazyMiniScene
        pitches={monitorPitches}
        fallback={<PlateDotsPoster pitches={monitorPitches} />}
      />
      <ScoreBug
        className="absolute top-3 left-3 md:top-4 md:left-4"
        size="md"
        segments={[
          ...(pitcher.teamAbbr ? [{ tone: "team" as const, content: pitcher.teamAbbr }] : []),
          { tone: "name", content: pitcher.shortName },
          ...(pitcher.role ? [{ tone: "tag" as const, content: pitcher.role }] : []),
        ]}
      />
      <div className="absolute inset-x-3 bottom-3 md:inset-x-4 md:bottom-4 flex items-end justify-between gap-3 flex-wrap pointer-events-none">
        <LowerThird
          className="max-md:grow"
          size="sm"
          label={<span className="hidden md:inline">{season} season · all pitches</span>}
          value={
            <>
              {pitchCount.toLocaleString()} pitches
              <span className="hidden md:inline"> · {pitchTypeCount}-pitch mix</span>
              <span className="md:hidden"> · {season}</span>
            </>
          }
        />
        <div
          aria-hidden="true"
          className="hidden md:flex bg-overlay rounded-control p-1 font-display font-bold text-[15px] tracking-[1px] uppercase"
        >
          {CAMERAS.map((c, i) => (
            <span
              key={c}
              className={i === 0 ? "px-3 py-1.5 bg-ink text-bg rounded-[2px]" : "px-3 py-1.5 text-ink-2"}
            >
              {c}
            </span>
          ))}
        </div>
      </div>
    </MonitorFrame>
  );
}
