import { getHomeFeature } from "@/lib/home/feature-data";
import { buildTunnelDiagram } from "@/lib/home/tunnel";
import { HomeFeatureCards } from "./FeatureCards";

// "A pitch lab, not a stat table." — the feature-cards section.
// Visuals use the featured pitcher's real data (see feature-data.ts).
export async function FeatureSection() {
  const feature = await getHomeFeature().catch(() => null);
  if (!feature) return null;
  const tunnel = buildTunnelDiagram(feature.monitorPitches, 3);

  return (
    <section
      aria-labelledby="features-h"
      className="container-page pt-10 pb-2 md:pt-24 md:pb-10 flex flex-col gap-3 md:gap-8"
    >
      <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-1 md:gap-6">
        <h2
          id="features-h"
          className="m-0 font-display font-extrabold italic uppercase text-[40px] md:text-[56px] leading-[0.95] text-ink"
        >
          A pitch lab, not a stat table.
        </h2>
        <p className="m-0 mb-2 md:mb-0 text-sm text-muted md:max-w-[320px]">
          <span className="hidden md:inline">
            Hover a card (or Tab to it) and it widens in place: the preview grows and the how-to
            fades in.
          </span>
          <span className="md:hidden">Tap a card to preview it.</span>
        </p>
      </div>
      <HomeFeatureCards feature={feature} tunnel={tunnel} />
    </section>
  );
}
