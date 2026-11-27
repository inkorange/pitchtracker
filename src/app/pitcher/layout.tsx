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
          no longer overlays it. Below lg: between the 56px header and the
          drawer — the canvas ends just under the drawer's peek (which
          overlaps its last ~36px) so the plate and zone frame in the
          visible area instead of behind the drawer. */}
      <div className="absolute inset-x-0 top-14 bottom-[212px] lg:bottom-0 lg:left-[384px]">
        <ArsenalSceneShell />
      </div>
      {children}
    </main>
  );
}
