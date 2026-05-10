import { AtBatSceneShell } from "./AtBatSceneShell";

// Persistent shell for /at-bat/[gamePk]/* routes. Next.js keeps this
// layout (and the Canvas it owns) mounted across [atBatNumber] route
// changes, which means switching between at-bats from the matchup
// selector swaps the pitch data in place rather than tearing down
// and rebuilding the entire WebGL scene — same trick the pitcher
// pages use under /pitcher/[id].
export default function GameLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="fixed inset-0 bg-[#0a0e14] overflow-hidden">
      <AtBatSceneShell />
      {children}
    </main>
  );
}
