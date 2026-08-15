// Generic in-memory per-IP rate limiter — two windows (short burst
// per minute + soft daily cap), keyed by (bucket-name, ip). Reused
// by any route that needs cheap anti-abuse without pulling in a
// Redis/KV dependency.
//
// Extracted from src/lib/ai/rate-limit.ts (which was AI-only) so the
// exposed /api/at-bat/[gamePk]/[atBatNumber]/pitches route can share
// the same mechanism.
//
// Caveats (unchanged from the original AI-only version):
// - Memory-only. Each serverless instance has its own state, so a
//   client landing on different instances effectively gets a higher
//   cap. Fluid Compute's instance reuse keeps this reasonable for an
//   anti-spam measure; if abuse becomes real move to Upstash/KV.
// - Keyed by first x-forwarded-for hop. Behind carrier-grade NAT
//   this aggregates traffic — acceptable trade-off for a free tool.
// - Buckets are namespaced by `bucket` so two routes' counters
//   don't cross-contaminate.

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * 60_000;

interface Window {
  count: number;
  resetAt: number;
}

interface Bucket {
  minute: Window;
  day: Window;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  ok: boolean;
  retryAfterSeconds?: number;
  reason?: "minute" | "day";
}

export interface RateLimitOptions {
  perMinute: number;
  perDay: number;
}

export function checkRateLimit(
  bucketName: string,
  ip: string,
  opts: RateLimitOptions,
): RateLimitResult {
  const now = Date.now();
  const key = `${bucketName}:${ip}`;
  let b = buckets.get(key);
  if (!b) {
    b = {
      minute: { count: 0, resetAt: now + MINUTE_MS },
      day: { count: 0, resetAt: now + DAY_MS },
    };
    buckets.set(key, b);
  }

  if (now >= b.minute.resetAt) {
    b.minute = { count: 0, resetAt: now + MINUTE_MS };
  }
  if (now >= b.day.resetAt) {
    b.day = { count: 0, resetAt: now + DAY_MS };
  }

  if (b.minute.count >= opts.perMinute) {
    return {
      ok: false,
      reason: "minute",
      retryAfterSeconds: Math.ceil((b.minute.resetAt - now) / 1000),
    };
  }
  if (b.day.count >= opts.perDay) {
    return {
      ok: false,
      reason: "day",
      retryAfterSeconds: Math.ceil((b.day.resetAt - now) / 1000),
    };
  }

  b.minute.count += 1;
  b.day.count += 1;
  return { ok: true };
}

export function clientIpFromRequest(req: Request): string {
  // x-forwarded-for is "client, proxy1, proxy2..." — first entry is
  // the real client when Vercel injects it.
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const xr = req.headers.get("x-real-ip");
  if (xr) return xr;
  return "anon";
}
