"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/admin";
import { createPublicClient } from "@/lib/supabase/public";
import { checkoutSchema, orderLookupSchema, type CheckoutInput } from "@/lib/validation";
import { orderToken, verifyOrderToken } from "@/lib/order-token";
import { rateLimit } from "@/lib/rate-limit";
import { processImage, IMAGE_PRESETS } from "@/lib/image-processing";
import { serverEnv } from "@/lib/env.server";
import type { ActionResult } from "@/lib/types";

function friendlyDbError(message: string) {
  if (message.includes("INSUFFICIENT_STOCK")) {
    const name = message.split("INSUFFICIENT_STOCK:")[1]?.trim();
    return `Sorry, there isn't enough stock for ${name || "an item"} anymore. Please update your cart.`;
  }
  if (message.includes("ITEM_UNAVAILABLE")) return "One of the items in your cart is no longer available.";
  if (message.includes("ORDER_LOCKED")) return "This order can no longer accept a payment slip.";
  return "Something went wrong. Please try again.";
}

export async function placeOrder(
  input: CheckoutInput,
): Promise<ActionResult<{ orderNumber: string; url: string }>> {
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Please check the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  if (parsed.data.website) return { ok: false, error: "Something went wrong." }; // bot

  if (!(await rateLimit("order", 5, 600))) {
    return { ok: false, error: "Too many orders from your network. Please wait a few minutes." };
  }

  const { items, website: _hp, ...customer } = parsed.data;
  void _hp;

  const { data, error } = await createServiceClient()
    .rpc("place_order", {
      p_customer: customer,
      p_items: items,
      p_delivery_fee: serverEnv.deliveryFee,
    })
    .single<{ order_id: string; order_number: string; total: number }>();

  if (error || !data) {
    console.error("place_order failed", error?.message);
    return { ok: false, error: friendlyDbError(error?.message ?? "") };
  }

  revalidatePath("/products", "layout");
  const token = orderToken(data.order_id);
  return {
    ok: true,
    data: { orderNumber: data.order_number, url: `/orders/${data.order_number}?t=${token}` },
  };
}

const receiptMeta = z.object({
  order_number: z.string().regex(/^ORD-\d{6}-[A-F0-9]{6}$/),
  token: z.string().min(20).max(100),
});

export async function uploadReceipt(formData: FormData): Promise<ActionResult> {
  const meta = receiptMeta.safeParse({
    order_number: formData.get("order_number"),
    token: formData.get("token"),
  });
  const file = formData.get("receipt");
  if (!meta.success || !(file instanceof File)) return { ok: false, error: "Invalid request." };

  if (!(await rateLimit("receipt", 10, 600))) {
    return { ok: false, error: "Too many uploads. Please wait a few minutes." };
  }

  const supabase = createServiceClient();
  const { data: order } = await supabase
    .from("orders")
    .select("id, status")
    .eq("order_number", meta.data.order_number)
    .maybeSingle();

  if (!order || !verifyOrderToken(order.id, meta.data.token)) return { ok: false, error: "Order not found." };
  if (!["pending", "slip_uploaded"].includes(order.status)) {
    return { ok: false, error: "This order can no longer accept a payment slip." };
  }

  let processed;
  try {
    processed = await processImage(file, IMAGE_PRESETS.receipt);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid image." };
  }

  const path = `${order.id}/${Date.now()}.webp`;
  const { error: upErr } = await supabase.storage
    .from("receipts")
    .upload(path, processed.buffer, { contentType: "image/webp", upsert: false, cacheControl: "3600" });
  if (upErr) {
    console.error("receipt upload failed", upErr.message);
    return { ok: false, error: "Upload failed. Please try again." };
  }

  const { data: oldPath, error: rpcErr } = await supabase.rpc("attach_receipt", {
    p_order_id: order.id,
    p_path: path,
  });
  if (rpcErr) {
    await supabase.storage.from("receipts").remove([path]);
    return { ok: false, error: friendlyDbError(rpcErr.message) };
  }
  if (typeof oldPath === "string" && oldPath) {
    await supabase.storage.from("receipts").remove([oldPath]);
  }

  revalidatePath(`/orders/${meta.data.order_number}`);
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Payment slip uploaded! We'll verify it shortly." };
}

export type LookupState = { error?: string } | undefined;

export async function lookupOrder(_prev: LookupState, formData: FormData): Promise<LookupState> {
  const parsed = orderLookupSchema.safeParse({
    order_number: formData.get("order_number"),
    phone: formData.get("phone"),
  });
  if (!parsed.success) return { error: "Please enter a valid order number and phone number." };

  if (!(await rateLimit("lookup", 15, 600))) return { error: "Too many attempts. Please try again later." };

  const { data: order } = await createServiceClient()
    .from("orders")
    .select("id, order_number, phone")
    .eq("order_number", parsed.data.order_number)
    .maybeSingle();

  const normalize = (p: string) => p.replace(/^\+?960/, "");
  if (!order || normalize(order.phone) !== normalize(parsed.data.phone)) {
    return { error: "We couldn't find an order with those details." };
  }
  redirect(`/orders/${order.order_number}?t=${orderToken(order.id)}`);
}

/** Returns live price/stock for cart lines so the cart never shows stale data. */
export async function refreshCart(variantIds: string[]) {
  const ids = z.array(z.string().uuid()).max(50).safeParse(variantIds);
  if (!ids.success || ids.data.length === 0) return [];
  const { data } = await createPublicClient()
    .from("product_variants")
    .select("id, stock, price, is_active, product:products!inner ( base_price, is_active )")
    .in("id", ids.data);

  type Row = {
    id: string;
    stock: number;
    price: number | null;
    is_active: boolean;
    product: { base_price: number; is_active: boolean } | { base_price: number; is_active: boolean }[];
  };
  return ((data ?? []) as unknown as Row[]).map((r) => {
    const product = Array.isArray(r.product) ? r.product[0] : r.product;
    return {
      id: r.id,
      stock: r.is_active && product?.is_active ? r.stock : 0,
      price: Number(r.price ?? product?.base_price ?? 0),
    };
  });
}
