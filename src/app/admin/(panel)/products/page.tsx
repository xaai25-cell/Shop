import Image from "next/image";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { cn, firstParam, formatPrice, productImageUrl, sanitizeSearch } from "@/lib/utils";
import { Card, buttonClasses } from "@/components/ui";
import { Pagination } from "@/components/pagination";
import { ProductRowActions } from "@/components/admin/product-row-actions";
import type { ProductListing } from "@/lib/types";

export const metadata = { title: "Products" };
const PER_PAGE = 20;

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { supabase } = await requireRole("staff");
  const sp = await searchParams;
  const q = sanitizeSearch(firstParam(sp.q) ?? "");
  const page = Math.max(1, Number(firstParam(sp.page)) || 1);
  const from = (page - 1) * PER_PAGE;

  let query = supabase.from("product_listing").select("*", { count: "exact" });
  if (q) query = query.or(`name.ilike.%${q}%,category_name.ilike.%${q}%`);
  const { data, count } = await query.order("created_at", { ascending: false }).range(from, from + PER_PAGE - 1);
  const products = (data ?? []) as ProductListing[];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Products</h1>
          <p className="text-sm text-slate-500">{count ?? 0} product(s)</p>
        </div>
        <div className="flex gap-2">
          <form className="relative" role="search">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              name="q"
              defaultValue={q}
              placeholder="Search products"
              className="h-10 w-56 rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10"
            />
          </form>
          <Link href="/admin/products/new" className={buttonClasses("primary", "md", "h-10")}>
            <Plus className="h-4 w-4" /> New product
          </Link>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Product</th>
                <th className="px-4 py-3 font-semibold">Category</th>
                <th className="px-4 py-3 text-right font-semibold">Price</th>
                <th className="px-4 py-3 text-right font-semibold">Stock</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {products.map((p) => {
                const src = productImageUrl(p.image_paths?.[0]);
                return (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={`/admin/products/${p.id}`} className="flex items-center gap-3">
                        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-slate-100 to-slate-200">
                          {src && <Image src={src} alt="" fill sizes="48px" className="object-cover" />}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-semibold hover:text-brand-600">{p.name}</p>
                          <p className="text-xs text-slate-500">/{p.slug}</p>
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{p.category_name ?? "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-medium">
                      {formatPrice(p.min_price)}
                      {p.min_price !== p.max_price && <span className="text-slate-400"> – {formatPrice(p.max_price)}</span>}
                    </td>
                    <td className={cn("px-4 py-3 text-right font-semibold tabular-nums", p.total_stock <= 0 ? "text-rose-600" : p.total_stock <= 5 ? "text-amber-600" : "")}>
                      {p.total_stock}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", p.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500")}>
                        {p.is_active ? "Active" : "Hidden"}
                      </span>
                      {p.is_featured && <span className="ml-1 rounded-full bg-fuchsia-50 px-2.5 py-0.5 text-xs font-semibold text-fuchsia-700">Featured</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <ProductRowActions id={p.id} slug={p.slug} isActive={p.is_active} />
                    </td>
                  </tr>
                );
              })}
              {products.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                    No products yet. <Link href="/admin/products/new" className="font-semibold text-brand-600">Create one</Link>
                  </td>
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
