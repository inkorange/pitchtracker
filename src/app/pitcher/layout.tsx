import { ArsenalSceneShell } from "./[id]/ArsenalSceneShell";

export default function PitcherRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="fixed inset-0 bg-bg overflow-hidden">
      {/* Desktop (lg+): the scene fills the area right of the 384px rail
          and below the 56px top bar (design/Pitcher.dc.html) — the rail
          no longer overlays it. Below lg the scene is full-screen with
          floating panels until the mobile drawer lands. */}
      <div className="absolute inset-0 lg:top-14 lg:left-[384px]">
        <ArsenalSceneShell />
      </div>
      {children}
    </main>
  );
}
