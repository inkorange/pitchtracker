import { Ticker, type TickerItem } from "@/components/broadcast";
import { getHomeRankings } from "@/lib/home/rankings";

// Leaders crawl under the hero: the #1 pitcher in each leaderboard
// category. Shares getHomeRankings() with the Leaderboards section.
export async function HomeTicker() {
  const { season, boards } = await getHomeRankings();
  const items: TickerItem[] = boards.flatMap((b) => {
    const top = b.rows[0];
    if (!top) return [];
    const unit = b.category.unit === "°" ? "°" : "";
    return [{ k: b.category.tickerKey, name: top.name, v: `${top.value}${unit}` }];
  });
  return <Ticker items={items} label={`${season} Leaders`} />;
}
