"use client";

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
}

export function CameraPad({ current, onChange }: CameraPadProps) {
  return (
    <div className="absolute bottom-6 right-6 z-20 flex gap-1 p-1 rounded-lg bg-black/50 backdrop-blur-md border border-white/10 shadow-lg">
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
  );
}
