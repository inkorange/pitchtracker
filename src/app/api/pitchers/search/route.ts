import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return NextResponse.json({ pitchers: [] });
  }

  const supabase = await createClient();
  const pattern = `%${q}%`;

  const { data, error } = await supabase
    .from("pitch_pitchers")
    .select("mlb_id, full_name, throws, current_team_id, last_active_year, debut_year")
    .or(`full_name.ilike.${pattern},last_name.ilike.${pattern}`)
    .order("last_active_year", { ascending: false, nullsFirst: false })
    .limit(10);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { pitchers: data ?? [] },
    { headers: { "cache-control": "public, max-age=60" } },
  );
}
