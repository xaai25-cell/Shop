import "server-only";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const serverEnv = {
  get supabaseUrl() { return required("NEXT_PUBLIC_SUPABASE_URL"); },
  get supabaseAnonKey() { return required("NEXT_PUBLIC_SUPABASE_ANON_KEY"); },
  get serviceRoleKey() { return required("SUPABASE_SERVICE_ROLE_KEY"); },
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
