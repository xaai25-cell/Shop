import type { Metadata } from "next";
import { Suspense } from "react";
import { getCategories, getFilterFacets, getProducts } from "@/lib/queries";
import { ProductCard, ProductCardSkeleton } from "@/components/product-card";
import { ProductFilters } from "@/components/product-filters";
import { Pagination } from "@/components/pagination";
import { Stagger, StaggerItem } from "@/components/motion";
import { firstParam, sanitizeSearch } from "@/lib/utils";
import { SearchX } from "lucide-react";
import Link from "next/link";
import { buttonClasses } from "@/components/ui";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const sp = await searchParams;
  const q = firstParam(sp.q);
  const category = firstParam(sp.category);
  if (q) return { title: `Search: ${sanitizeSearch(q)}` };
  if (category) {
    const cats = await getCategories().catch(() => []);
    const c = cats.find((x) => x.slug === category);
    if (c) return { title: c.name, description: c.description ?? undefined };
  }
  return { title: "Shop all products" };
}

const toNum = (v: string | undefined) => {
  if (v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};
const clean = (v: string | undefined) => (v ? sanitizeSearch(v).slice(0, 40) || undefined : undefined);

export default async function ProductsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const filters = {
    q: firstParam(sp.q),
    category: clean(firstParam(sp.category)),
    color: clean(firstParam(sp.color)),
    size: clean(firstParam(sp.size)),
    min: toNum(firstParam(sp.min)),
    max: toNum(firstParam(sp.max)),
    inStock: firstParam(sp.in_stock) === "1",
    sort: firstParam(sp.sort),
    page: Math.min(500, Math.max(1, Number(firstParam(sp.page)) || 1)),
  };

  const [categories, facets] = await Promise.all([
    getCategories().catch(() => []),
    getFilterFacets().catch(() => ({ colors: [], sizes: [] })),
  ]);
  const activeCategory = categories.find((c) => c.slug === filters.category);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div
        className="relative overflow-hidden rounded-[2rem] px-6 py-10 sm:px-10"
        style={{
          background: activeCategory
            ? `linear-gradient(120deg, ${activeCategory.color}22, ${activeCategory.color}08)`
            : "linear-gradient(120deg, #eef2ff, #fdf2f8 60%, #fff7ed)",
        }}
      >
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          {filters.q ? (
            <>Results for “{sanitizeSearch(filters.q)}”</>
          ) : (
            activeCategory?.name ?? "Shop all"
          )}
        </h1>
        <p className="mt-2 max-w-xl text-slate-600">
          {activeCategory?.description ?? "Browse our full collection. Use the filters to find exactly what you want."}
        </p>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[260px_1fr]">
        <ProductFilters categories={categories} colors={facets.colors} sizes={facets.sizes} />
        <Suspense key={JSON.stringify(filters)} fallback={<GridSkeleton />}>
          <Results filters={filters} />
        </Suspense>
      </div>
    </div>
  );
}

async function Results({ filters }: { filters: Parameters<typeof getProducts>[0] }) {
  let result: Awaited<ReturnType<typeof getProducts>>;
  try {
    result = await getProducts(filters);
  } catch (error) {
    // Shows up in Vercel → Logs with the real reason (e.g. missing table or wrong API key).
    console.error("[products] failed to load:", error instanceof Error ? error.message : error);
    return (
      <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-rose-200 bg-rose-50/40 py-20 text-center">
        <p className="font-semibold">We couldn&apos;t load products right now</p>
        <p className="mt-1 text-sm text-slate-500">Please refresh the page in a moment.</p>
        <Link href="/products" className={buttonClasses("outline", "md", "mt-6")}>
          Try again
        </Link>
      </div>
    );
  }
  const { products, total, page, pageCount } = result;

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 py-20 text-center">
        <SearchX className="h-10 w-10 text-slate-300" />
        <p className="mt-4 font-semibold">No products found</p>
        <p className="mt-1 text-sm text-slate-500">Try removing some filters or searching for something else.</p>
        <Link href="/products" className={buttonClasses("outline", "md", "mt-6")}>
          Clear all filters
        </Link>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-4 text-sm text-slate-500">
        {total} product{total === 1 ? "" : "s"}
      </p>
      <Stagger className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3">
        {products.map((p, i) => (
          <StaggerItem key={p.id}>
            <ProductCard product={p} priority={i < 3} />
          </StaggerItem>
        ))}
      </Stagger>
      <Pagination page={page} pageCount={pageCount} />
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-8 pt-9 md:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}
