import Link from "next/link";
import { Search } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { ORDER_STATUSES, STATUS_META, type OrderStatus } from "@/lib/constants";
import { cn, firstParam, formatDate, formatPrice, sanitizeSearch } from "@/lib/utils";
import { Card } from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
import { Pagination } from "@/components/pagination";

export const metadata = { title: "Orders" };
const PER_PAGE = 20;

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { supabase } = await requireAdmin();
  const sp = await searchParams;
  const statusParam = firstParam(sp.status);
  const status = ORDER_STATUSES.includes(statusParam as OrderStatus) ? (statusParam as OrderStatus) : null;
  const q = sanitizeSearch(firstParam(sp.q) ?? "");
  const page = Math.max(1, Number(firstParam(sp.page)) || 1);
  const from = (page - 1) * PER_PAGE;

  let query = supabase
    .from("orders")
    .select("id, order_number, customer_name, phone, island, total, status, created_at, receipt_path", { count: "exact" });
  if (status) query = query.eq("status", status);
  if (q) query = query.or(`order_number.ilike.%${q}%,customer_name.ilike.%${q}%,phone.ilike.%${q}%`);
  const { data, count } = await query.order("created_at", { ascending: false }).range(from, from + PER_PAGE - 1);

  const tabs: { key: OrderStatus | null; label: string }[] = [
    { key: null, label: "All" },
    ...ORDER_STATUSES.map((s) => ({ key: s, label: STATUS_META[s].label })),
  ];
  const tabHref = (key: OrderStatus | null) => {
    const p = new URLSearchParams();
    if (key) p.set("status", key);
    if (q) p.set("q", q);
    const s = p.toString();
    return s ? `/admin/orders?${s}` : "/admin/orders";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Orders</h1>
          <p className="text-sm text-slate-500">{count ?? 0} order(s)</p>
        </div>
        <form className="relative" role="search">
          {status && <input type="hidden" name="status" value={status} />}
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Order #, name or phone"
            className="h-10 w-64 rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10"
          />
        </form>
      </div>

      <div className="scrollbar-none flex gap-2 overflow-x-auto">
        {tabs.map((t) => (
          <Link
            key={t.label}
            href={tabHref(t.key)}
            className={cn(
              "shrink-0 rounded-full px-4 py-2 text-sm font-medium transition",
              status === t.key ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Order</th>
                <th className="px-4 py-3 font-semibold">Customer</th>
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 text-right font-semibold">Total</th>
                <th className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data ?? []).map((o) => (
                <tr key={o.id} className="transition hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/admin/orders/${o.id}`} className="font-semibold text-brand-600 hover:underline">
                      {o.order_number}
                    </Link>
                    {o.receipt_path && <span className="ml-2 text-xs text-sky-600">• slip</span>}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{o.customer_name}</p>
                    <p className="text-xs text-slate-500">{o.phone} · {o.island}</p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-500">{formatDate(o.created_at)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">{formatPrice(o.total)}</td>
                  <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                </tr>
              ))}
              {!data?.length && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-slate-500">No orders found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      <Pagination page={page} pageCount={Math.max(1, Math.ceil((count ?? 0) / PER_PAGE))} />
    </div>
  );
}
