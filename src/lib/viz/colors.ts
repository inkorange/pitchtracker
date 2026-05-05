// Pitch-type semantic colors, tuned for emissive materials on a dark stage.

export const PITCH_COLORS: Record<string, string> = {
  FF: "#ff4655",
  FA: "#ff4655",
  SI: "#ff7a3a",
  FT: "#ff7a3a",
  FC: "#ffaa44",
  SL: "#9b6bff",
  ST: "#5588ff",
  SV: "#5588ff",
  CU: "#3855ff",
  KC: "#5544aa",
  CS: "#3855ff",
  CH: "#33d4aa",
  FS: "#44cc66",
  FO: "#44cc66",
  KN: "#ffd633",
  EP: "#aaaaaa",
  PO: "#aaaaaa",
  IN: "#aaaaaa",
  UN: "#888888",
};

export const PITCH_LABELS: Record<string, string> = {
  FF: "Four-Seam",
  FA: "Four-Seam",
  SI: "Sinker",
  FT: "Two-Seam",
  FC: "Cutter",
  SL: "Slider",
  ST: "Sweeper",
  SV: "Sweeper",
  CU: "Curveball",
  KC: "Knuckle Curve",
  CS: "Slow Curve",
  CH: "Changeup",
  FS: "Splitter",
  FO: "Forkball",
  KN: "Knuckleball",
  EP: "Eephus",
};

export function getPitchColor(pitchType: string): string {
  return PITCH_COLORS[pitchType.toUpperCase()] ?? "#888888";
}

export function getPitchLabel(pitchType: string): string {
  return PITCH_LABELS[pitchType.toUpperCase()] ?? pitchType;
}
