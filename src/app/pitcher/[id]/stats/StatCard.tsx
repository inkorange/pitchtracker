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
    <section className="bg-surface border border-line rounded-control overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-[18px] py-3 bg-surface-2 border-b border-line">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="m-0 font-display font-bold text-lg uppercase leading-none text-ink">
            {title}
          </h3>
          {help ? <HelpButton title={title}>{help}</HelpButton> : null}
        </div>
        {hint ? <span className="text-xs text-muted">{hint}</span> : null}
      </div>
      <div className="p-4 space-y-3">{children}</div>
    </section>
  );
}
