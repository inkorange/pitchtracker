import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

// Cookieless read-only client for public Server Components.
//
// There's no auth in the app yet — every RLS policy on the pitch_*
// tables is `public read`. Reading cookies just to set up an SSR
// session would force every page that calls this into Next.js's
// dynamic-render path and prevent edge caching, with zero functional
// benefit. Dropping the cookie bridge lets the framework treat the
// pitcher / at-bat / browse routes as eligible for CDN caching, which
// is what lifts Google's per-site crawl ceiling.
//
// Kept as `async function` to preserve the existing `await
// createClient()` call shape across the app; if/when auth lands we
// swap back to `createServerClient` from `@supabase/ssr` + the
// cookies bridge inside this function and every caller keeps working.
export async function createClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
