import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Only the admin area needs a session; storefront pages stay fast and cacheable.
  matcher: ["/admin/:path*"],
};
