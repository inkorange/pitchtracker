import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

// Used inside client components. Reads respect RLS.
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
