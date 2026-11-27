import { getHomeRankings } from "@/lib/home/rankings";
import { LeaderboardCard } from "./LeaderboardCard";
import { LeaderboardTabs } from "./LeaderboardTabs";
import { SectionHeader } from "./SectionHeader";

// Leaderboards — design/Main.dc.html "LEADERS" + HomeMobile.
// Desktop: 3×2 grid of boards. Mobile: one board at a time behind a
// scrollable pill tablist. Renders nothing until the rankings cron
// has populated the season.
export async function Leaderboards() {
  const { season, boards } = await getHomeRankings();
  if (boards.length === 0) return null;

  return (
    <section className="container-page py-8 md:pt-10 md:pb-[72px]" aria-labelledby="leaders-h">
      <SectionHeader
        id="leaders-h"
        title={
          <>
            Leaderboards{" "}
            <span className="text-muted font-semibold text-base md:text-xl normal-case md:uppercase">
              <span className="hidden md:inline">· {season} regular season</span>
            </span>
          </>
        }
        aside={<span className="md:hidden text-[13px] text-muted">{season} season</span>}
      />

      <div className="hidden md:grid grid-cols-2 lg:grid-cols-3 gap-4">
        {boards.map((b) => (
          <LeaderboardCard key={b.category.key} board={b} />
        ))}
      </div>

      <div className="md:hidden -mx-5">
        <LeaderboardTabs boards={boards} />
      </div>
    </section>
  );
}
