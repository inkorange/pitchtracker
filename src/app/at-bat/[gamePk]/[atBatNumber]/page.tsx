import { notFound, permanentRedirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { atBatSlug } from "@/lib/url/pitcher-slug";

// Id-only at-bat URL `/at-bat/{gamePk}/{atBatNumber}`. The canonical
// URL is the slugged form `/at-bat/{gamePk}/{atBatNumber}/{slug}`
// (where slug = `{pitcher-slug}-vs-{batter-slug}`) — better for
// matchup queries like "Skenes vs Lindor". This route is kept alive
// only to 308-redirect any legacy / share links to the canonical
// form. The real page logic lives in `[atBatNumber]/[slug]/page.tsx`.

interface PageProps {
  params: Promise<{ gamePk: string; atBatNumber: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AtBatIdRedirect({
  params,
  searchParams,
}: PageProps) {
  const { gamePk, atBatNumber } = await params;
  const sp = await searchParams;
  const gamePkN = Number(gamePk);
  const atBatN = Number(atBatNumber);
  if (!Number.isFinite(gamePkN) || !Number.isFinite(atBatN)) notFound();

  const supabase = await createClient();
  // Resolve the AB's pitcher and batter so the redirect target carries
  // both names. One pitch row is enough — pitcher/batter are stable
  // across an at-bat. Falls back to "player" slug only if the AB
  // doesn't exist or has no pitcher_id.
  const { data: pitch } = await supabase
    .from("pitch_game_pitches")
    .select("pitcher_id, batter_id")
    .eq("game_pk", gamePkN)
    .eq("at_bat_number", atBatN)
    .order("pitch_number", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!pitch) notFound();

  const [pitcherRes, batterRes] = await Promise.all([
    pitch.pitcher_id
      ? supabase
          .from("pitch_pitchers")
          .select("full_name")
          .eq("mlb_id", pitch.pitcher_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    pitch.batter_id
      ? supabase
          .from("pitch_batters")
          .select("full_name")
          .eq("mlb_id", pitch.batter_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const pitcherName = pitcherRes.data?.full_name ?? "player";
  const batterName = batterRes.data?.full_name ?? null;

  // Preserve search params on the redirect so deep links
  // (?event=&pitch=&camera=) survive the canonical-URL hop.
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string" && v.length > 0) qs.set(k, v);
  }
  const tail = qs.toString();
  permanentRedirect(
    `/at-bat/${gamePkN}/${atBatN}/${atBatSlug(pitcherName, batterName)}${tail ? `?${tail}` : ""}`,
  );
}
