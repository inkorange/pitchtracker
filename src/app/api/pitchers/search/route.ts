import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length === 0) {
    return NextResponse.json({ pitchers: [] });
  }

  const supabase = await createClient();

  // Numeric query → treat as an mlb_id lookup. Used by the explore
  // picker to resolve names for pitcher IDs that arrived via shared
  // URL or example query — without this the chip falls back to
  // "Pitcher #694973" until the user re-types the name.
  if (/^\d+$/.test(q)) {
    const { data, error } = await supabase
      .from("pitch_pitchers")
      .select("mlb_id, full_name, throws, current_team_id, last_active_year, debut_year")
      .eq("mlb_id", Number(q))
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(
      { pitchers: data ? [data] : [] },
      { headers: { "cache-control": "public, max-age=300" } },
    );
  }

  // Text query → name search. Two-character minimum so we don't fan
  // out a wildcard scan on every keystroke.
  if (q.length < 2) {
    return NextResponse.json({ pitchers: [] });
  }
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
