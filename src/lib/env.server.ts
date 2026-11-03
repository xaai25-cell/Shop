import "server-only";
import { createHash } from "crypto";
import { SUPABASE_ANON_KEY, SUPABASE_URL, assertSupabaseConfig } from "@/lib/supabase/keys";

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
  /**
   * Secret used to sign customer order links and salt rate-limit keys.
   * Uses ORDER_TOKEN_SECRET when set; otherwise derives one from the Supabase
   * server secrets (never sent to the browser), so the site still works if the
   * variable was forgotten. Set ORDER_TOKEN_SECRET explicitly for best practice.
   */
  get orderTokenSecret() {
    const explicit = (process.env.ORDER_TOKEN_SECRET ?? "").trim();
    if (explicit.length >= 32) return explicit;
    const base = (
      process.env.SUPABASE_JWT_SECRET ??
      process.env.SUPABASE_SERVICE_ROLE_KEY ??
      process.env.SUPABASE_SECRET_KEY ??
      ""
    ).trim();
    if (!base) throw new Error("Missing ORDER_TOKEN_SECRET (32+ random characters)");
    return createHash("sha256").update(`order-token:${base}`).digest("hex");
  },

  get deliveryFee() {
    const n = Number(process.env.DELIVERY_FEE ?? 0);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  },
};
