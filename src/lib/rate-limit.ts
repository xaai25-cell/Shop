import "server-only";
import { createHash } from "crypto";
import { headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/admin";

export async function getClientIp() {
  const h = await headers();
  return (
    h.get("x-real-ip") ||
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

/**
 * Fixed-window rate limit backed by Postgres (works across Vercel serverless instances).
 * Returns true when the request is allowed.
 */
export async function rateLimit(action: string, limit: number, windowSeconds: number) {
  try {
    const ip = await getClientIp();
    // Salt only needs to be stable; don't let a missing/short secret break sign-in or checkout here.
    const salt = process.env.ORDER_TOKEN_SECRET ?? "rate-limit";
    const key = createHash("sha256").update(`${action}:${ip}:${salt}`).digest("hex").slice(0, 40);

    const { data, error } = await createServiceClient().rpc("check_rate_limit", {
      p_key: `${action}:${key}`,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error) {
      console.error("[rate-limit] database error:", error.message);
      return true; // fail open so a DB hiccup doesn't block sales or admins
    }
    return data === true;
  } catch (e) {
    // Most often a missing SUPABASE_SERVICE_ROLE_KEY in the hosting environment.
    console.error("[rate-limit] skipped:", e instanceof Error ? e.message : e);
    return true;
  }
}
