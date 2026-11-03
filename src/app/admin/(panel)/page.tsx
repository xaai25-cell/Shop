import Link from "next/link";
import { AlertTriangle, ArrowRight, Banknote, Clock, Package, ShoppingCart } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { ORDER_STATUSES, STATUS_META, type OrderStatus } from "@/lib/constants";
import { cn, formatDate, formatPrice } from "@/lib/utils";
import { Card } from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
import { RevenueChart } from "@/components/admin/revenue-chart";
import { FadeIn } from "@/components/motion";

export const metadata = { title: "Dashboard" };

type Stats = {
  revenue_total: number;
  revenue_period: number;
  orders_total: number;
  orders_period: number;
  avg_order_value: number;
  by_status: Partial<Record<OrderStatus, number>>;
  products_total: number;
  products_active: number;
  low_stock: { id: string; product_id: string; name: string; label: string; stock: number }[];
  top_products: { name: string; qty: number; revenue: number }[];
  daily: { day: string; revenue: number; orders: number }[];
};

export default async function DashboardPage() {
  const { supabase } = await requireRole("manager");
  const [{ data: statsData, error }, { data: recent }] = await Promise.all([
    supabase.rpc("admin_stats", { p_days: 30 }),
    supabase
      .from("orders")
      .select("id, order_number, customer_name, total, status, created_at")
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  if (error || !statsData) {
    return <p className="text-rose-600">Could not load statistics: {error?.message}</p>;
  }
  const s = statsData as Stats;
  const awaiting = s.by_status.slip_uploaded ?? 0;

  const cards = [
    { label: "Revenue (30 days)", value: formatPrice(s.revenue_period), sub: `${formatPrice(s.revenue_total)} all time`, icon: Banknote, color: "from-emerald-500 to-teal-400" },
    { label: "Orders (30 days)", value: s.orders_period.toLocaleString(), sub: `${s.orders_total.toLocaleString()} all time`, icon: ShoppingCart, color: "from-brand-500 to-violet-400" },
    { label: "Awaiting verification", value: awaiting.toLocaleString(), sub: "Payment slips to review", icon: Clock, color: "from-sky-500 to-cyan-400", href: "/admin/orders?status=slip_uploaded" },
    { label: "Active products", value: `${s.products_active}/${s.products_total}`, sub: `Avg. order ${formatPrice(s.avg_order_value)}`, icon: Package, color: "from-fuchsia-500 to-pink-400" },
  ];

  const statusTotal = Object.values(s.by_status).reduce((a, b) => a + (b ?? 0), 0) || 1;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Dashboard</h1>
        <p className="text-sm text-slate-500">Overview of the last 30 days</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ label, value, sub, icon: Icon, color, href }, i) => {
          const body = (
            <Card className="relative h-full overflow-hidden p-5 transition hover:shadow-md">
              <div className={cn("absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br opacity-15", color)} />
              <span className={cn("grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br text-white shadow", color)}>
                <Icon className="h-5 w-5" />
              </span>
              <p className="mt-4 text-sm text-slate-500">{label}</p>
              <p className="mt-1 text-2xl font-extrabold tracking-tight">{value}</p>
              <p className="mt-1 text-xs text-slate-400">{sub}</p>
            </Card>
          );
          return (
            <FadeIn key={label} delay={i * 0.05}>
              {href ? <Link href={href}>{body}</Link> : body}
            </FadeIn>
          );
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <Card className="p-6">
          <h2 className="font-bold">Revenue & orders</h2>
          <p className="text-xs text-slate-500">Approved + delivered revenue per day</p>
          <RevenueChart data={s.daily.map((d) => ({ ...d, revenue: Number(d.revenue), orders: Number(d.orders) }))} />
        </Card>

        <Card className="p-6">
          <h2 className="font-bold">Orders by status</h2>
          <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-slate-100">
            {ORDER_STATUSES.map((st) => (
              <div
                key={st}
                className={STATUS_META[st].dot}
                style={{ width: `${((s.by_status[st] ?? 0) / statusTotal) * 100}%` }}
                title={STATUS_META[st].label}
              />
            ))}
          </div>
          <ul className="mt-5 space-y-3">
            {ORDER_STATUSES.map((st) => (
              <li key={st}>
                <Link href={`/admin/orders?status=${st}`} className="flex items-center justify-between text-sm hover:text-brand-600">
                  <span className="flex items-center gap-2">
                    <span className={cn("h-2.5 w-2.5 rounded-full", STATUS_META[st].dot)} />
                    {STATUS_META[st].label}
                  </span>
                  <span className="font-semibold tabular-nums">{s.by_status[st] ?? 0}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">Recent orders</h2>
            <Link href="/admin/orders" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600">
              All orders <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <ul className="mt-4 divide-y divide-slate-100">
            {(recent ?? []).map((o) => (
              <li key={o.id as string}>
                <Link href={`/admin/orders/${o.id}`} className="flex items-center justify-between gap-4 py-3 hover:bg-slate-50/50">
                  <div className="min-w-0">
                    <p className="font-semibold">{o.order_number as string}</p>
                    <p className="truncate text-xs text-slate-500">
                      {o.customer_name as string} · {formatDate(o.created_at as string)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="hidden text-sm font-semibold sm:block">{formatPrice(o.total as number)}</span>
                    <StatusBadge status={o.status as OrderStatus} />
                  </div>
                </Link>
              </li>
            ))}
            {!recent?.length && <li className="py-6 text-center text-sm text-slate-500">No orders yet.</li>}
          </ul>
        </Card>

        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="font-bold">Top sellers</h2>
            <ul className="mt-4 space-y-3 text-sm">
              {s.top_products.map((p, i) => (
                <li key={p.name} className="flex items-center gap-3">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-slate-100 text-xs font-bold">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  <span className="font-semibold tabular-nums">{p.qty} sold</span>
                </li>
              ))}
              {!s.top_products.length && <li className="text-slate-500">No sales yet.</li>}
            </ul>
          </Card>
          <Card className="p-6">
            <h2 className="flex items-center gap-2 font-bold">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> Low stock
            </h2>
            <ul className="mt-4 space-y-2 text-sm">
              {s.low_stock.map((v) => (
                <li key={v.id}>
                  <Link href={`/admin/products/${v.product_id}`} className="flex items-center justify-between gap-3 hover:text-brand-600">
                    <span className="min-w-0 truncate">
                      {v.name}
                      {v.label && <span className="text-slate-400"> · {v.label}</span>}
                    </span>
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", v.stock === 0 ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-700")}>
                      {v.stock}
                    </span>
                  </Link>
                </li>
              ))}
              {!s.low_stock.length && <li className="text-slate-500">All variants are well stocked.</li>}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
