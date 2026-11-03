// Supabase connection settings.
// Accepts both the classic names (ANON_KEY) and the newer Supabase/Vercel-integration
// names (PUBLISHABLE_KEY), so either set of environment variables works.
// Written as direct process.env.NEXT_PUBLIC_* references so Next.js can inline them.

export const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");

export const SUPABASE_ANON_KEY = (
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  // Server-only fallbacks (names used by Vercel's Supabase integration)
  process.env.SUPABASE_ANON_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  ""
).trim();

export function assertSupabaseConfig() {
  const missing = [
    !SUPABASE_URL && "NEXT_PUBLIC_SUPABASE_URL",
    !SUPABASE_ANON_KEY && "NEXT_PUBLIC_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)",
  ].filter(Boolean);
  if (missing.length) {
    throw new Error(`Supabase is not configured. Missing environment variable(s): ${missing.join(", ")}`);
  }
}
