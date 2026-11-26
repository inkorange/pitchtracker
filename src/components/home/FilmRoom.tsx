import { getHomeFeature } from "@/lib/home/feature-data";
import { buildTunnelDiagram } from "@/lib/home/tunnel";
import { TunnelVisual } from "./FeatureVisuals";

// "Built for the film room." — design/Main.dc.html "FILM ROOM".
// The design's diagram was illustrative; this one draws the featured
// pitcher's real average paths.
const POINTS = [
  "Front, back, top & side cameras",
  "Tunnel view across the arsenal",
  "Location heat maps",
  "Split by batter side & outcome",
  "Filter by at-bat result & game",
  "Side-by-side pitcher compare",
];

export async function FilmRoom() {
  const feature = await getHomeFeature().catch(() => null);
  const tunnel = feature ? buildTunnelDiagram(feature.monitorPitches, 3) : null;

  return (
    <section aria-labelledby="film-h" className="bg-surface border-y border-line">
      <div className="container-page py-12 md:py-[88px] flex flex-wrap gap-4 md:gap-14 items-center">
        <div className="flex-[1_1_420px] min-w-0 flex flex-col gap-4 md:gap-5">
          <span className="font-display font-bold text-sm md:text-[15px] tracking-[1.5px] uppercase text-highlight">
            For coaches &amp; player development
          </span>
          <h2
            id="film-h"
            className="m-0 font-display font-extrabold italic uppercase text-[40px] md:text-[56px] leading-[0.95] text-ink"
          >
            Built for the film room.
          </h2>
          <p className="m-0 text-[15px] md:text-[17px] leading-relaxed text-ink-2">
            Put a pitcher’s whole arsenal on one screen and show him where his slider peels off
            the fastball. Scout tomorrow’s starter by what he throws to lefties. Step through the
            at-bat that got away, one pitch at a time.
          </p>
          <ul className="hidden md:grid m-0 p-0 list-none grid-cols-2 gap-x-6 gap-y-3 text-[15px] text-ink">
            {POINTS.map((p) => (
              <li key={p} className="flex gap-2.5">
                <span aria-hidden="true" className="text-accent font-bold">
                  ▸
                </span>
                {p}
              </li>
            ))}
          </ul>
        </div>
        {tunnel && feature ? (
          <figure className="flex-[1_1_520px] min-w-0 m-0 bg-bg border border-line-strong rounded-panel p-4 md:p-6 flex flex-col gap-3">
            <div className="flex justify-between font-display font-bold tracking-[1px] text-[15px] text-muted uppercase">
              <span>Tunnel · side view</span>
              <span className="hidden md:inline">Release → plate</span>
            </div>
            <div className="relative aspect-[560/300]">
              <TunnelVisual diagram={tunnel} pitcherShort={feature.pitcher.shortName} />
            </div>
            <figcaption className="text-[13px] text-muted">
              {feature.pitcher.name}, {feature.season} — average path per pitch type
            </figcaption>
          </figure>
        ) : null}
      </div>
    </section>
  );
}
