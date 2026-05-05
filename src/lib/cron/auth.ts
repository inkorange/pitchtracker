import { NextResponse } from "next/server";

// Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` to the cron route.
// We also accept an explicit `?secret=` query param for manual invocations
// during development (e.g. via curl or the browser address bar).
export function verifyCronAuth(request: Request): NextResponse | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }
  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${expected}`) return null;
  const url = new URL(request.url);
  if (url.searchParams.get("secret") === expected) return null;
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
