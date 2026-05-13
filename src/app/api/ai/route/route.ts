import { NextResponse } from "next/server";
import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { AI_SYSTEM_PROMPT } from "@/lib/ai/system-prompt";
import { checkAiRateLimit, clientIpFromRequest } from "@/lib/ai/rate-limit";

export const maxDuration = 30;

// Multi-turn chat-to-URL translator. The model uses search_pitcher /
// search_batter to resolve names to mlb_ids, then calls `navigate(url)`
// to terminate the loop with the final URL the client should redirect to.
//
// Auth model: public endpoint with IP-based rate limiting. Anonymous users
// can spam this and we pay per call, so we cap at 10/min and 100/day per
// IP — generous for real use, restrictive enough to keep monthly cost
// bounded if scraped.

const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(2000),
});

const BodySchema = z.object({
  messages: z.array(MessageSchema).min(1).max(20),
  currentUrl: z.string().max(500).optional(),
});

export async function POST(request: Request) {
  // Block in environments where the gateway isn't configured. Local dev
  // without AI_GATEWAY_API_KEY would otherwise return cryptic 401s from
  // the SDK.
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL) {
    return NextResponse.json(
      {
        error:
          "AI chat is not configured. Set AI_GATEWAY_API_KEY in .env.local or deploy to Vercel.",
      },
      { status: 503 },
    );
  }

  const ip = clientIpFromRequest(request);
  const rl = checkAiRateLimit(ip);
  if (!rl.ok) {
    return NextResponse.json(
      {
        error:
          rl.reason === "minute"
            ? "You're sending messages too fast. Please wait a minute."
            : "Daily message limit reached. Try again tomorrow.",
        retryAfterSeconds: rl.retryAfterSeconds,
      },
      {
        status: 429,
        headers: rl.retryAfterSeconds
          ? { "retry-after": String(rl.retryAfterSeconds) }
          : undefined,
      },
    );
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const supabase = await createClient();

  let navigateUrl: string | null = null;

  // Resolve the "active pitcher" from the URL so the model has a strong
  // grounding for pronouns like "his last game" without needing to
  // re-derive it from chat history. /pitcher/{id} parses directly; for
  // /at-bat/{game_pk}/{atBat} we look up the actual pitcher_id from
  // pitch_game_pitches because the at-bat URL alone doesn't name them.
  const today = new Date().toISOString().slice(0, 10);
  const pageContext = await derivePageContext(body.currentUrl ?? null, supabase);
  const contextLine = [
    body.currentUrl
      ? `Current page the user is on: ${body.currentUrl}`
      : "User is not currently on a specific page.",
    pageContext,
  ]
    .filter(Boolean)
    .join("\n");
  const system = `${AI_SYSTEM_PROMPT}\n\nToday's date is ${today}.\n${contextLine}`;

  try {
    const result = await generateText({
      model: "anthropic/claude-haiku-4-5",
      system,
      messages: body.messages,
      stopWhen: stepCountIs(8),
      tools: {
        search_pitcher: tool({
          description:
            "Resolve a pitcher's name to one or more candidate mlb_ids. Returns up to 10 matches.",
          inputSchema: z.object({
            name: z.string().describe("Full name, last name, or partial name"),
          }),
          execute: async ({ name }) => {
            const trimmed = name.trim();
            if (trimmed.length < 2) return { pitchers: [] };
            const pattern = `%${trimmed}%`;
            const { data, error } = await supabase
              .from("pitch_pitchers")
              .select(
                "mlb_id, full_name, throws, current_team_id, last_active_year, debut_year",
              )
              .or(`full_name.ilike.${pattern},last_name.ilike.${pattern}`)
              .order("last_active_year", { ascending: false, nullsFirst: false })
              .limit(10);
            if (error) return { pitchers: [], error: error.message };
            return { pitchers: data ?? [] };
          },
        }),
        search_batter: tool({
          description:
            "Resolve a batter's name to one or more candidate mlb_ids. Returns up to 10 matches.",
          inputSchema: z.object({
            name: z.string().describe("Full name, last name, or partial name"),
          }),
          execute: async ({ name }) => {
            const trimmed = name.trim();
            if (trimmed.length < 2) return { batters: [] };
            const pattern = `%${trimmed}%`;
            const { data, error } = await supabase
              .from("pitch_batters")
              .select(
                "mlb_id, full_name, bats, current_team_id, last_active_year, debut_year",
              )
              .or(`full_name.ilike.${pattern},last_name.ilike.${pattern}`)
              .order("last_active_year", { ascending: false, nullsFirst: false })
              .limit(10);
            if (error) return { batters: [], error: error.message };
            return { batters: data ?? [] };
          },
        }),
        get_pitcher_recent_games: tool({
          description:
            "Look up a pitcher's most recent games they pitched in. Returns game_pk, date, and opponent team IDs ordered by date desc. Use this to resolve 'his last game' / 'his most recent start' on a pitcher page.",
          inputSchema: z.object({
            pitcher_id: z.number().int(),
            limit: z.number().int().min(1).max(20).default(5),
          }),
          execute: async ({ pitcher_id, limit }) => {
            // Use pitch_pitcher_games to filter for games this pitcher
            // actually pitched in (vs every game his team played), then
            // join pitch_games for date + opponent metadata.
            const { data: mappings, error: mErr } = await supabase
              .from("pitch_pitcher_games")
              .select("game_pk")
              .eq("pitcher_id", pitcher_id);
            if (mErr) return { games: [], error: mErr.message };
            const gamePks = (mappings ?? []).map((m) => m.game_pk);
            if (gamePks.length === 0) return { games: [] };
            const { data, error } = await supabase
              .from("pitch_games")
              .select(
                "game_pk, game_date, home_team_id, away_team_id, status, venue_name",
              )
              .in("game_pk", gamePks)
              .order("game_date", { ascending: false })
              .limit(limit);
            if (error) return { games: [], error: error.message };
            return { games: data ?? [] };
          },
        }),
        navigate: tool({
          description:
            "Send the user to a URL on pitchtracker. Always a relative path starting with /.",
          inputSchema: z.object({
            url: z
              .string()
              .startsWith("/", "Must be a relative path starting with /")
              .max(500),
          }),
          execute: async ({ url }) => {
            navigateUrl = url;
            return { ok: true };
          },
        }),
      },
    });

    if (navigateUrl) {
      return NextResponse.json({ url: navigateUrl, message: result.text || null });
    }

    return NextResponse.json({ url: null, message: result.text || "" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// Given the URL the user is currently on, look up the "active pitcher"
// (if any) and surface their name + mlb_id to the model. This is the
// strongest anti-clarification signal we can pass — pronouns like "his
// last game" resolve immediately without needing chat-history inference.
async function derivePageContext(
  currentUrl: string | null,
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string> {
  if (!currentUrl) return "";
  const pathname = currentUrl.split("?")[0] ?? currentUrl;

  // /pitcher/{id} — pitcher_id is right there in the URL.
  const pitcherMatch = pathname.match(/^\/pitcher\/(\d+)/);
  if (pitcherMatch) {
    const pitcherId = Number(pitcherMatch[1]);
    const { data } = await supabase
      .from("pitch_pitchers")
      .select("mlb_id, full_name")
      .eq("mlb_id", pitcherId)
      .maybeSingle();
    if (data) {
      return `Active pitcher in context: ${data.full_name} (mlb_id: ${data.mlb_id}). When the user says "his/her", they mean this pitcher.`;
    }
  }

  // /at-bat/{game_pk}/{atBatNumber} — pitcher_id lives on the at-bat's
  // pitch rows. We just need any pitch in that AB to find them.
  const atBatMatch = pathname.match(/^\/at-bat\/(\d+)\/(\d+)/);
  if (atBatMatch) {
    const gamePk = Number(atBatMatch[1]);
    const atBatNumber = Number(atBatMatch[2]);
    const { data: pitch } = await supabase
      .from("pitch_game_pitches")
      .select("pitcher_id, batter_id")
      .eq("game_pk", gamePk)
      .eq("at_bat_number", atBatNumber)
      .limit(1)
      .maybeSingle();
    if (pitch?.pitcher_id) {
      const { data: p } = await supabase
        .from("pitch_pitchers")
        .select("mlb_id, full_name")
        .eq("mlb_id", pitch.pitcher_id)
        .maybeSingle();
      const { data: b } = pitch.batter_id
        ? await supabase
            .from("pitch_batters")
            .select("mlb_id, full_name")
            .eq("mlb_id", pitch.batter_id)
            .maybeSingle()
        : { data: null };
      const parts: string[] = [];
      if (p) {
        parts.push(
          `Active pitcher in context: ${p.full_name} (mlb_id: ${p.mlb_id}). When the user says "his/her" without naming someone else, they mean this pitcher.`,
        );
      }
      if (b) {
        parts.push(
          `Active batter in this at-bat: ${b.full_name} (mlb_id: ${b.mlb_id}).`,
        );
      }
      parts.push(`Game pk in context: ${gamePk}.`);
      return parts.join("\n");
    }
  }

  // /at-bat/{game_pk} — at-bat list for the game. We don't surface a
  // single pitcher (the game has multiple), but the game_pk is useful.
  const gameMatch = pathname.match(/^\/at-bat\/(\d+)$/);
  if (gameMatch) {
    return `Game pk in context: ${gameMatch[1]}.`;
  }

  return "";
}
