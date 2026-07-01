import type { Metadata } from "next";
import type { ReactNode } from "react";

// Every route under /dev is a scratch harness — batter-mirror-test,
// future model/preset/scene-tuning pages, etc. None should be crawled
// or indexed. Setting the robots directive here covers the whole
// subtree with one file; robots.txt also disallows /dev/ as a
// belt-and-suspenders (this catches Google if it discovers a /dev URL
// via an external link, robots.txt catches the initial crawl request).
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function DevLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
