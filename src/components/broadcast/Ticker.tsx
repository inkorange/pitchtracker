export type TickerItem = {
  /** Short stat key, e.g. "VELO", "K", "WHIFF%". */
  k: string;
  name: string;
  /** Pre-formatted value, e.g. "101.4", "-3.10°". */
  v: string;
};

/** How many copies of the list the crawl track renders. The CSS
 *  animation translates by -50%, so this must be even. */
export const TICKER_REPEAT = 4;

/**
 * Full-bleed accent ticker with a continuous broadcast crawl
 * (design/DESIGN.md §2 "Ticker"). Not capped at the page container.
 *
 * Animation lives in globals.css (.pt-crawl): 45s linear loop, paused
 * on hover/focus, disabled under prefers-reduced-motion (the track
 * becomes horizontally scrollable instead).
 */
export function Ticker({
  items,
  label = "Leaders",
  className = "",
}: {
  items: TickerItem[];
  label?: string;
  className?: string;
}) {
  if (items.length === 0) return null;
  const loop = Array.from({ length: TICKER_REPEAT }, () => items).flat();

  return (
    <section aria-label={label} className={`bg-accent text-white overflow-hidden ${className}`}>
      <div className="flex items-center h-11 md:h-12 whitespace-nowrap font-display font-bold text-[17px] md:text-[19px] tracking-[0.5px]">
        <span className="relative z-[1] shrink-0 h-full flex items-center bg-bg pl-5 pr-6 md:pl-8 md:pr-7 tracking-[1.5px] uppercase [clip-path:polygon(0_0,100%_0,90%_100%,0_100%)]">
          {label}
        </span>
        {/* tabIndex lets keyboard users focus the crawl to pause it
            (and scroll it when reduced motion is on). */}
        <div
          className="pt-crawl-wrap grow min-w-0 h-full overflow-hidden flex items-center focus-visible:outline-2 focus-visible:outline-white"
          tabIndex={0}
        >
          <ul className="pt-crawl flex items-center w-max m-0 p-0 list-none">
            {loop.map((t, i) => (
              <li
                key={i}
                // Only the first copy is exposed to assistive tech; the
                // rest exist purely for the seamless visual loop.
                aria-hidden={i >= items.length ? true : undefined}
                className="flex items-baseline gap-2 px-[22px] border-r border-white/35"
              >
                <span className="opacity-80 text-[15px]">{t.k}</span>
                <span>{t.name}</span>
                <span className="num">{t.v}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
