import type { ReactNode } from "react";
import { HelpButton } from "./HelpButton";

// Shared chrome for every analytics card so they read as a stack
// of consistent panels — same border, padding, and section heading.
//
// Cards may pass a `help` slot (rich JSX or plain string) which
// surfaces as a clickable (i) icon next to the title; opening it
// shows a popover with the explanation. Keeps card content focused
// on the visualization while still giving viewers a "what am I
// looking at?" affordance.
export function StatCard({
  title,
  hint,
  help,
  children,
}: {
  title: string;
  hint?: string;
  help?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg bg-white/[0.03] border border-white/10 p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-xs uppercase tracking-[0.14em] text-white/75 font-medium">
            {title}
          </h3>
          {help ? <HelpButton title={title}>{help}</HelpButton> : null}
        </div>
        {hint ? (
          <span className="text-[10px] text-white/40">{hint}</span>
        ) : null}
      </div>
      {children}
    </section>
  );
}
