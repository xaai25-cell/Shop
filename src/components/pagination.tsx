"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function Pagination({ page, pageCount }: { page: number; pageCount: number }) {
  const pathname = usePathname();
  const params = useSearchParams();
  if (pageCount <= 1) return null;

  const href = (p: number) => {
    const next = new URLSearchParams(params.toString());
    if (p <= 1) next.delete("page");
    else next.set("page", String(p));
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  const pages: (number | "…")[] = [];
  for (let i = 1; i <= pageCount; i++) {
    if (i === 1 || i === pageCount || Math.abs(i - page) <= 1) pages.push(i);
    else if (pages[pages.length - 1] !== "…") pages.push("…");
  }

  const base = "grid h-10 min-w-10 place-items-center rounded-xl px-3 text-sm font-semibold transition";
  return (
    <nav className="mt-12 flex items-center justify-center gap-1" aria-label="Pagination">
      <Link
        href={href(page - 1)}
        aria-disabled={page <= 1}
        className={cn(base, "hover:bg-slate-100", page <= 1 && "pointer-events-none opacity-40")}
        aria-label="Previous page"
      >
        <ChevronLeft className="h-4 w-4" />
      </Link>
      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`e${i}`} className="px-2 text-slate-400">…</span>
        ) : (
          <Link
            key={p}
            href={href(p)}
            aria-current={p === page ? "page" : undefined}
            className={cn(base, p === page ? "bg-slate-900 text-white" : "hover:bg-slate-100")}
          >
            {p}
          </Link>
        ),
      )}
      <Link
        href={href(page + 1)}
        aria-disabled={page >= pageCount}
        className={cn(base, "hover:bg-slate-100", page >= pageCount && "pointer-events-none opacity-40")}
        aria-label="Next page"
      >
        <ChevronRight className="h-4 w-4" />
      </Link>
    </nav>
  );
}
