import Image from "next/image";
import { teamLogoOnDarkUrl } from "@/lib/viz/headshot";

// Club logo tile for the redesigned Teams pages: the on-dark mark,
// object-fit contain, on --surface (design/DESIGN.md §3 Teams).
export function TeamMark({
  teamId,
  name,
  size,
  padding,
  className = "",
}: {
  teamId: number;
  name: string;
  size: number;
  padding: number;
  className?: string;
}) {
  return (
    <span
      className={`relative shrink-0 bg-surface border border-line rounded-panel ${className}`}
      style={{ width: size, height: size, padding }}
    >
      <span className="relative block size-full">
        <Image src={teamLogoOnDarkUrl(teamId)} alt={`${name} logo`} fill sizes={`${size}px`} className="object-contain" unoptimized />
      </span>
    </span>
  );
}
