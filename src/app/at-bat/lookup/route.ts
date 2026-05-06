import { NextResponse } from "next/server";

// Lookup endpoint for the direct-AB form on /at-bat. Validates the
// query, then 302s to the canonical replay URL. Keeps the parent page
// a pure server component (no client-side router push).
export async function GET(request: Request) {
  const url = new URL(request.url);
  const gamePk = Number(url.searchParams.get("gamePk"));
  const atBatNumber = Number(url.searchParams.get("atBatNumber"));

  if (!Number.isFinite(gamePk) || !Number.isFinite(atBatNumber)) {
    return NextResponse.redirect(new URL("/at-bat", request.url));
  }
  return NextResponse.redirect(
    new URL(`/at-bat/${gamePk}/${atBatNumber}`, request.url),
  );
}
