// Shared chrome for every analytics card so they read as a stack
// of consistent panels — same border, padding, and section heading.
export function StatCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg bg-white/[0.03] border border-white/10 p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-xs uppercase tracking-[0.14em] text-white/75 font-medium">
          {title}
        </h3>
        {hint ? (
          <span className="text-[10px] text-white/40">{hint}</span>
        ) : null}
      </div>
      {children}
    </section>
  );
}
