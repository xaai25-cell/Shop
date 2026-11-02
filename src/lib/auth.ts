import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Verifies the session with Supabase Auth (getUser hits the auth server, so it
 * can't be spoofed by a forged cookie) and checks the admin role from the DB.
 * Call this at the top of EVERY admin page and server action – middleware alone
 * is not a security boundary.
 */
export const getAdmin = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") return null;
  return { user, profile, supabase };
});

export async function requireAdmin() {
  const admin = await getAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}

/** For server actions: throws instead of redirecting. */
export async function assertAdmin() {
  const admin = await getAdmin();
  if (!admin) throw new Error("Unauthorized");
  return admin;
}
