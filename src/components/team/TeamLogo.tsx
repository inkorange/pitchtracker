import Image from "next/image";
import { teamLogoUrl } from "@/lib/viz/headshot";

// Single render path for team marks across the app. A translucent
// white pad sits behind the logo so dark-primary team marks (Yankees
// navy, Tigers navy, Marlins black, Brewers ball-and-glove, Mets
// blue) stay legible against the dark page background.
//
// The pad is faint enough that colorful marks (Astros orange,
// Cardinals red, Dodgers blue) read as their natural color, not as
// "badged" — the pad mostly shows through the transparent areas
// around the mark, giving each logo a uniform coin-style backdrop.
//
// Do not use this on the screenshot-target pages (/strikeout_leaders,
// /velocity_leaders) — those have their own deterministic watermark
// styling that the Playwright capture depends on.
interface Props {
  teamId: number;
  size: number;
  alt?: string;
  className?: string;
}

export function TeamLogo({ teamId, size, alt = "", className = "" }: Props) {
  // Near-white coin pad. A translucent pad (e.g. white/12) over the
  // dark page bg only nudges the underlay to ~17% effective brightness,
  // which still loses navy-primary marks like the Yankees NY and the
  // Tigers D against the dark surfaces. A solid white coin removes the
  // problem entirely — every team's mark sits on the same bright
  // backdrop, dark or colored. Mirrors the badge style MatchupsPanel
  // and AtBatHeader were already using inline. ring-1 + soft shadow
  // anchors the coin against the page bg so it reads as deliberate
  // styling rather than an opaque blob.
  return (
    <div
      className={`relative rounded-full bg-white/75 shadow-sm ring-1 ring-white/40 flex-shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      <Image
        src={teamLogoUrl(teamId)}
        alt={alt}
        fill
        sizes={`${size}px`}
        className="object-contain p-[10%]"
        unoptimized
      />
    </div>
  );
}
