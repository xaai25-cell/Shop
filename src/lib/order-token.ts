import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { serverEnv } from "@/lib/env.server";

/** Deterministic, unguessable token for a customer's order link. */
export function orderToken(orderId: string) {
  return createHmac("sha256", serverEnv.orderTokenSecret).update(`order:${orderId}`).digest("base64url");
}

export function verifyOrderToken(orderId: string, token: string | undefined | null) {
  if (!token) return false;
  const expected = Buffer.from(orderToken(orderId));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
