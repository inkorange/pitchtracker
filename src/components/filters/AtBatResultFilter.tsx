"use client";

import { AT_BAT_EVENT_CHIPS } from "@/lib/at-bat-events";

// Controlled chip group for the at-bat-result filter. State lives in
// the parent client component (AtBatGameList on the list page,
// PitcherMatchupsSidebar on the replay page) so chip changes can be
// shallow URL updates — no server re-fetch when the data is already
// loaded in the browser.

interface Props {
  /** Currently selected chip keys (typically 0 or 1 entry). */
  active: string[];
  /** Called with the chip key the user clicked. */
  onToggle: (key: string) => void;
  /** Optional label shown above the chips. */
  label?: string;
  /** Tighter padding when embedded inside a sidebar list. */
  compact?: boolean;
  /**
   * Chip keys that have at least one matching at-bat in the page's
   * visible scope. Any chip not in this list renders as disabled and
   * doesn't respond to clicks. When omitted, all chips are enabled.
   */
  availableKeys?: string[];
}

export function AtBatResultFilter({
  active,
  onToggle,
  label = "Result",
  compact = false,
  availableKeys,
}: Props) {
  const availableSet = availableKeys ? new Set(availableKeys) : null;

  return (
    <div className={compact ? "space-y-1" : "space-y-1.5"}>
      {label ? (
        <div className="text-[10px] uppercase tracking-[0.14em] text-white/45">
          {label}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        {AT_BAT_EVENT_CHIPS.map((opt) => {
          const disabled = availableSet != null && !availableSet.has(opt.key);
          const isActive = active.includes(opt.key);
          const dim = !disabled && active.length > 0 && !isActive;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => {
                if (disabled) return;
                onToggle(opt.key);
              }}
              disabled={disabled}
              aria-pressed={!disabled && isActive}
              aria-disabled={disabled}
              title={disabled ? "No at-bats with this result here" : undefined}
              className={`px-2 py-1 rounded text-[11px] transition-colors ${
                disabled
                  ? "bg-white/[0.015] text-white/20 border border-white/[0.03] cursor-not-allowed"
                  : dim
                    ? "bg-white/[0.02] text-white/35 border border-white/5"
                    : "bg-white/[0.06] text-white/85 border border-white/10 hover:bg-white/[0.1]"
              }`}
            >
              <span className="sm:hidden">{opt.shortLabel}</span>
              <span className="hidden sm:inline">{opt.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
