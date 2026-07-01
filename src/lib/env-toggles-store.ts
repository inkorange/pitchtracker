"use client";

import { useSyncExternalStore } from "react";

// User-controlled visibility of scene "environment" elements. Keyed
// booleans so we can add new toggles without breaking older stored
// values — spread {...DEFAULT, ...parsed} guarantees an unknown-key
// value survives and any newly added key inherits its default.
export type EnvToggles = {
  stadium: boolean;
  field: boolean;
  batter: boolean;
  shadows: boolean;
};

// Stadium defaults OFF going forward — user wants a cleaner default
// scene (mound + plate + field + batter) with the stadium bowl an
// opt-in add-on for anyone who wants the crowd/context. Field, batter,
// and shadows all default on since removing them requires more
// explicit intent (they anchor the "watch a pitch" mental model, and
// shadows are the cheapest way to sell scene depth).
const DEFAULT: EnvToggles = {
  stadium: false,
  field: true,
  batter: true,
  shadows: true,
};
// Versioned key so a schema change (adding/renaming/dropping a toggle
// OR flipping a default) can safely bump the suffix and start fresh
// without polluting reads against a stale shape. v1 = all on; v2 =
// stadium off; v3 = adds shadows key.
const STORAGE_KEY = "pitchtracker:env-toggles:v3";

// Single cached snapshot — useSyncExternalStore requires getSnapshot
// to return the SAME reference until state changes; recomputing a
// fresh object on every call would cause an infinite render loop.
let cached: EnvToggles | null = null;
const listeners = new Set<() => void>();

function read(): EnvToggles {
  if (typeof window === "undefined") return DEFAULT;
  if (cached) return cached;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<EnvToggles>;
      cached = { ...DEFAULT, ...parsed };
    } else {
      cached = DEFAULT;
    }
  } catch {
    cached = DEFAULT;
  }
  return cached;
}

function write(next: EnvToggles) {
  cached = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore quota / private-mode errors — the in-memory cache
    // still keeps the session consistent until reload.
  }
  listeners.forEach((l) => l());
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function getSnapshot(): EnvToggles {
  return read();
}

function getServerSnapshot(): EnvToggles {
  return DEFAULT;
}

export function useEnvToggles(): EnvToggles {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function setEnvToggle<K extends keyof EnvToggles>(
  key: K,
  value: boolean,
): void {
  const current = read();
  if (current[key] === value) return;
  write({ ...current, [key]: value });
}
