import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL, assertSupabaseConfig } from "@/lib/supabase/keys";

/**
 * Cookie-less anonymous client for public catalog reads.
 * Lets storefront pages be statically cached / revalidated (no cookies() call).
 */
export function createPublicClient() {
  assertSupabaseConfig();
  return createSupabaseClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
