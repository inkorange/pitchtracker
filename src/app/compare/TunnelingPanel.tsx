import { Pitch } from "@/lib/pitch/Pitch";
import { averagePitchesByType, type CachedPitchSubset } from "@/lib/pitch/averages";
import { computeTunnelStats } from "@/lib/pitch/tunneling";
import { getPitchColor, getPitchLabel } from "@/lib/viz/colors";
import { MobileCollapse } from "@/components/chrome/MobileCollapse";

interface TunnelingPanelProps {
  aPitches: CachedPitchSubset[];
  bPitches: CachedPitchSubset[];
}

interface TunnelEntry {
  pitchType: string;
  tunnelY: number | null;
  qualityScore: number;
  plateDistance: number;
}

// Per-pitch-type tunneling rundown. Computed server-side from each
// pitcher's average pitch per type.
export function TunnelingPanel({ aPitches, bPitches }: TunnelingPanelProps) {
  const aByType = averagePitchesByType(aPitches);
  const bByType = averagePitchesByType(bPitches);
  const entries: TunnelEntry[] = [];
  for (const [type, aPitch] of aByType) {
    const bPitch = bByType.get(type);
    if (!bPitch) continue;
    try {
      const stats = computeTunnelStats(aPitch as Pitch, bPitch as Pitch, {
        thresholdFt: 0.5,
      });
      entries.push({
        pitchType: type,
        tunnelY: stats.tunnelY,
        qualityScore: stats.qualityScore,
        plateDistance: stats.plateDistance,
      });
    } catch {
      // ignore
    }
  }
  // Sort: sharpest tunnels first (lowest tunnelY = latest break).
  entries.sort((x, y) => {
    if (x.tunnelY == null) return 1;
    if (y.tunnelY == null) return -1;
    return x.tunnelY - y.tunnelY;
  });

  if (entries.length === 0) return null;

  return (
    <div className="pt-3 border-t border-white/[0.08]">
      <MobileCollapse
        size="compact"
        ariaLabel="Toggle tunneling details"
        header={
          <div className="text-[10px] uppercase tracking-[0.16em] text-white/45">
            Tunneling
          </div>
        }
        body={
          <>
            <ul className="space-y-1.5">
              {entries.map((e) => (
                <li
                  key={e.pitchType}
                  className="flex items-center gap-2 text-[11px] tabular-nums"
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: getPitchColor(e.pitchType) }}
                  />
                  <span className="text-white/85 flex-1 truncate">
                    {getPitchLabel(e.pitchType)}
                  </span>
                  <span className="text-white/55">
                    {e.tunnelY != null ? `${e.tunnelY.toFixed(0)} ft` : "—"}
                  </span>
                  <span className="text-white/45 w-12 text-right">
                    {(e.plateDistance * 12).toFixed(1)}″ apart
                  </span>
                </li>
              ))}
            </ul>
            <div className="text-[10px] text-white/35 leading-relaxed pt-1">
              ft = distance from plate where the average paths last cross
              within 6″. Lower = sharper / later break.
            </div>
          </>
        }
      />
    </div>
  );
}
