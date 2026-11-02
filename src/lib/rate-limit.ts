import "server-only";
import { createHash } from "crypto";
import { headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env.server";

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
  const ip = await getClientIp();
  const key = createHash("sha256")
    .update(`${action}:${ip}:${serverEnv.orderTokenSecret}`)
    .digest("hex")
    .slice(0, 40);

  const { data, error } = await createServiceClient().rpc("check_rate_limit", {
    p_key: `${action}:${key}`,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error("rate limit error", error.message);
    return true; // fail open so a DB hiccup doesn't block sales
  }
  return data === true;
}
