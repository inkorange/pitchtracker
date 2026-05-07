import { ArsenalSceneShell } from "./[id]/ArsenalSceneShell";

// Layout one level above /pitcher/[id]/page.tsx — Next.js preserves
// this layout across [id] route changes, which keeps the 3D Scene
// mounted when the user picks a different pitcher from the search
// input. The page.tsx underneath rewrites the panels with the new
// pitcher's metadata while ArsenalSceneShell swaps its pitch data
// in place via prop change instead of a Canvas remount.
export default function PitcherRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="fixed inset-0 bg-[#0a0e14] overflow-hidden">
      <ArsenalSceneShell />
      {children}
    </main>
  );
}
