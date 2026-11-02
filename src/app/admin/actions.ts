"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { processImage, IMAGE_PRESETS } from "@/lib/image-processing";
import { categorySchema, productSchema, statusChangeSchema, type CategoryInput, type ProductInput } from "@/lib/validation";
import { isRemoteImage } from "@/lib/utils";
import type { ActionResult } from "@/lib/types";

const uuid = z.string().uuid();

function dbError(message: string | undefined) {
  if (!message) return "Something went wrong.";
  if (message.includes("duplicate key") && message.includes("slug")) return "That slug is already in use.";
  if (message.includes("duplicate key") && message.includes("sku")) return "A variant SKU is already in use.";
  if (message.includes("INVALID_TRANSITION")) return "That status change isn't allowed.";
  if (message.includes("FORBIDDEN")) return "You don't have permission to do that.";
  console.error("admin db error:", message);
  return "Something went wrong. Please try again.";
}

function revalidateCatalog() {
  revalidatePath("/", "layout");
}

// ---------------------------------------------------------------- auth

export type LoginState = { error?: string } | undefined;

export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = z
    .object({ email: z.string().trim().email(), password: z.string().min(6).max(200), next: z.string().optional() })
    .safeParse({ email: formData.get("email"), password: formData.get("password"), next: formData.get("next") ?? undefined });
  if (!parsed.success) return { error: "Enter a valid email and password." };

  if (!(await rateLimit("admin-login", 8, 900))) return { error: "Too many attempts. Try again in 15 minutes." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error || !data.user) return { error: "Invalid email or password." };

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).single();
  if (profile?.role !== "admin") {
    await supabase.auth.signOut();
    return { error: "This account does not have admin access." };
  }

  // Only allow relative redirects inside /admin (prevents open redirects)
  const next = parsed.data.next && /^\/admin(\/[\w/-]*)?$/.test(parsed.data.next) ? parsed.data.next : "/admin";
  redirect(next);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}

// ---------------------------------------------------------------- products

export async function saveProduct(
  productId: string | null,
  input: ProductInput,
): Promise<ActionResult<{ id: string }>> {
  const { supabase } = await assertAdmin();
  if (productId && !uuid.safeParse(productId).success) return { ok: false, error: "Invalid product." };

  const parsed = productSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      error: first ? `${first.path.join(".") || "Form"}: ${first.message}` : "Invalid input.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const { variants, ...product } = parsed.data;

  // Prevent duplicate colour/size combos
  const combos = new Set<string>();
  for (const v of variants) {
    const k = `${v.color ?? ""}|${v.size ?? ""}`.toLowerCase();
    if (combos.has(k)) return { ok: false, error: `Duplicate variant: ${v.color ?? "-"} / ${v.size ?? "-"}` };
    combos.add(k);
  }

  let id = productId;
  if (id) {
    const { error } = await supabase.from("products").update(product).eq("id", id);
    if (error) return { ok: false, error: dbError(error.message) };
  } else {
    const { data, error } = await supabase.from("products").insert(product).select("id").single();
    if (error || !data) return { ok: false, error: dbError(error?.message) };
    id = data.id as string;
  }

  // Sync variants
  const { data: existing } = await supabase.from("product_variants").select("id").eq("product_id", id);
  const keepIds = new Set(variants.map((v) => v.id).filter(Boolean) as string[]);
  const toDelete = (existing ?? []).map((v) => v.id as string).filter((vid) => !keepIds.has(vid));
  if (toDelete.length) {
    const { error } = await supabase.from("product_variants").delete().in("id", toDelete);
    if (error) return { ok: false, error: dbError(error.message) };
  }

  const existingIds = new Set((existing ?? []).map((v) => v.id as string));
  const rows = variants.map((v, i) => ({ ...v, product_id: id!, sort_order: i }));
  const updates = rows.filter((r) => r.id && existingIds.has(r.id));
  const inserts = rows.filter((r) => !r.id || !existingIds.has(r.id)).map((r) => {
    const { id: _omit, ...rest } = r;
    void _omit;
    return rest;
  });

  if (updates.length) {
    const { error } = await supabase.from("product_variants").upsert(updates, { onConflict: "id" });
    if (error) return { ok: false, error: dbError(error.message) };
  }
  if (inserts.length) {
    const { error } = await supabase.from("product_variants").insert(inserts);
    if (error) return { ok: false, error: dbError(error.message) };
  }

  revalidateCatalog();
  return { ok: true, data: { id: id! }, message: "Product saved" };
}

export async function setProductActive(productId: string, isActive: boolean): Promise<ActionResult> {
  const { supabase } = await assertAdmin();
  if (!uuid.safeParse(productId).success) return { ok: false, error: "Invalid product." };
  const { error } = await supabase.from("products").update({ is_active: isActive }).eq("id", productId);
  if (error) return { ok: false, error: dbError(error.message) };
  revalidateCatalog();
  return { ok: true };
}

export async function deleteProduct(productId: string): Promise<ActionResult> {
  const { supabase } = await assertAdmin();
  if (!uuid.safeParse(productId).success) return { ok: false, error: "Invalid product." };

  const { data: images } = await supabase.from("product_images").select("path").eq("product_id", productId);
  const { error } = await supabase.from("products").delete().eq("id", productId);
  if (error) return { ok: false, error: dbError(error.message) };
  const stored = (images ?? []).map((i) => i.path as string).filter((p) => !isRemoteImage(p));
  if (stored.length) await supabase.storage.from("product-images").remove(stored);

  revalidateCatalog();
  return { ok: true, message: "Product deleted" };
}

// ---------------------------------------------------------------- product images

