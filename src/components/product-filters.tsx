"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, SlidersHorizontal, X } from "lucide-react";
import { SORT_OPTIONS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Category } from "@/lib/types";
import { Button, Input, Select, Spinner } from "./ui";

type Props = {
  categories: Category[];
  colors: { name: string; hex: string | null }[];
  sizes: string[];
};

export function ProductFilters(props: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const params = useSearchParams();
  const activeCount = ["category", "color", "size", "min", "max", "in_stock", "q"].filter((k) => params.get(k)).length;

  return (
    <>
      <div className="flex items-center justify-between gap-3 lg:hidden">
        <Button variant="outline" onClick={() => setMobileOpen(true)}>
          <SlidersHorizontal className="h-4 w-4" /> Filters
          {activeCount > 0 && (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-brand-600 px-1 text-[10px] text-white">
              {activeCount}
            </span>
          )}
        </Button>
        <SortSelect />
      </div>

      <aside className="hidden lg:block">
        <div className="sticky top-24 space-y-6">
          <SortSelect />
          <FilterBody {...props} />
        </div>
      </aside>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Filters"
              className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl lg:hidden"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 32 }}
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold">Filters</h2>
                <button onClick={() => setMobileOpen(false)} className="rounded-lg p-2 hover:bg-slate-100" aria-label="Close filters">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <FilterBody {...props} />
              <Button className="mt-6 w-full" size="lg" onClick={() => setMobileOpen(false)}>
                Show results
              </Button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function useUpdateParams() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    next.delete("page");
    const qs = next.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };
  return { params, update, pending };
}

function SortSelect() {
  const { params, update } = useUpdateParams();
  return (
    <Select
      aria-label="Sort products"
      value={params.get("sort") ?? "newest"}
      onChange={(e) => update({ sort: e.target.value === "newest" ? null : e.target.value })}
      className="w-auto min-w-44 lg:w-full"
    >
      {SORT_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}

function FilterBody({ categories, colors, sizes }: Props) {
  const { params, update, pending } = useUpdateParams();
  const [min, setMin] = useState(params.get("min") ?? "");
  const [max, setMax] = useState(params.get("max") ?? "");
  const [q, setQ] = useState(params.get("q") ?? "");

  useEffect(() => {
    setMin(params.get("min") ?? "");
    setMax(params.get("max") ?? "");
    setQ(params.get("q") ?? "");
  }, [params]);

  const category = params.get("category");
  const color = params.get("color");
  const size = params.get("size");
  const inStock = params.get("in_stock") === "1";
  const hasAny = ["category", "color", "size", "min", "max", "in_stock", "q"].some((k) => params.get(k));

  return (
    <div className={cn("space-y-7 transition-opacity", pending && "opacity-60")}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          update({ q: q.trim() || null });
        }}
      >
        <Heading>Search</Heading>
        <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Product name…" aria-label="Search" />
      </form>

      <div>
        <Heading>Category</Heading>
        <div className="space-y-1">
          <Pill active={!category} onClick={() => update({ category: null })}>
            All products
          </Pill>
          {categories.map((c) => (
            <Pill key={c.id} active={category === c.slug} onClick={() => update({ category: category === c.slug ? null : c.slug })}>
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.color }} />
              {c.name}
            </Pill>
          ))}
        </div>
      </div>

      {colors.length > 0 && (
        <div>
          <Heading>Colour</Heading>
          <div className="flex flex-wrap gap-2">
            {colors.map((c) => {
              const active = color === c.name;
              return (
                <button
                  key={c.name}
                  type="button"
                  title={c.name}
                  aria-label={c.name}
                  aria-pressed={active}
                  onClick={() => update({ color: active ? null : c.name })}
                  className={cn(
                    "relative grid h-9 w-9 place-items-center rounded-full border-2 transition hover:scale-110",
                    active ? "border-slate-900" : "border-white ring-1 ring-slate-200",
                  )}
                  style={{ backgroundColor: c.hex ?? "#e2e8f0" }}
                >
                  {active && <Check className="h-4 w-4 text-white mix-blend-difference" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {sizes.length > 0 && (
        <div>
          <Heading>Size</Heading>
          <div className="flex flex-wrap gap-2">
            {sizes.map((s) => {
              const active = size === s;
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={active}
                  onClick={() => update({ size: active ? null : s })}
                  className={cn(
                    "h-9 min-w-11 rounded-xl border px-3 text-sm font-semibold transition",
                    active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 hover:border-slate-400",
                  )}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          update({ min: min || null, max: max || null });
        }}
      >
        <Heading>Price</Heading>
        <div className="flex items-center gap-2">
          <Input inputMode="decimal" type="number" min={0} placeholder="Min" value={min} onChange={(e) => setMin(e.target.value)} aria-label="Minimum price" />
          <span className="text-slate-400">–</span>
          <Input inputMode="decimal" type="number" min={0} placeholder="Max" value={max} onChange={(e) => setMax(e.target.value)} aria-label="Maximum price" />
        </div>
        <Button type="submit" variant="secondary" size="sm" className="mt-2 w-full">
          Apply price
        </Button>
      </form>

      <label className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium">
        In stock only
        <input
          type="checkbox"
          className="h-4 w-4 accent-brand-600"
          checked={inStock}
          onChange={(e) => update({ in_stock: e.target.checked ? "1" : null })}
        />
      </label>

      {hasAny && (
        <Button
          variant="ghost"
          className="w-full"
          onClick={() => update({ category: null, color: null, size: null, min: null, max: null, in_stock: null, q: null })}
        >
          {pending ? <Spinner /> : <X className="h-4 w-4" />} Clear filters
        </Button>
      )}
    </div>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return <p className="mb-2.5 text-xs font-bold uppercase tracking-wider text-slate-400">{children}</p>;
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium transition",
        active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100",
      )}
    >
      {children}
    </button>
  );
}
