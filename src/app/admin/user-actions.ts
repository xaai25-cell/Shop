"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/types";

// Only admins reach any of these. Auth users can only be created/changed with the
// service-role key, which never leaves the server.

const roleSchema = z.enum(["staff", "manager", "admin", "customer"]);
const uuid = z.string().uuid();
const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password is too long")
  .regex(/[A-Za-z]/, "Password needs at least one letter")
  .regex(/[0-9]/, "Password needs at least one number");

const createSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  full_name: z.string().trim().min(1, "Name is required").max(120),
  password: passwordSchema,
  role: z.enum(["staff", "manager", "admin"]),
});

function authError(message: string | undefined) {
  if (!message) return "Something went wrong.";
  if (/already (been )?registered|already exists/i.test(message)) return "A user with this email already exists.";
  if (/password/i.test(message)) return message;
  console.error("[users]", message);
  return "Something went wrong. Please try again.";
}

async function adminCount(service: ReturnType<typeof createServiceClient>) {
  const { count } = await service.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin");
  return count ?? 0;
}

export async function createUser(input: z.input<typeof createSchema>): Promise<ActionResult> {
  await assertRole("admin");
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const { email, password, full_name, role } = parsed.data;

  const service = createServiceClient();
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // admin-created accounts can sign in straight away
    user_metadata: { full_name },
  });
  if (error || !data.user) return { ok: false, error: authError(error?.message) };

  const { error: profileError } = await service
    .from("profiles")
    .upsert({ id: data.user.id, full_name, role }, { onConflict: "id" });
  if (profileError) {
    await service.auth.admin.deleteUser(data.user.id); // don't leave a half-created user behind
    return { ok: false, error: "Could not save the user's role. Please try again." };
  }

  revalidatePath("/admin/users");
  return { ok: true, message: `${email} can now sign in as ${role}.` };
}

export async function updateUser(
  userId: string,
  values: { role?: string; full_name?: string },
): Promise<ActionResult> {
  const me = await assertRole("admin");
  const parsed = z
    .object({ id: uuid, role: roleSchema.optional(), full_name: z.string().trim().min(1).max(120).optional() })
    .safeParse({ id: userId, ...values });
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const { id, ...patch } = parsed.data;

  const service = createServiceClient();
  if (patch.role) {
    if (id === me.user.id && patch.role !== "admin") {
      return { ok: false, error: "You can't remove your own admin access." };
    }
    const { data: current } = await service.from("profiles").select("role").eq("id", id).single();
    if (current?.role === "admin" && patch.role !== "admin" && (await adminCount(service)) <= 1) {
      return { ok: false, error: "There must always be at least one admin." };
    }
  }

  const { error } = await service.from("profiles").upsert({ id, ...patch }, { onConflict: "id" });
  if (error) return { ok: false, error: "Could not update the user." };
  if (patch.full_name) {
    await service.auth.admin.updateUserById(id, { user_metadata: { full_name: patch.full_name } });
  }

  revalidatePath("/admin/users");
  return { ok: true, message: "User updated" };
}

export async function resetUserPassword(userId: string, password: string): Promise<ActionResult> {
  await assertRole("admin");
  const parsed = z.object({ id: uuid, password: passwordSchema }).safeParse({ id: userId, password });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const { error } = await createServiceClient().auth.admin.updateUserById(parsed.data.id, {
    password: parsed.data.password,
  });
  if (error) return { ok: false, error: authError(error.message) };
  return { ok: true, message: "Password updated" };
}

export async function deleteUser(userId: string): Promise<ActionResult> {
  const me = await assertRole("admin");
  if (!uuid.safeParse(userId).success) return { ok: false, error: "Invalid user." };
  if (userId === me.user.id) return { ok: false, error: "You can't delete your own account." };

  const service = createServiceClient();
  const { data: current } = await service.from("profiles").select("role").eq("id", userId).single();
  if (current?.role === "admin" && (await adminCount(service)) <= 1) {
    return { ok: false, error: "There must always be at least one admin." };
  }

  const { error } = await service.auth.admin.deleteUser(userId);
  if (error) return { ok: false, error: authError(error.message) };
  revalidatePath("/admin/users");
  return { ok: true, message: "User deleted" };
}
