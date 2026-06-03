import { NextResponse } from "next/server";
import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { AI_SYSTEM_PROMPT } from "@/lib/ai/system-prompt";
import { checkAiRateLimit, clientIpFromRequest } from "@/lib/ai/rate-limit";
import { getPitchLabel } from "@/lib/viz/colors";
import { buildSequencingMatrix } from "@/lib/pitch/sequencingMatrix";
import {
  buildSequencingDrift,
  type DriftPitch,
} from "@/lib/pitch/sequencingDrift";
import {
  buildArsenalShape,
  type ShapePitch,
} from "@/lib/pitch/arsenalShape";

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
            "Resolve a pitcher's name to one or more candidate mlb_ids. Uses phonetic matching so misspellings and speech-to-text errors (e.g. 'McClain' → 'McLean') still resolve. Each result has a `match_kind` of 'exact' or 'phonetic'. Returns up to 10 matches.",
          inputSchema: z.object({
            name: z.string().describe("Full name, last name, or partial name"),
          }),
          execute: async ({ name }) => {
            const trimmed = name.trim();
            if (trimmed.length < 2) return { pitchers: [] };
            const { data, error } = await supabase.rpc("pitch_search_pitchers", {
              p_query: trimmed,
              p_limit: 10,
            });
            if (error) return { pitchers: [], error: error.message };
            return { pitchers: data ?? [] };
          },
        }),
        search_batter: tool({
          description:
            "Resolve a batter's name to one or more candidate mlb_ids. Uses phonetic matching so misspellings still resolve. Each result has a `match_kind` of 'exact' or 'phonetic'. Returns up to 10 matches.",
          inputSchema: z.object({
            name: z.string().describe("Full name, last name, or partial name"),
          }),
          execute: async ({ name }) => {
            const trimmed = name.trim();
            if (trimmed.length < 2) return { batters: [] };
            const { data, error } = await supabase.rpc("pitch_search_batters", {
              p_query: trimmed,
              p_limit: 10,
            });
            if (error) return { batters: [], error: error.message };
            return { batters: data ?? [] };
          },
        }),
        get_pitcher_stats: tool({
          description:
            "Look up a pitcher's aggregate stats per pitch type for a season — avg velocity, avg spin rate, whiff rate, called-strike rate, batting average against, run value, usage %. Returns one row per (pitch_type, batter_hand) pair. To produce an overall figure across both batter handedness, take a pitch_count-weighted average. Use this when the user asks 'what's his average X' / 'how hard does he throw his fastball' / 'whiff rate on his slider' etc.",
          inputSchema: z.object({
            pitcher_id: z.number().int(),
            season: z
              .number()
              .int()
              .optional()
              .describe("Defaults to the current MLB season."),
          }),
          execute: async ({ pitcher_id, season }) => {
            const s = season ?? new Date().getFullYear();
            const { data, error } = await supabase
              .from("pitch_pitcher_aggregates")
              .select(
                "pitch_type, batter_hand, pitch_count, usage_pct, avg_velocity, avg_spin_rate, avg_vertical_break, avg_horizontal_break, avg_induced_vertical_break, whiff_rate, called_strike_rate, batting_avg_against, run_value_per_100",
              )
              .eq("pitcher_id", pitcher_id)
              .eq("season", s);
            if (error) return { stats: [], error: error.message };
            // Inject the human-readable label per row so the LLM
            // doesn't have to (mis)remember the Statcast code →
            // name mapping. ST and SV both label as "Sweeper" here,
            // matching what the UI renders.
            const stats = (data ?? []).map((row) => ({
              ...row,
              pitch_label: row.pitch_type ? getPitchLabel(row.pitch_type) : null,
            }));
            return { season: s, stats };
          },
        }),
        get_at_bats_in_game: tool({
          description:
            "List every at-bat in a game with its terminating event (strikeout / strikeout_double_play / walk / single / home_run / field_out / etc.), batter_id, and inning. Use to answer 'show me all the strikeouts in this game' — call this with the game_pk, filter the result to ABs whose events match the user's intent, then navigate to /at-bat/{game_pk}/{first_match.at_bat_number}?event=<chip_key> so the replay sidebar arrives pre-filtered. Chip keys: strikeout, walk, hit, home_run, out, hit_by_pitch.",
          inputSchema: z.object({
            game_pk: z.number().int(),
          }),
          execute: async ({ game_pk }) => {
            // Terminating pitches only — `events` is non-null only on
            // the last pitch of each AB. One row per at-bat.
            const { data, error } = await supabase
              .from("pitch_game_pitches")
              .select(
                "at_bat_number, events, batter_id, pitcher_id, inning, inning_topbot",
              )
              .eq("game_pk", game_pk)
              .not("events", "is", null)
              .order("at_bat_number", { ascending: true });
            if (error) return { at_bats: [], error: error.message };
            return { at_bats: data ?? [] };
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
        get_pitcher_sequencing: tool({
          description:
            "Return the pitcher's pitch-sequencing matrix for a season, optionally narrowed to a specific batter. Use this when the user asks you to EXPLAIN / DESCRIBE / SUMMARIZE how a pitcher attacks at-bats — either overall ('how does Sandy sequence his pitches') or vs a specific batter ('explain his sequencing vs James Wood'). Returns first-pitch distribution and the conditional (after pitch X → next pitch Y) matrix as percentages with raw counts. Reply with a SHORT data-driven summary (3-5 sentences max) — do NOT navigate, the user wants the analysis in chat, not a page jump.",
          inputSchema: z.object({
            pitcher_id: z.number().int(),
            batter_id: z
              .number()
              .int()
              .optional()
              .describe(
                "When set, narrows the matrix to ABs where this batter faced the pitcher. Pull from the page-context vsBatter line when the user is on the pitcher page with a batter selected.",
              ),
            season: z
              .number()
              .int()
              .optional()
              .describe("Defaults to the current MLB season."),
          }),
          execute: async ({ pitcher_id, batter_id, season }) => {
            const s = season ?? new Date().getFullYear();
            let q = supabase
              .from("pitch_game_pitches")
              .select(
                "game_pk, at_bat_number, pitch_number, pitch_type, pitch_games!inner(season, game_type)",
              )
              .eq("pitcher_id", pitcher_id)
              .eq("pitch_games.season", s)
              .eq("pitch_games.game_type", "R")
              .range(0, 4999);
            if (batter_id != null) q = q.eq("batter_id", batter_id);
            const { data, error } = await q;
            if (error) return { error: error.message };
            const matrix = buildSequencingMatrix(data ?? []);
            // Flatten to a model-friendly shape: percent + raw count
            // per cell, pitch labels included so the model doesn't
            // have to translate Statcast codes.
            const firstPitchTotal = matrix.firstPitchCounts.reduce(
              (s, n) => s + n,
              0,
            );
            return {
              season: s,
              batter_id: batter_id ?? null,
              total_at_bats: matrix.totalAtBats,
              total_pairs: matrix.totalTransitions,
              first_pitch: matrix.pitchTypes
                .map((pt, i) => ({
                  pitch_type: pt,
                  label: getPitchLabel(pt),
                  count: matrix.firstPitchCounts[i],
                  pct:
                    firstPitchTotal > 0
                      ? Math.round(
                          (matrix.firstPitchCounts[i] / firstPitchTotal) * 100,
                        )
                      : 0,
                }))
                .filter((r) => r.count > 0),
              after: matrix.pitchTypes
                .map((pt, i) => {
                  const rowTotal = matrix.transitionTotals[i];
                  return {
                    from_pitch_type: pt,
                    from_label: getPitchLabel(pt),
                    total: rowTotal,
                    next: matrix.pitchTypes
                      .map((next, j) => ({
                        pitch_type: next,
                        label: getPitchLabel(next),
                        count: matrix.transitions[i][j],
                        pct:
                          rowTotal > 0
                            ? Math.round(
                                (matrix.transitions[i][j] / rowTotal) * 100,
                              )
                            : 0,
                      }))
                      .filter((r) => r.count > 0),
                  };
                })
                .filter((r) => r.total > 0),
            };
          },
        }),
        get_pitcher_sequencing_drift: tool({
          description:
            "Return the per-game sequencing drift timeline for a pitcher's season — how much each start's sequence pattern departed from the season baseline (Total Variation Distance, 0=same, 1=completely different). Use this when the user asks about CONSISTENCY / CHANGES in approach across games: 'has he changed his approach', 'when did he start mixing differently', 'spike games', 'is he sequencing the same every start', 'did anything change after the all-star break'. Returns one entry per game with date, AB count, pitch count, and drift value. Reply with a short data-driven narrative — call out specific dates / opponents with high drift, note the typical baseline, and any visible trend. Do NOT navigate.",
          inputSchema: z.object({
            pitcher_id: z.number().int(),
            season: z
              .number()
              .int()
              .optional()
              .describe("Defaults to the current MLB season."),
          }),
          execute: async ({ pitcher_id, season }) => {
            const s = season ?? new Date().getFullYear();
            const { data, error } = await supabase
              .from("pitch_game_pitches")
              .select(
                "game_pk, at_bat_number, pitch_number, pitch_type, pitch_games!inner(season, game_type, game_date)",
              )
              .eq("pitcher_id", pitcher_id)
              .eq("pitch_games.season", s)
              .eq("pitch_games.game_type", "R")
              .range(0, 4999);
            if (error) return { error: error.message };
            type Row = {
              game_pk: number;
              at_bat_number: number;
              pitch_number: number;
              pitch_type: string | null;
              pitch_games: { game_date: string } | null;
            };
            const driftPitches: DriftPitch[] = (data ?? [])
              .map((r) => r as unknown as Row)
              .filter((r): r is Row & { pitch_games: { game_date: string } } =>
                !!r.pitch_games?.game_date,
              )
              .map((r) => ({
                game_pk: r.game_pk,
                at_bat_number: r.at_bat_number,
                pitch_number: r.pitch_number,
                pitch_type: r.pitch_type,
                game_date: r.pitch_games.game_date,
              }));
            const drift = buildSequencingDrift(driftPitches);
            return {
              season: s,
              min_pitches_per_game: drift.minPitchesPerGame,
              min_transitions_per_game: drift.minTransitionsPerGame,
              season_at_bats: drift.seasonAtBats,
              games: drift.games
                .filter(
                  (g) =>
                    g.pitchCount >= drift.minPitchesPerGame &&
                    g.transitionCount >= drift.minTransitionsPerGame,
                )
                .map((g) => ({
                  game_pk: g.game_pk,
                  game_date: g.game_date,
                  pitch_count: g.pitchCount,
                  ab_count: g.atBatCount,
                  drift_pct: Math.round(g.drift * 100),
                })),
            };
          },
        }),
        get_pitcher_arsenal_shape: tool({
          description:
            "Return per-pitch-type shape data the user is staring at on the stats page: release-point centroid + spread (the Release point cluster card), vertical approach angle (the VAA bars card), and plate-location centroid + in-zone share (the Locations heat map). Use this whenever the user asks about ANY of those three cards — 'what does the release cloud show here', 'is his release tunneled', 'how steep is his curve', 'where does he live with his slider', 'is he in the zone with the fastball'. Each pitch type returns: release_x_avg / release_z_avg / release_x_spread / release_z_spread (ft), vaa_avg (deg, negative = descending), plate_x_avg / plate_z_avg (ft; plate_x positive = third-base side from catcher POV), in_zone_pct. Reply with a 2-3 sentence read using the actual numbers — translate plate_x to arm-side / glove-side using `pitcher_throws`. Do NOT navigate.",
          inputSchema: z.object({
            pitcher_id: z.number().int(),
            season: z
              .number()
              .int()
              .optional()
              .describe("Defaults to the current MLB season."),
          }),
          execute: async ({ pitcher_id, season }) => {
            const s = season ?? new Date().getFullYear();
            const [{ data: pitcher }, { data, error }] = await Promise.all([
              supabase
                .from("pitch_pitchers")
                .select("throws")
                .eq("mlb_id", pitcher_id)
                .maybeSingle(),
              supabase
                .from("pitch_game_pitches")
                .select(
                  "pitch_type, release_pos_x, release_pos_z, plate_x, plate_z, vy0, vz0, az, pitch_games!inner(season, game_type)",
                )
                .eq("pitcher_id", pitcher_id)
                .eq("pitch_games.season", s)
                .eq("pitch_games.game_type", "R")
                .range(0, 4999),
            ]);
            if (error) return { error: error.message };
            const rows = (data ?? []) as ShapePitch[];
            const throws =
              pitcher?.throws === "L" || pitcher?.throws === "R"
                ? pitcher.throws
                : null;
            const shape = buildArsenalShape(rows, throws);
            // Round to a single decimal so the model isn't tempted to
            // quote spurious precision back to the user.
            return {
              season: s,
              pitcher_throws: shape.pitcher_throws,
              pitch_types: shape.pitch_types.map((r) => ({
                pitch_type: r.pitch_type,
                label: r.label,
                count: r.count,
                release_x_avg: round1(r.release_x_avg),
                release_z_avg: round1(r.release_z_avg),
                release_x_spread: round2(r.release_x_spread),
                release_z_spread: round2(r.release_z_spread),
                vaa_avg: round1(r.vaa_avg),
                plate_x_avg: round2(r.plate_x_avg),
                plate_z_avg: round2(r.plate_z_avg),
                in_zone_pct: Math.round(r.in_zone_pct),
              })),
            };
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

// Tool-output rounding helpers. Keeping reply numbers at one decimal
// (or two for the fine-grained plate/release coords) keeps the model
// from quoting spurious precision like "2.187 feet" back to the user.
function round1(n: number | null): number | null {
  return n == null ? null : Math.round(n * 10) / 10;
}
function round2(n: number | null): number | null {
  return n == null ? null : Math.round(n * 100) / 100;
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
  // Best-effort query parse — currentUrl may be relative ("/pitcher/X?…")
  // so we prepend a dummy origin to keep URL constructor happy.
  let queryParams: URLSearchParams;
  try {
    queryParams = new URL(currentUrl, "http://x").searchParams;
  } catch {
    queryParams = new URLSearchParams();
  }

  // /pitcher/{id} — pitcher_id is right there in the URL.
  const pitcherMatch = pathname.match(/^\/pitcher\/(\d+)/);
  if (pitcherMatch) {
    const pitcherId = Number(pitcherMatch[1]);
    const vsBatterRaw = queryParams.get("vsBatter");
    const vsBatterId = vsBatterRaw ? Number(vsBatterRaw) : null;
    const seasonRaw = queryParams.get("season");
    const season =
      seasonRaw && !Number.isNaN(Number(seasonRaw)) ? Number(seasonRaw) : null;
    const [{ data: p }, { data: b }] = await Promise.all([
      supabase
        .from("pitch_pitchers")
        .select("mlb_id, full_name")
        .eq("mlb_id", pitcherId)
        .maybeSingle(),
      vsBatterId != null && Number.isFinite(vsBatterId)
        ? supabase
            .from("pitch_batters")
            .select("mlb_id, full_name")
            .eq("mlb_id", vsBatterId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    if (p) {
      const parts: string[] = [];
      parts.push(
        `Active pitcher in context: ${p.full_name} (mlb_id: ${p.mlb_id}). When the user says "his/her", they mean this pitcher.`,
      );
      if (b) {
        parts.push(
          `Active batter in context (vsBatter): ${b.full_name} (mlb_id: ${b.mlb_id}). When the user asks about "his sequencing here" or "how he attacks this batter", pass BOTH pitcher_id and batter_id to get_pitcher_sequencing.`,
        );
      }
      if (season != null) parts.push(`Season in context: ${season}.`);
      return parts.join("\n");
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
