// AI-chat rate limit — thin wrapper over the generic per-IP limiter
// in src/lib/rate-limit.ts. Kept as its own module so route callers
// don't need to know the bucket name or the specific per-minute /
// per-day thresholds for the AI endpoint.

import {
  checkRateLimit,
  clientIpFromRequest,
  type RateLimitResult,
} from "@/lib/rate-limit";

const PER_MINUTE_LIMIT = 10;
const PER_DAY_LIMIT = 100;

export function checkAiRateLimit(ip: string): RateLimitResult {
  return checkRateLimit("ai", ip, {
    perMinute: PER_MINUTE_LIMIT,
    perDay: PER_DAY_LIMIT,
  });
}

// Re-export clientIpFromRequest so existing AI-route imports keep
// working without changing their import path.
export { clientIpFromRequest };
export type { RateLimitResult };