export async function uploadProductImages(productId: string, formData: FormData): Promise<ActionResult<{ count: number }>> {
  const { supabase } = await assertAdmin();
  if (!uuid.safeParse(productId).success) return { ok: false, error: "Invalid product." };

  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { ok: false, error: "No files selected." };
  if (files.length > 10) return { ok: false, error: "Upload up to 10 images at a time." };

  const { count } = await supabase
    .from("product_images")
    .select("id", { count: "exact", head: true })
    .eq("product_id", productId);
  let order = count ?? 0;
  if (order + files.length > 20) return { ok: false, error: "A product can have at most 20 images." };

  const color = z.string().trim().max(40).optional().parse(formData.get("color") || undefined) || null;
  let uploaded = 0;
  const errors: string[] = [];

  for (const file of files) {
    try {
      const img = await processImage(file, IMAGE_PRESETS.product);
      const path = `${productId}/${randomUUID()}.webp`;
      const { error: upErr } = await supabase.storage
        .from("product-images")
        .upload(path, img.buffer, { contentType: "image/webp", cacheControl: "31536000", upsert: false });
      if (upErr) throw new Error(upErr.message);

      const { error: insErr } = await supabase.from("product_images").insert({
        product_id: productId,
        path,
        width: img.width,
        height: img.height,
        color,
        sort_order: order++,
      });
      if (insErr) {
        await supabase.storage.from("product-images").remove([path]);
        throw new Error(insErr.message);
      }
      uploaded++;
    } catch (e) {
      errors.push(`${file.name}: ${e instanceof Error ? e.message : "failed"}`);
    }
  }

  revalidateCatalog();
  if (uploaded === 0) return { ok: false, error: errors[0] ?? "Upload failed." };
  return {
    ok: true,
    data: { count: uploaded },
    message: errors.length ? `${uploaded} uploaded, ${errors.length} failed` : `${uploaded} image(s) uploaded`,
  };
}

export async function updateProductImage(
  imageId: string,
  values: { alt?: string | null; color?: string | null },
): Promise<ActionResult> {
  const { supabase } = await assertAdmin();
  const parsed = z
    .object({
      id: uuid,
      alt: z.string().trim().max(200).nullable().optional(),
      color: z.string().trim().max(40).nullable().optional(),
    })
    .safeParse({ id: imageId, ...values });
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const { id, ...rest } = parsed.data;
  const patch = Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, v === "" ? null : v]));
  const { error } = await supabase.from("product_images").update(patch).eq("id", id);
  if (error) return { ok: false, error: dbError(error.message) };
  revalidateCatalog();
  return { ok: true };
}

export async function reorderProductImages(productId: string, orderedIds: string[]): Promise<ActionResult> {
  const { supabase } = await assertAdmin();
  const parsed = z.object({ productId: uuid, ids: z.array(uuid).max(50) }).safeParse({ productId, ids: orderedIds });
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const results = await Promise.all(
    parsed.data.ids.map((id, i) =>
      supabase.from("product_images").update({ sort_order: i }).eq("id", id).eq("product_id", parsed.data.productId),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return { ok: false, error: dbError(failed.error.message) };
  revalidateCatalog();
  return { ok: true };
}

export async function deleteProductImage(imageId: string): Promise<ActionResult> {
  const { supabase } = await assertAdmin();
  if (!uuid.safeParse(imageId).success) return { ok: false, error: "Invalid image." };
  const { data: img } = await supabase.from("product_images").select("path").eq("id", imageId).single();
  const { error } = await supabase.from("product_images").delete().eq("id", imageId);
  if (error) return { ok: false, error: dbError(error.message) };
  if (img?.path && !isRemoteImage(img.path)) await supabase.storage.from("product-images").remove([img.path as string]);
  revalidateCatalog();
  return { ok: true };
}

// ---------------------------------------------------------------- categories

export async function saveCategory(input: CategoryInput): Promise<ActionResult> {
  const { supabase } = await assertAdmin();
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const { id, ...values } = parsed.data;
  const { error } = id
    ? await supabase.from("categories").update(values).eq("id", id)
    : await supabase.from("categories").insert(values);
  if (error) return { ok: false, error: dbError(error.message) };
  revalidateCatalog();
  return { ok: true, message: "Category saved" };
}

export async function deleteCategory(id: string): Promise<ActionResult> {
  const { supabase } = await assertAdmin();
  if (!uuid.safeParse(id).success) return { ok: false, error: "Invalid category." };
  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) return { ok: false, error: dbError(error.message) };
  revalidateCatalog();
  return { ok: true, message: "Category deleted" };
}

// ---------------------------------------------------------------- orders

export async function updateOrderStatus(input: z.input<typeof statusChangeSchema>): Promise<ActionResult> {
  const { supabase } = await assertAdmin();
  const parsed = statusChangeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  if (parsed.data.status === "rejected" && !parsed.data.note) {
    return { ok: false, error: "Please give a reason for rejecting." };
  }

  const { error } = await supabase.rpc("set_order_status", {
    p_order_id: parsed.data.order_id,
    p_status: parsed.data.status,
    p_note: parsed.data.note || null,
  });
  if (error) return { ok: false, error: dbError(error.message) };

  revalidatePath("/admin", "layout");
  revalidateCatalog(); // stock may have been restored
  return { ok: true, message: "Order updated" };
}

export async function saveAdminNote(orderId: string, note: string): Promise<ActionResult> {
  const { supabase } = await assertAdmin();
  const parsed = z.object({ id: uuid, note: z.string().trim().max(1000) }).safeParse({ id: orderId, note });
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const { error } = await supabase
    .from("orders")
    .update({ admin_note: parsed.data.note || null })
    .eq("id", parsed.data.id);
  if (error) return { ok: false, error: dbError(error.message) };
  revalidatePath(`/admin/orders/${parsed.data.id}`);
  return { ok: true, message: "Note saved" };
}
