"use client";

import { useMemo, useState } from "react";
import { Scene } from "@/components/scene/Scene";
import { Ribbon } from "@/components/ribbon/Ribbon";
import { CameraPad } from "@/components/controls/CameraPad";
import { EnvToggleGear } from "@/components/controls/EnvToggleGear";
import { Pitch, type StatcastRow } from "@/lib/pitch/Pitch";
import type { SavantPitchRow } from "@/lib/savant/client";
import type { CameraPreset } from "@/lib/viz/camera-presets";

interface VisualizationPanelProps {
  rows: SavantPitchRow[];
}

// Hard cap on rendered ribbons. 5,000-row searches choke the GPU at
// full ribbon geometry; sampling evenly to ≤500 keeps the fps healthy
// while still reading as a "cloud" rather than a sparse scatter.
const MAX_VIZ_RIBBONS = 500;

// Average ribbon: mean of trajectory inputs (release pos + initial
// velocity + acceleration) across the result set. Aliased so the
// "average pitch" highlights the cluster's central path. Hidden when
// the inputs are too noisy to converge (e.g. mixed pitch types in one
// search — the average is meaningless there).
type SplitMode = "none" | "whiff_vs_contact" | "strike_vs_ball";

type Subset = "a" | "b" | null;

interface PreparedRibbon {
  id: string;
  path: Array<[number, number, number]>;
  pitchType: string;
  subset: Subset;
}

// Trajectory inputs the Pitch class actually needs. Accepting the
// narrow shape lets us reuse pathFor for both real Savant rows and
// the synthetic mean-row we compute for the average ribbon.
type TrajectoryInput = Pick<
  SavantPitchRow,
  | "release_pos_x"
  | "release_pos_y"
  | "release_pos_z"
  | "vx0"
  | "vy0"
  | "vz0"
  | "ax"
  | "ay"
  | "az"
  | "plate_x"
  | "plate_z"
  | "release_speed"
  | "pitch_type"
>;

function pathFor(
  row: TrajectoryInput,
): Array<[number, number, number]> | null {
  if (
    typeof row.release_pos_x !== "number" ||
    typeof row.release_pos_y !== "number" ||
    typeof row.release_pos_z !== "number" ||
    typeof row.vx0 !== "number" ||
    typeof row.vy0 !== "number" ||
    typeof row.vz0 !== "number" ||
    typeof row.ax !== "number" ||
    typeof row.ay !== "number" ||
    typeof row.az !== "number"
  ) {
    return null;
  }
  try {
    const stat: StatcastRow = {
      release_pos_x: row.release_pos_x,
      release_pos_y: row.release_pos_y,
      release_pos_z: row.release_pos_z,
      vx0: row.vx0,
      vy0: row.vy0,
      vz0: row.vz0,
      ax: row.ax,
      ay: row.ay,
      az: row.az,
      plate_x: row.plate_x ?? 0,
      plate_z: row.plate_z ?? 0,
      release_speed: row.release_speed ?? 0,
      pitch_type: row.pitch_type ?? "UN",
    };
    return new Pitch(stat).path(36);
  } catch {
    return null;
  }
}

function classifyForSplit(
  row: SavantPitchRow,
  mode: SplitMode,
): Subset {
  if (mode === "none") return null;
  if (mode === "whiff_vs_contact") {
    const d = row.description ?? "";
    if (d === "swinging_strike" || d === "swinging_strike_blocked") return "a";
    if (d === "hit_into_play") return "b";
    return null;
  }
  if (mode === "strike_vs_ball") {
    const d = row.description ?? "";
    if (
      d === "called_strike" ||
      d === "swinging_strike" ||
      d === "swinging_strike_blocked" ||
      d === "foul" ||
      d === "foul_tip"
    ) {
      return "a";
    }
    if (d === "ball" || d === "blocked_ball") return "b";
    return null;
  }
  return null;
}

// Even-stride sample: keeps the visual mix representative across
// season / handedness / count rather than truncating to the first N.
function sampleEvenly<T>(arr: T[], cap: number): T[] {
  if (arr.length <= cap) return arr;
  const step = arr.length / cap;
  const out: T[] = [];
  for (let i = 0; i < cap; i++) out.push(arr[Math.floor(i * step)]);
  return out;
}

