import { OUTCOME_COLORS, OUTCOME_LABELS, type OutcomeCategory } from "@/lib/viz/colors";

const ORDER: OutcomeCategory[] = ["whiff", "called", "ball", "foul", "inplay"];

export function OutcomeLegend() {
  return (
    <aside className="absolute top-20 right-6 rounded-lg bg-black/50 backdrop-blur-md border border-white/10 shadow-lg p-3 pointer-events-auto">
      <div className="text-[10px] uppercase tracking-[0.14em] text-white/45 mb-2">
        Outcome
      </div>
      <ul className="space-y-1.5">
        {ORDER.map((cat) => (
          <li key={cat} className="flex items-center gap-2 text-[11px] text-white/85">
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: OUTCOME_COLORS[cat] }}
            />
            <span>{OUTCOME_LABELS[cat]}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
