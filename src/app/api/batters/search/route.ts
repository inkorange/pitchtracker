import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Mirror of /api/pitchers/search for the batter index. Used primarily by
// the AI chat layer to resolve "Soto" / "Lindor" / "Ohtani" into mlb_ids
// for URL construction.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length === 0) {
    return NextResponse.json({ batters: [] });
  }

  const supabase = await createClient();

  if (/^\d+$/.test(q)) {
    const { data, error } = await supabase
      .from("pitch_batters")
      .select("mlb_id, full_name, bats, current_team_id, last_active_year, debut_year")
      .eq("mlb_id", Number(q))
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(
      { batters: data ? [data] : [] },
      { headers: { "cache-control": "public, max-age=300" } },
    );
  }

  if (q.length < 2) {
    return NextResponse.json({ batters: [] });
  }
  const pattern = `%${q}%`;
  const { data, error } = await supabase
    .from("pitch_batters")
    .select("mlb_id, full_name, bats, current_team_id, last_active_year, debut_year")
    .or(`full_name.ilike.${pattern},last_name.ilike.${pattern}`)
    .order("last_active_year", { ascending: false, nullsFirst: false })
    .limit(10);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { batters: data ?? [] },
    { headers: { "cache-control": "public, max-age=60" } },
  );
}
