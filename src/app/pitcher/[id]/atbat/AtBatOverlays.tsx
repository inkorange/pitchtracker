"use client";

import { useSearchParams } from "next/navigation";
import { LowerThird, ScoreBug } from "@/components/broadcast";
import { getPitchColor, getPitchLabel } from "@/lib/viz/colors";
import { countBefore, pitchResult } from "./labels";
import { useAtBatSnapshot } from "./store";
import { ZoneInset } from "./ZoneInset";

/**
 * At-bat mode overlays on the scene (design/AtBat.dc.html,
 * AtBatMobile.dc.html): score bug "PITCH n OF N | count | mph"
 * top-left, zone inset top-right, and (desktop) a lower third naming
 * the current pitch above the transport bar. The box matches the
 * scene's own box in /pitcher/layout.tsx.
 */
export function AtBatOverlays() {
  const sp = useSearchParams();
  const { pitches, currentIdx, landed } = useAtBatSnapshot();
  if (!(sp.has("abGame") && sp.has("abNum")) || pitches.length === 0) return null;
  const cur = pitches[currentIdx];
  const n = pitches.length;
  const mph = cur?.release_speed != null ? cur.release_speed.toFixed(1) : "—";
  const color = cur?.pitch_type ? getPitchColor(cur.pitch_type) : undefined;

  return (
    <div className="absolute inset-x-0 top-14 bottom-[212px] lg:bottom-0 lg:left-[384px] z-20 pointer-events-none">
      <div aria-live="polite" aria-atomic="true">
        <div className="lg:hidden absolute top-3 left-3">
        <ScoreBug
          size="sm"
          label={`Pitch ${currentIdx + 1} of ${n}, count ${countBefore(cur)}, ${mph} miles per hour`}
          segments={[
            { tone: "team", content: `P${currentIdx + 1}/${n}` },
            { tone: "name", content: countBefore(cur) },
            { tone: "tag", content: mph },
          ]}
        />
        </div>
        <div className="hidden lg:block absolute top-4 left-4">
        <ScoreBug
          size="lg"
          segments={[
            { tone: "team", content: `Pitch ${currentIdx + 1} of ${n}` },
            { tone: "name", content: countBefore(cur) },
            { tone: "tag", content: `${mph} mph` },
          ]}
        />
        </div>
      </div>
      <div className="absolute top-3 right-3 lg:hidden">
        <ZoneInset pitches={pitches} currentIdx={currentIdx} landed={landed} compact />
      </div>
      <div className="hidden lg:block absolute top-4 right-4">
        <ZoneInset pitches={pitches} currentIdx={currentIdx} landed={landed} />
      </div>
      {cur ? (
        <LowerThird
          className="hidden lg:flex absolute left-4 bottom-24"
          size="lg"
          color={color}
          label={`Pitch ${currentIdx + 1} · ${countBefore(cur)} count`}
          // The result appears once the ball reaches the plate.
          value={`${cur.pitch_type ? getPitchLabel(cur.pitch_type) : "Pitch"}${landed ? ` · ${pitchResult(cur.description)}` : ""}`}
        />
      ) : null}
    </div>
  );
}
