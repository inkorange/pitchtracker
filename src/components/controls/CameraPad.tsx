"use client";

import type { ReactNode } from "react";
import type { CameraPreset } from "@/lib/viz/camera-presets";

const PRESETS: Array<{ key: CameraPreset; label: string }> = [
  { key: "front", label: "Front" },
  { key: "back", label: "Back" },
  { key: "top", label: "Top" },
  { key: "side", label: "Side" },
];

interface CameraPadProps {
  current: CameraPreset;
  onChange: (preset: CameraPreset) => void;
  // Optional slot rendered to the LEFT of the preset chip, sharing
  // the same absolute-positioned wrapper. Used to dock a companion
  // control (e.g. EnvToggleGear) next to the pad without a
  // hard-coded pixel offset.
  leftSlot?: ReactNode;
}

export function CameraPad({ current, onChange, leftSlot }: CameraPadProps) {
  return (
    // z-40 puts the whole controls row (preset chip + gear + gear
    // popover) above every other scene overlay (transport bar,
    // pitch chips, follow-off button — all at z-20). Without this
    // the gear popover slots BEHIND the transport bar on mobile
    // where the controls stack tightly.
    <div className="absolute bottom-6 right-3 sm:right-6 z-40 flex gap-2 items-end">
      {leftSlot}
      <div className="flex gap-1 p-1 rounded-lg bg-[#081a32]/80 backdrop-blur-md border border-white/10 shadow-lg">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => onChange(p.key)}
            className={`px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] rounded-md transition-colors ${
              current === p.key
                ? "bg-white/10 text-white"
                : "text-white/55 hover:text-white hover:bg-white/[0.04]"
            }`}
            aria-pressed={current === p.key}
            aria-label={`Camera preset: ${p.label}`}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
