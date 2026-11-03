import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { STAFF_ROLES, hasRole, homeFor, type StaffRole } from "@/lib/roles";

/**
 * Verifies the session with Supabase Auth (getUser hits the auth server, so it
 * can't be spoofed by a forged cookie) and reads the role from the DB.
 * Returns null for anyone who isn't staff, manager or admin.
 * Call requireRole / assertRole at the top of EVERY admin page and server action –
 * middleware alone is not a security boundary.
 */
export const getStaffUser = cache(async () => {
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

  const role = profile?.role as StaffRole | undefined;
  if (!role || !(STAFF_ROLES as readonly string[]).includes(role)) return null;
  return { user, profile: { role, full_name: (profile?.full_name as string | null) ?? null }, role, supabase };
});

/** For pages: redirects to sign-in, or to the user's home if their role is too low. */
export async function requireRole(min: StaffRole) {
  const staff = await getStaffUser();
  if (!staff) redirect("/admin/login");
  if (!hasRole(staff.role, min)) redirect(homeFor(staff.role));
  return staff;
}

/** For server actions: throws instead of redirecting. */
export async function assertRole(min: StaffRole) {
  const staff = await getStaffUser();
  if (!staff || !hasRole(staff.role, min)) throw new Error("Unauthorized");
  return staff;
}
