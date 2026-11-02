import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { CheckCircle2, Circle, Clock, XCircle } from "lucide-react";
import { createServiceClient } from "@/lib/supabase/admin";
import { verifyOrderToken } from "@/lib/order-token";
import { STATUS_META, type OrderStatus } from "@/lib/constants";
import { siteConfig } from "@/lib/config";
import { cn, firstParam, formatDate, formatPrice, productImageUrl } from "@/lib/utils";
import type { Order, OrderHistory, OrderItem } from "@/lib/types";
import { StatusBadge } from "@/components/status-badge";
import { ReceiptUploader } from "@/components/receipt-uploader";
import { CopyButton } from "@/components/copy-button";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your order", robots: { index: false, follow: false } };

type Props = {
  params: Promise<{ orderNumber: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const STEPS: OrderStatus[] = ["pending", "slip_uploaded", "approved", "delivered"];

export default async function OrderPage({ params, searchParams }: Props) {
  const { orderNumber } = await params;
  const token = firstParam((await searchParams).t);
  if (!/^ORD-\d{6}-[A-F0-9]{6}$/.test(orderNumber) || !token) notFound();

  const supabase = createServiceClient();
  const { data } = await supabase
    .from("orders")
    .select(
      "id, order_number, customer_name, phone, address, island, notes, subtotal, delivery_fee, total, status, receipt_path, receipt_uploaded_at, rejection_reason, created_at, items:order_items ( id, product_name, variant_label, image_path, unit_price, quantity, line_total )",
    )
    .eq("order_number", orderNumber)
    .maybeSingle();

  const order = data as (Order & { items: OrderItem[] }) | null;
  if (!order || !verifyOrderToken(order.id, token)) notFound();

  const { data: historyData } = await supabase
    .from("order_status_history")
    .select("id, from_status, to_status, note, created_at")
    .eq("order_id", order.id)
    .order("created_at");
  const history = (historyData ?? []) as OrderHistory[];

  const canUpload = order.status === "pending" || order.status === "slip_uploaded";
  const currentStep = STEPS.indexOf(order.status);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">Order</p>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{order.order_number}</h1>
          <p className="mt-1 text-sm text-slate-500">Placed {formatDate(order.created_at)}</p>
        </div>
        <StatusBadge status={order.status} className="px-3 py-1 text-sm" />
      </div>

      <p className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">
        Bookmark this page — it&apos;s your private link to track this order. You can also find it again from
        “Track order” using your order number and phone.
      </p>

      {/* Progress */}
      <Card className="mt-6 p-6">
        {order.status === "rejected" ? (
          <div className="flex items-start gap-3 text-rose-700">
            <XCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">This order was rejected</p>
              {order.rejection_reason && <p className="mt-1 text-sm">{order.rejection_reason}</p>}
              <p className="mt-1 text-sm text-slate-500">Please contact us if you think this is a mistake.</p>
            </div>
          </div>
        ) : (
          <ol className="grid gap-4 sm:grid-cols-4">
            {STEPS.map((s, i) => {
              const done = i < currentStep || order.status === "delivered";
              const active = i === currentStep;
              return (
                <li key={s} className="flex items-center gap-3 sm:flex-col sm:text-center">
                  <span
                    className={cn(
                      "grid h-10 w-10 shrink-0 place-items-center rounded-full",
                      done ? "bg-emerald-500 text-white" : active ? "bg-brand-600 text-white ring-4 ring-brand-100" : "bg-slate-100 text-slate-400",
                    )}
                  >
                    {done ? <CheckCircle2 className="h-5 w-5" /> : active ? <Clock className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
                  </span>
                  <div>
                    <p className={cn("text-sm font-semibold", !done && !active && "text-slate-400")}>{STATUS_META[s].label}</p>
                    <p className="text-xs text-slate-500">{STATUS_META[s].description}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        {order.status === "pending" && order.rejection_reason && (
          <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">
            Please upload a new slip: {order.rejection_reason}
          </p>
        )}
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          {canUpload && (
            <Card className="p-6">
              <h2 className="text-lg font-bold">1. Transfer {formatPrice(order.total)}</h2>
              <dl className="mt-4 divide-y divide-slate-100 rounded-2xl border border-slate-200 text-sm">
                {[
                  ["Bank", siteConfig.bank.name],
                  ["Account name", siteConfig.bank.accountName],
                  ["Account number", siteConfig.bank.accountNumber],
                  ["Amount", order.total.toString()],
                  ["Reference", order.order_number],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-4 px-4 py-3">
                    <dt className="text-slate-500">{k}</dt>
                    <dd className="flex items-center gap-2 font-semibold">
                      {v}
                      {k !== "Bank" && v && <CopyButton value={String(v)} />}
                    </dd>
                  </div>
                ))}
              </dl>
              <h2 className="mt-8 text-lg font-bold">2. Upload your transfer slip</h2>
              <p className="mt-1 text-sm text-slate-500">
                A screenshot from the BML app works great. We compress it automatically.
              </p>
              <ReceiptUploader orderNumber={order.order_number} token={token} hasReceipt={!!order.receipt_path} />
            </Card>
          )}

          <Card className="p-6">
            <h2 className="font-bold">Items</h2>
            <ul className="mt-4 divide-y divide-slate-100">
              {order.items.map((i) => {
                const src = productImageUrl(i.image_path);
                return (
                  <li key={i.id} className="flex items-center gap-4 py-3">
                    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                      {src && <Image src={src} alt="" fill sizes="56px" className="object-cover" />}
                    </div>
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="font-medium">{i.product_name}</p>
                      <p className="text-slate-500">
                        {i.variant_label ? `${i.variant_label} · ` : ""}Qty {i.quantity} × {formatPrice(i.unit_price)}
                      </p>
                    </div>
                    <p className="text-sm font-semibold">{formatPrice(i.line_total)}</p>
                  </li>
                );
              })}
            </ul>
            <dl className="mt-4 space-y-1.5 border-t border-slate-100 pt-4 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">Subtotal</dt><dd>{formatPrice(order.subtotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Delivery</dt><dd>{Number(order.delivery_fee) > 0 ? formatPrice(order.delivery_fee) : "Free"}</dd></div>
              <div className="flex justify-between text-base font-bold"><dt>Total</dt><dd>{formatPrice(order.total)}</dd></div>
            </dl>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-6 text-sm">
            <h2 className="font-bold">Delivery to</h2>
            <p className="mt-3 font-medium">{order.customer_name}</p>
            <p className="text-slate-600">{order.address}</p>
            <p className="text-slate-600">{order.island}</p>
            <p className="mt-2 text-slate-600">{order.phone}</p>
            {order.notes && <p className="mt-3 rounded-xl bg-slate-50 p-3 text-slate-600">{order.notes}</p>}
          </Card>
          <Card className="p-6">
            <h2 className="font-bold">Activity</h2>
            <ol className="mt-4 space-y-4 border-l border-slate-200 pl-4">
              {history.map((h) => (
                <li key={h.id} className="relative text-sm">
                  <span className={cn("absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full", STATUS_META[h.to_status].dot)} />
                  <p className="font-medium">{STATUS_META[h.to_status].label}</p>
                  {h.note && <p className="text-slate-500">{h.note}</p>}
                  <p className="text-xs text-slate-400">{formatDate(h.created_at)}</p>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </div>
  );
}
