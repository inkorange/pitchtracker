// Small server-side helper that wraps checkBotId() from botid/server
// and returns a canned 401 NextResponse when the request looks like
// a bot. Route handlers call it as the FIRST line in their body:
//
//   const botBlock = await botIdGuard();
//   if (botBlock) return botBlock;
//   // ...real handler logic
//
// Keeping the block-response shape in one place means every protected
// route returns the same JSON shape + headers when it rejects, so
// clients (and future observability) can pattern-match consistently.
//
// The routes that use this MUST also be listed in the BOTID_PROTECT
// array in src/app/layout.tsx — the client-side <BotIdClient> in the
// root layout head reads that list to know which requests to inject
// its signal-collection headers on. Without both the client-side
// registration AND the server-side gate, protection is a no-op.

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
 * the handler should proceed. Never throws — a BotID service outage
 * currently fails-open (isBot=false), which is the intended trade-off
 * for a public read-only site (favor availability over strictness).
 */
export async function botIdGuard(): Promise<NextResponse | null> {
  const { isBot } = await checkBotId();
  if (!isBot) return null;
  return NextResponse.json(
    { error: "Blocked" },
    { status: 401, headers: BOT_BLOCK_HEADERS },
  );
}
