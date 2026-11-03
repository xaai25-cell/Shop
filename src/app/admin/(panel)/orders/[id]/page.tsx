import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { STATUS_META } from "@/lib/constants";
import { cn, formatDate, formatPrice, productImageUrl } from "@/lib/utils";
import type { Order, OrderHistory, OrderItem } from "@/lib/types";
import { Card } from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
import { OrderActions } from "@/components/admin/order-actions";
import { AdminNoteForm } from "@/components/admin/admin-note-form";

export const metadata = { title: "Order details" };

export default async function AdminOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase } = await requireRole("manager");

  const [{ data }, { data: historyData }] = await Promise.all([
    supabase
      .from("orders")
      .select("*, items:order_items ( id, product_id, variant_id, product_name, variant_label, image_path, unit_price, quantity, line_total )")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("order_status_history").select("id, from_status, to_status, note, created_at").eq("order_id", id).order("created_at"),
  ]);
  const order = data as (Order & { items: OrderItem[] }) | null;
  if (!order) notFound();
  const history = (historyData ?? []) as OrderHistory[];

  // Private bucket → short-lived signed URL, only generated for admins.
  let receiptUrl: string | null = null;
  if (order.receipt_path) {
    const { data: signed } = await supabase.storage.from("receipts").createSignedUrl(order.receipt_path, 60 * 10);
    receiptUrl = signed?.signedUrl ?? null;
  }

  return (
    <div className="space-y-6">
      <Link href="/admin/orders" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> Back to orders
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{order.order_number}</h1>
          <p className="text-sm text-slate-500">Placed {formatDate(order.created_at)}</p>
        </div>
        <StatusBadge status={order.status} className="px-3 py-1 text-sm" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-bold">Payment slip</h2>
              {receiptUrl && (
                <a href={receiptUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600">
                  Open full size <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
            {receiptUrl ? (
              <div className="mt-4">
                {/* eslint-disable-next-line @next/next/no-img-element -- signed private URL, don't route through the image optimizer */}
                <img src={receiptUrl} alt="Payment slip" className="max-h-[600px] rounded-xl border border-slate-200" />
                {order.receipt_uploaded_at && (
                  <p className="mt-2 text-xs text-slate-500">Uploaded {formatDate(order.receipt_uploaded_at)}</p>
                )}
              </div>
            ) : (
              <p className="mt-4 rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">No payment slip uploaded yet.</p>
            )}
            <div className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
              Check the slip amount is <strong>{formatPrice(order.total)}</strong> and the reference matches{" "}
              <strong>{order.order_number}</strong>.
            </div>
          </Card>

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
                      {i.product_id ? (
                        <Link href={`/admin/products/${i.product_id}`} className="font-medium hover:text-brand-600">{i.product_name}</Link>
                      ) : (
                        <p className="font-medium">{i.product_name}</p>
                      )}
                      <p className="text-slate-500">
                        {i.variant_label ? `${i.variant_label} · ` : ""}
                        {i.quantity} × {formatPrice(i.unit_price)}
                      </p>
                    </div>
                    <p className="text-sm font-semibold">{formatPrice(i.line_total)}</p>
                  </li>
                );
              })}
            </ul>
            <dl className="mt-4 space-y-1.5 border-t border-slate-100 pt-4 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">Subtotal</dt><dd>{formatPrice(order.subtotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Delivery</dt><dd>{formatPrice(order.delivery_fee)}</dd></div>
              <div className="flex justify-between text-base font-bold"><dt>Total</dt><dd>{formatPrice(order.total)}</dd></div>
            </dl>
          </Card>
        </div>

        <div className="space-y-6">
          <OrderActions orderId={order.id} status={order.status} />

          <Card className="p-6 text-sm">
            <h2 className="font-bold">Customer</h2>
            <p className="mt-3 font-medium">{order.customer_name}</p>
            <p><a className="text-brand-600" href={`tel:${order.phone}`}>{order.phone}</a></p>
            {order.email && <p className="text-slate-600">{order.email}</p>}
            <p className="mt-3 text-slate-600">{order.address}</p>
            <p className="text-slate-600">{order.island}</p>
            {order.notes && <p className="mt-3 rounded-xl bg-slate-50 p-3 text-slate-600">“{order.notes}”</p>}
          </Card>

          <AdminNoteForm orderId={order.id} initial={order.admin_note ?? ""} />

          <Card className="p-6">
            <h2 className="font-bold">History</h2>
            <ol className="mt-4 space-y-4 border-l border-slate-200 pl-4">
              {history.map((h) => (
                <li key={h.id} className="relative text-sm">
                  <span className={cn("absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full", STATUS_META[h.to_status].dot)} />
                  <p className="font-medium">
                    {h.from_status ? `${STATUS_META[h.from_status].label} → ` : ""}
                    {STATUS_META[h.to_status].label}
                  </p>
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
