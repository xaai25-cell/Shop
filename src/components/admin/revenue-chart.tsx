"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { formatPrice } from "@/lib/utils";

type Point = { day: string; revenue: number; orders: number };

export function RevenueChart({ data }: { data: Point[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.revenue));
  const maxOrders = Math.max(1, ...data.map((d) => d.orders));
  const active = hover !== null ? data[hover] : null;
  const total = data.reduce((n, d) => n + d.revenue, 0);

  return (
    <div className="mt-4">
      <div className="mb-3 flex h-10 items-end justify-between">
        <div>
          <p className="text-xs text-slate-500">
            {active ? new Date(active.day).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "Total"}
          </p>
          <p className="text-lg font-bold tabular-nums">{formatPrice(active ? active.revenue : total)}</p>
        </div>
        {active && <p className="text-sm text-slate-500">{active.orders} order{active.orders === 1 ? "" : "s"}</p>}
      </div>
      <div className="relative flex h-48 items-end gap-[3px]" onMouseLeave={() => setHover(null)}>
        {data.map((d, i) => (
          <div
            key={d.day}
            className="relative flex h-full flex-1 cursor-pointer items-end"
            onMouseEnter={() => setHover(i)}
            onTouchStart={() => setHover(i)}
          >
            <motion.div
              className="w-full rounded-t-md bg-gradient-to-t from-brand-600 to-fuchsia-400"
              style={{ opacity: hover === null || hover === i ? 1 : 0.45 }}
              initial={{ height: 0 }}
              animate={{ height: `${Math.max(2, (d.revenue / max) * 100)}%` }}
              transition={{ delay: i * 0.015, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            />
            <span
              className="absolute bottom-0 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-amber-400"
              style={{ bottom: `${(d.orders / maxOrders) * 100}%`, opacity: d.orders ? 1 : 0 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-slate-400">
        <span>{data[0] && new Date(data[0].day).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-brand-600" /> Revenue</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" /> Orders</span>
        </span>
        <span>Today</span>
      </div>
    </div>
  );
}