export function VisualizationPanel({ rows }: VisualizationPanelProps) {
  const [preset, setPreset] = useState<CameraPreset>("side");
  const [presetTick, setPresetTick] = useState(0);
  const [splitMode, setSplitMode] = useState<SplitMode>("none");
  const handlePresetChange = (next: CameraPreset) => {
    setPreset(next);
    setPresetTick((t) => t + 1);
  };

  const prepared: PreparedRibbon[] = useMemo(() => {
    const sampled = sampleEvenly(rows, MAX_VIZ_RIBBONS);
    const out: PreparedRibbon[] = [];
    for (const row of sampled) {
      const path = pathFor(row);
      if (!path) continue;
      out.push({
        id: `${row.game_pk}-${row.at_bat_number}-${row.pitch_number}`,
        path,
        pitchType: row.pitch_type ?? "UN",
        subset: classifyForSplit(row, splitMode),
      });
    }
    return out;
  }, [rows, splitMode]);

  // Average pitch — only meaningful when the cloud is single-pitch-type.
  // For mixed types the mean trajectory crosses through hand-of-multiple
  // pitches and just confuses the eye.
  const averageRibbon = useMemo<PreparedRibbon | null>(() => {
    if (rows.length < 5) return null;
    const types = new Set<string>();
    for (const r of rows) {
      if (r.pitch_type) types.add(r.pitch_type);
      if (types.size > 1) break;
    }
    if (types.size !== 1) return null;
    const meanRow = meanTrajectoryInputs(rows);
    if (!meanRow) return null;
    const path = pathFor(meanRow);
    if (!path) return null;
    return {
      id: "avg",
      path,
      pitchType: meanRow.pitch_type ?? "UN",
      subset: null,
    };
  }, [rows]);

  // Counts of rendered ribbons in each subset, to drive the split label.
  const subsetCounts = useMemo(() => {
    if (splitMode === "none") return null;
    let a = 0;
    let b = 0;
    for (const p of prepared) {
      if (p.subset === "a") a++;
      else if (p.subset === "b") b++;
    }
    return { a, b };
  }, [prepared, splitMode]);

  return (
    <div className="space-y-3">
      {/* Split-mode toggle */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-[#081a32]/80 backdrop-blur-md border border-white/10 shadow-lg p-3">
        <span className="text-[10px] uppercase tracking-[0.14em] text-white/55 mr-1">
          Split
        </span>
        {(
          [
            { key: "none", label: "Off" },
            { key: "whiff_vs_contact", label: "Whiffs vs contact" },
            { key: "strike_vs_ball", label: "Strikes vs balls" },
          ] as const
        ).map((opt) => {
          const active = splitMode === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => setSplitMode(opt.key)}
              aria-pressed={active}
              className={`px-2.5 py-1 rounded-full text-[11px] uppercase tracking-[0.12em] border transition-colors ${
                active
                  ? "bg-white/[0.18] border-white/30 text-white"
                  : "bg-white/[0.04] border-white/10 text-white/65 hover:bg-white/[0.1] hover:text-white"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
        {subsetCounts ? (
          <span className="text-[11px] text-white/55 tabular-nums ml-auto">
            <span className="text-rose-300">A {subsetCounts.a}</span>{" "}
            <span className="text-white/35">/</span>{" "}
            <span className="text-cyan-300">B {subsetCounts.b}</span>
          </span>
        ) : null}
      </div>

      <div className="relative h-[60vh] min-h-[400px] rounded-lg bg-[#081a32]/80 backdrop-blur-md border border-white/10 shadow-lg overflow-hidden">
        <Scene preset={preset} presetTick={presetTick}>
          {prepared.map((p) => {
            // In split mode, pitches not in either subset fade to near-zero
            // so the contrast between a/b clusters is the visual story.
            const dimmed = splitMode !== "none" && p.subset === null;
            return (
              <Ribbon
                key={p.id}
                path={p.path}
                pitchType={p.pitchType}
                radius={0.04}
                opacity={dimmed ? 0.02 : 0.18}
                side={p.subset ?? undefined}
              />
            );
          })}

          {averageRibbon && splitMode === "none" ? (
            <Ribbon
              key={averageRibbon.id}
              path={averageRibbon.path}
              pitchType={averageRibbon.pitchType}
              radius={0.12}
              opacity={0.95}
            />
          ) : null}
        </Scene>

        <div className="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-[#081a32]/80 backdrop-blur-md border border-white/10 text-[10px] uppercase tracking-[0.14em] text-white/85 pointer-events-none">
          {prepared.length.toLocaleString()} of{" "}
          {rows.length.toLocaleString()} rendered
          {averageRibbon && splitMode === "none"
            ? " · avg highlighted"
            : ""}
        </div>

        <CameraPad
          current={preset}
          onChange={handlePresetChange}
          leftSlot={<EnvToggleGear />}
        />
      </div>
    </div>
  );
}

// Mean of trajectory inputs across all rows. Falls back to null if too
// few rows reported usable trajectory.
function meanTrajectoryInputs(rows: SavantPitchRow[]): StatcastRow | null {
  let n = 0;
  const acc: Record<string, number> = {
    release_pos_x: 0,
    release_pos_y: 0,
    release_pos_z: 0,
    vx0: 0,
    vy0: 0,
    vz0: 0,
    ax: 0,
    ay: 0,
    az: 0,
    plate_x: 0,
    plate_z: 0,
    release_speed: 0,
  };
  let pitchType: string | null = null;
  for (const r of rows) {
    if (
      typeof r.release_pos_x !== "number" ||
      typeof r.release_pos_y !== "number" ||
      typeof r.release_pos_z !== "number" ||
      typeof r.vx0 !== "number" ||
      typeof r.vy0 !== "number" ||
      typeof r.vz0 !== "number" ||
      typeof r.ax !== "number" ||
      typeof r.ay !== "number" ||
      typeof r.az !== "number"
    ) {
      continue;
    }
    acc.release_pos_x += r.release_pos_x;
    acc.release_pos_y += r.release_pos_y;
    acc.release_pos_z += r.release_pos_z;
    acc.vx0 += r.vx0;
    acc.vy0 += r.vy0;
    acc.vz0 += r.vz0;
    acc.ax += r.ax;
    acc.ay += r.ay;
    acc.az += r.az;
    acc.plate_x += r.plate_x ?? 0;
    acc.plate_z += r.plate_z ?? 0;
    acc.release_speed += r.release_speed ?? 0;
    pitchType = r.pitch_type ?? pitchType;
    n++;
  }
  if (n < 5) return null;
  return {
    release_pos_x: acc.release_pos_x / n,
    release_pos_y: acc.release_pos_y / n,
    release_pos_z: acc.release_pos_z / n,
    vx0: acc.vx0 / n,
    vy0: acc.vy0 / n,
    vz0: acc.vz0 / n,
    ax: acc.ax / n,
    ay: acc.ay / n,
    az: acc.az / n,
    plate_x: acc.plate_x / n,
    plate_z: acc.plate_z / n,
    release_speed: acc.release_speed / n,
    pitch_type: pitchType ?? "UN",
  };
}
