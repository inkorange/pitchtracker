import { ImageResponse } from "next/og";
import { getPitchColor } from "@/lib/viz/colors";
import {
  PITCH_TYPES,
  EVENTS,
  DESCRIPTIONS,
} from "@/lib/savant/enums";

export const runtime = "nodejs";

// Open-graph image for shared /explore URLs.
//   /api/og/explore?<same params as /explore>
// 1200×630 PNG. We don't run the search here (too slow on cold cache
// and not worth the function budget for a share preview); we just
// summarize the filter set so the share card communicates intent —
// "Sliders · 2025 · whiffs" — and lets the user click through to the
// live result.

const PITCH_LABEL_MAP = new Map(PITCH_TYPES.map((p) => [p.value, p.label]));
const EVENT_LABEL_MAP = new Map(EVENTS.map((e) => [e.value, e.label]));
const DESC_LABEL_MAP = new Map(DESCRIPTIONS.map((d) => [d.value, d.label]));

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sp = url.searchParams;

  const list = (k: string) => sp.getAll(k).flatMap((v) => v.split(","));
  // nuqs encodes arrays as comma-separated by default, but legacy
  // links may also use repeated keys — accept both.
  const pitchTypes = list("pt");
  const seasons = list("s");
  const descriptions = list("d");
  const events = list("ev");
  const counts = list("c");
  const pitcherThrows = sp.get("pth");
  const batterStands = sp.get("bst");

  // Headline summary string. Keep it short, iconic — readers scan share
  // cards in <1 second.
  const lines: string[] = [];
  if (pitchTypes.length) {
    lines.push(
      pitchTypes
        .slice(0, 3)
        .map((t) => PITCH_LABEL_MAP.get(t) ?? t)
        .join(" · ") + (pitchTypes.length > 3 ? " · …" : ""),
    );
  }
  if (events.length) {
    lines.push(events.map((e) => EVENT_LABEL_MAP.get(e) ?? e).join(" · "));
  } else if (descriptions.length) {
    lines.push(
      descriptions.map((d) => DESC_LABEL_MAP.get(d) ?? d).join(" · "),
    );
  }
  const conditions: string[] = [];
  if (pitcherThrows) conditions.push(`vs ${pitcherThrows}HP`);
  if (batterStands) conditions.push(`${batterStands}HB`);
  if (counts.length) conditions.push(`counts ${counts.join(", ")}`);
  if (seasons.length) conditions.push(seasons.join(", "));
  if (conditions.length) lines.push(conditions.join(" · "));
  if (lines.length === 0) lines.push("Mine the Statcast pitch dataset");

  // Pitch-type colored dots — visual flavor that keys to the actual
  // semantic colors used in the 3D scene.
  const dotColors =
    pitchTypes.length > 0
      ? pitchTypes.slice(0, 5).map((t) => getPitchColor(t))
      : ["#ff4655", "#9b6bff", "#33d4aa", "#5588ff", "#ffaa44"];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#081a32",
          color: "white",
          padding: "64px 72px",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 24,
          }}
        >
          <div
            style={{
              fontSize: 22,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.55)",
            }}
          >
            Explore
          </div>
          <div
            style={{
              fontSize: 22,
              color: "rgba(255,255,255,0.35)",
            }}
          >
            ·
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 28,
              fontWeight: 600,
            }}
          >
            <span style={{ color: "#0C2340" }}>Pitch</span>
            <span style={{ color: "#BA0C2F" }}>tracker</span>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 18,
            marginTop: 64,
          }}
        >
          {dotColors.map((c, i) => (
            <div
              key={i}
              style={{
                width: 28,
                height: 28,
                borderRadius: 999,
                background: c,
                boxShadow: `0 0 24px ${c}`,
              }}
            />
          ))}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 18,
            marginTop: 56,
          }}
        >
          {lines.map((line, i) => (
            <div
              key={i}
              style={{
                fontSize: i === 0 ? 84 : 38,
                fontWeight: i === 0 ? 700 : 500,
                lineHeight: 1.05,
                color: i === 0 ? "white" : "rgba(255,255,255,0.75)",
                letterSpacing: i === 0 ? "-0.02em" : "0",
              }}
            >
              {line}
            </div>
          ))}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            marginTop: "auto",
            color: "rgba(255,255,255,0.55)",
          }}
        >
          <div style={{ fontSize: 22, letterSpacing: "0.16em", textTransform: "uppercase" }}>
            Statcast outcome mining
          </div>
          <div style={{ fontSize: 22 }}>pitchtracker.app/explore</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
