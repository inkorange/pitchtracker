// Tiny in-memory IP-based rate limiter for the AI chat endpoint.
// Two windows: a short burst limit (per minute) and a daily soft cap.
//
// Caveats:
// - Memory-only. Each serverless instance has its own state, so a user
//   landing on different instances effectively gets a higher cap. With
//   Fluid Compute's instance reuse this is usually fine for an anti-spam
//   measure; if abuse becomes real we'd move this to Upstash/KV.
// - Keyed by IP from `x-forwarded-for`. Behind shared NATs (carrier-grade)
//   this aggregates traffic — acceptable trade-off for a free tool.

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * 60_000;

const PER_MINUTE_LIMIT = 10;
const PER_DAY_LIMIT = 100;

interface Bucket {
  minute: { count: number; resetAt: number };
  day: { count: number; resetAt: number };
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  ok: boolean;
  retryAfterSeconds?: number;
  reason?: "minute" | "day";
}

export function checkAiRateLimit(ip: string): RateLimitResult {
  const now = Date.now();
  let b = buckets.get(ip);
  if (!b) {
    b = {
      minute: { count: 0, resetAt: now + MINUTE_MS },
      day: { count: 0, resetAt: now + DAY_MS },
    };
    buckets.set(ip, b);
  }

  if (now >= b.minute.resetAt) {
    b.minute = { count: 0, resetAt: now + MINUTE_MS };
  }
  if (now >= b.day.resetAt) {
    b.day = { count: 0, resetAt: now + DAY_MS };
  }

  if (b.minute.count >= PER_MINUTE_LIMIT) {
    return {
      ok: false,
      reason: "minute",
      retryAfterSeconds: Math.ceil((b.minute.resetAt - now) / 1000),
    };
  }
  if (b.day.count >= PER_DAY_LIMIT) {
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
  // x-forwarded-for is "client, proxy1, proxy2..." — first entry is the
  // real client when Vercel injects it.
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const xr = req.headers.get("x-real-ip");
  if (xr) return xr;
  return "anon";
}
