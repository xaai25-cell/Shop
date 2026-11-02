import "server-only";
import { SUPABASE_ANON_KEY, SUPABASE_URL, assertSupabaseConfig } from "@/lib/supabase/keys";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const serverEnv = {
  get supabaseUrl() {
    assertSupabaseConfig();
    return SUPABASE_URL;
  },
  get supabaseAnonKey() {
    assertSupabaseConfig();
    return SUPABASE_ANON_KEY;
  },
  /** Accepts the classic service_role key or the newer "secret" key name. */
  get serviceRoleKey() {
    const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? "").trim();
    if (!key) throw new Error("Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY)");
    return key;
  },
  get orderTokenSecret() {
    const s = required("ORDER_TOKEN_SECRET");
    if (s.length < 32) throw new Error("ORDER_TOKEN_SECRET must be at least 32 characters");
    return s;
  },
  get deliveryFee() {
    const n = Number(process.env.DELIVERY_FEE ?? 0);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  },
};
