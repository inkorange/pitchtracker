"use client";

import { useEffect, useRef, useState } from "react";

interface TransportBarProps {
  // Real-world flight duration in seconds. Used to time the animation realistically.
  flightDuration: number;
  // Slowed playback factor (e.g. 0.5 = half speed).
  speed?: number;
  // Receives values in [0, 1].
  onProgressChange: (progress: number) => void;
}

export function TransportBar({ flightDuration, speed = 0.5, onProgressChange }: TransportBarProps) {
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const startRef = useRef<number | null>(null);
  const pausedAtRef = useRef(0);

  useEffect(() => {
    onProgressChange(progress);
  }, [progress, onProgressChange]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = (now: number) => {
      if (startRef.current == null) startRef.current = now;
      const elapsed = (now - startRef.current) / 1000;
      const total = flightDuration / Math.max(0.05, speed);
      const next = Math.min(1, pausedAtRef.current + elapsed / total);
      setProgress(next);
      if (next < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setPlaying(false);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      if (startRef.current != null) {
        const elapsed = (performance.now() - startRef.current) / 1000;
        const total = flightDuration / Math.max(0.05, speed);
        pausedAtRef.current = Math.min(1, pausedAtRef.current + elapsed / total);
      }
      startRef.current = null;
    };
  }, [playing, flightDuration, speed]);

  const togglePlay = () => {
    if (progress >= 1) {
      pausedAtRef.current = 0;
      setProgress(0);
      setPlaying(true);
      return;
    }
    setPlaying((p) => !p);
  };

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    pausedAtRef.current = v;
    startRef.current = null;
    setProgress(v);
    setPlaying(false);
  };

  return (
    <div className="absolute bottom-24 sm:bottom-6 left-3 right-3 sm:left-1/2 sm:right-auto z-20 sm:-translate-x-1/2 translate-y-5 flex items-center justify-center gap-3 px-4 py-2 rounded-lg bg-[#081a32]/80 backdrop-blur-md border border-white/10 shadow-lg flex-wrap">
      <button
        onClick={togglePlay}
        className="text-white/85 hover:text-white text-xs uppercase tracking-[0.14em] w-12"
        aria-label={playing ? "Pause" : "Play"}
      >
        {progress >= 1 ? "Replay" : playing ? "Pause" : "Play"}
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.001}
        value={progress}
        onChange={handleScrub}
        className="w-64 accent-white/80"
        aria-label="Scrub playback"
      />
    </div>
  );
}
