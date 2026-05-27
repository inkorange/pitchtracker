"use client";

import { useParams } from "next/navigation";
import { AtBatSceneShell } from "./AtBatSceneShell";

// Persistent shell for /at-bat/[gamePk]/* routes. Next.js keeps this
// layout (and the Canvas it owns) mounted across [atBatNumber] route
// changes, which means switching between at-bats from the matchup
// selector swaps the pitch data in place rather than tearing down
// and rebuilding the entire WebGL scene — same trick the pitcher
// pages use under /pitcher/[id].
//
// Mode is route-driven via useParams (this is the cheapest way to
// branch on the active child segment from a shared layout — Next.js
// doesn't pass [atBatNumber] to the parent layout's props):
//
//  - On /at-bat/[gamePk] (game list): use normal page flow so the
//    long at-bat list can scroll. fixed/overflow-hidden was clipping
//    the rest of the list off the bottom of the viewport with no
//    way to scroll to it.
//  - On /at-bat/[gamePk]/[atBatNumber] (3D replay): viewport-pinned
//    so the Canvas + sidebar can use absolute positioning relative
//    to the screen.
//
// The <main> element stays a single React node across navigations
// — only the className changes — so the AtBatSceneShell underneath
// keeps its Canvas mounted while the user clicks between at-bats.
export default function GameLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams<{ atBatNumber?: string }>();
  const isReplay = Boolean(params?.atBatNumber);
  return (
    <main
      className={
        isReplay
          ? "fixed inset-0 bg-[#0a0e14] overflow-hidden"
          : "min-h-screen bg-[#0a0e14]"
      }
    >
      <AtBatSceneShell />
      {children}
    </main>
  );
}
