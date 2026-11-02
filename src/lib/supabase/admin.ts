import "server-only";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env.server";

/**
 * Service-role client. BYPASSES RLS – only use in server code after validating input.
 * Never import this from a client component (the "server-only" import enforces it).
 */
export function createServiceClient() {
  return createClient(serverEnv.supabaseUrl, serverEnv.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
