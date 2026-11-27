import type { ReactNode } from "react";

// Section title row used across the homepage: Barlow 800 uppercase
// (28px mobile / 32px desktop) with an optional right-side link.
export function SectionHeader({
  id,
  title,
  aside,
}: {
  id?: string;
  title: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="flex justify-between items-center md:items-baseline gap-4 flex-wrap mb-3 md:mb-5">
      <h2
        id={id}
        className="m-0 font-display font-extrabold text-[28px] md:text-[32px] tracking-[0.5px] uppercase text-ink"
      >
        {title}
      </h2>
      {aside}
    </div>
  );
}
