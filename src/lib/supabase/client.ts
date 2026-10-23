import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

const DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === "1";

export function isSupabaseConfigured(): boolean {
  if (DEMO) return true;
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

let client: SupabaseClient | null = null;

/** Browser client (singleton). Session lives in cookies so the proxy can read it. */
export function getSupabase(): SupabaseClient {
  if (DEMO) {
    // Local demo/QA only: in-memory data, no network. Never enabled in production.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("./demo").demoClient as unknown as SupabaseClient;
  }
  if (!client) {
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    );
  }
  return client;
}
