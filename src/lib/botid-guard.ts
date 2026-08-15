// Server-side wrapper around Vercel BotID's checkBotId(). Route
// handlers call it as the FIRST line in their body:
//
//   const botBlock = await botIdGuard();
//   if (botBlock) return botBlock;
//   // ...real handler logic
//
// Keeping the block-response shape in one place means every protected
// route returns the same JSON + headers when it rejects, so clients
// (and future observability) can pattern-match consistently.
//
// The routes that use this MUST also be listed in the BOTID_PROTECT
// array in src/app/layout.tsx AND next.config.ts must be wrapped
// with withBotId() from botid/next/config. Without ALL THREE —
// client-side registration, server-side gate, next.config wrapper —
// checkBotId() never receives the invisible-CAPTCHA signals from
// the browser and either no-ops or fails-closed (marking every
// request as a bot), which is exactly what took the site down on
// 2026-08-15 before the wrapper was added.
//
// Fails OPEN on any checkBotId error. Under the pre-2026-08-15
// behavior a thrown/hung checkBotId would bubble up and 500 the
// route, and a service outage or misconfiguration silently 401'd
// every real browser (the 2026-08-15 incident). Fail-open trades
// strictness for availability: a transient BotID issue can no
// longer take the site down.

import { checkBotId } from "botid/server";
import { NextResponse } from "next/server";

// noindex on every bot-blocked response — belt-and-suspenders alongside
// the same header that most protected routes already set on success
// responses. Cheap; guarantees the block itself never gets indexed.
const BOT_BLOCK_HEADERS = {
  "x-robots-tag": "noindex, nofollow",
} as const;

/**
 * Returns a 401 NextResponse when the request is classified as a bot
 * by Vercel BotID; returns null when the request looks legitimate and
 * the handler should proceed. Fails open on any checkBotId error —
 * transient BotID service issues or misconfiguration cannot take the
 * site down.
 */
export async function botIdGuard(): Promise<NextResponse | null> {
  let isBot = false;
  try {
    const result = await checkBotId();
    isBot = result.isBot;
  } catch (err) {
    // Fail-open on any BotID error. Log so the pattern is visible in
    // Vercel logs if it starts firing at scale (real outage), but
    // never turn a service issue into a 401 for legitimate users.
    console.warn("[botIdGuard] checkBotId threw; failing open:", err);
    return null;
  }
  if (!isBot) return null;
  return NextResponse.json(
    { error: "Blocked" },
    { status: 401, headers: BOT_BLOCK_HEADERS },
  );
}
