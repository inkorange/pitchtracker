"use client";

import { openAiChat } from "@/lib/ai/open-chat";

// "Ask it like you'd ask your analyst." — design/Main.dc.html "ASK".
// Example questions are taken from the documented samples on /ai so
// they're known to work. Clicking one opens the chat and sends it.
const ASKS = [
  "Show me Paul Skenes's curveballs in 2025",
  "What's Dylan Cease's average fastball speed?",
  "Show me all the strikeouts from Sandy Alcantara's last game",
];

export function AskSection() {
  return (
    <section aria-labelledby="ask-h" className="container-page py-12 md:pt-[88px] md:pb-10">
      <div className="md:bg-surface md:border md:border-line md:rounded-panel md:p-10 flex flex-wrap gap-3 md:gap-8 items-center">
        <div className="flex-[1_1_380px] min-w-0 flex flex-col gap-3">
          <h2
            id="ask-h"
            className="m-0 font-display font-extrabold italic uppercase text-4xl md:text-[44px] leading-[0.95] text-ink"
          >
            Ask it like you’d ask your analyst.
          </h2>
          <p className="m-0 mb-2 md:mb-0 text-[15px] md:text-base leading-[1.55] text-ink-2">
            Ask PitchTracker answers natural-language questions by voice or text and drops you
            into the matching pitches.
          </p>
        </div>
        <ul className="flex-[1_1_460px] min-w-0 list-none m-0 p-0 flex flex-col gap-2.5">
          {ASKS.map((q, i) => (
            <li key={q} className={i === 1 ? "hidden md:block" : undefined}>
              <button
                type="button"
                onClick={() => openAiChat({ q, autoSend: true })}
                className="w-full flex items-center justify-between gap-3 min-h-[52px] md:min-h-12 px-4 md:px-[18px] text-left border border-line-strong rounded-control text-[15px] text-ink hover:border-ink-2 transition-colors"
              >
                <span>“{q}”</span>
                <span aria-hidden="true" className="text-accent">
                  →
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
