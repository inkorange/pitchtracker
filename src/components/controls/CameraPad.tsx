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
  /** Rendered left of the camera group (e.g. the settings gear). */
  leftSlot?: ReactNode;
  /** Extra toggles appended inside the camera group (e.g. Tunnel, Heat). */
  extra?: ReactNode;
  /** Override where the pad sits (the pitcher page lifts it above its drawer). */
  positionClass?: string;
}

/** Bottom-right camera group — broadcast style (design/Pitcher.dc.html). */
export function CameraPad({
  current,
  onChange,
  leftSlot,
  extra,
  positionClass = "bottom-6 right-3 sm:right-6 lg:bottom-4 lg:right-4",
}: CameraPadProps) {
  return (
    // z-40 keeps the controls row above other scene chrome (labels,
    // pitch chips) so it's always clickable.
    <div className={`absolute z-40 flex gap-2 items-end ${positionClass}`}>
      {leftSlot}
      <div
        role="group"
        aria-label="Camera"
        className="grow sm:grow-0 flex items-center gap-0.5 p-1 rounded-control bg-overlay border border-line-strong shadow-lg font-display font-bold text-[13px] lg:text-[15px] tracking-[0.5px] lg:tracking-[1px] uppercase"
      >
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => onChange(p.key)}
            className={`flex-1 sm:flex-none h-10 lg:h-9 px-1.5 sm:px-3 rounded-[2px] uppercase transition-colors ${
              current === p.key ? "bg-ink text-bg" : "text-ink-2 hover:text-ink"
            }`}
            aria-pressed={current === p.key}
            aria-label={`Camera: ${p.label}`}
          >
            {p.label}
          </button>
        ))}
        {extra}
      </div>
    </div>
  );
}
