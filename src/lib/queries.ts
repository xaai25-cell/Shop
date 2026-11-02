import "server-only";
import { cache } from "react";
import { createPublicClient } from "@/lib/supabase/public";
import { PAGE_SIZE } from "@/lib/config";
import { sanitizeSearch } from "@/lib/utils";
import type { Category, Product, ProductListing } from "@/lib/types";

export const getCategories = cache(async (): Promise<Category[]> => {
  const { data, error } = await createPublicClient()
    .from("categories")
    .select("id, name, slug, description, color, sort_order, is_active")
    .eq("is_active", true)
    .order("sort_order")
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as Category[];
});

export type ProductFilters = {
  q?: string;
  category?: string;
  color?: string;
  size?: string;
  min?: number;
  max?: number;
  inStock?: boolean;
  sort?: string;
  page?: number;
};

export async function getProducts(filters: ProductFilters) {
  const page = Math.max(1, filters.page ?? 1);
  const from = (page - 1) * PAGE_SIZE;

  let query = createPublicClient()
    .from("product_listing")
    .select("*", { count: "exact" })
    .eq("is_active", true);

  const q = filters.q ? sanitizeSearch(filters.q) : "";
  if (q) query = query.or(`name.ilike.%${q}%,description.ilike.%${q}%,category_name.ilike.%${q}%`);
  if (filters.category) query = query.eq("category_slug", filters.category);
  if (filters.color) query = query.contains("colors", [filters.color]);
  if (filters.size) query = query.contains("sizes", [filters.size]);
  if (filters.min !== undefined && Number.isFinite(filters.min)) query = query.gte("min_price", filters.min);
  if (filters.max !== undefined && Number.isFinite(filters.max)) query = query.lte("min_price", filters.max);
  if (filters.inStock) query = query.gt("total_stock", 0);

  switch (filters.sort) {
    case "price_asc":
      query = query.order("min_price", { ascending: true });
      break;
    case "price_desc":
      query = query.order("min_price", { ascending: false });
      break;
    case "name":
      query = query.order("name", { ascending: true });
      break;
    default:
      query = query.order("created_at", { ascending: false });
  }

  const { data, count, error } = await query.order("id").range(from, from + PAGE_SIZE - 1);
  if (error) throw new Error(error.message);

  return {
    products: (data ?? []) as ProductListing[],
    total: count ?? 0,
    page,
    pageCount: Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE)),
  };
}

/** Distinct colours/sizes for the filter sidebar. */
export const getFilterFacets = cache(async () => {
  const { data } = await createPublicClient()
    .from("product_variants")
    .select("color, color_hex, size")
    .eq("is_active", true)
    .limit(2000);

  const colors = new Map<string, string | null>();
  const sizes = new Set<string>();
  for (const v of (data ?? []) as { color: string | null; color_hex: string | null; size: string | null }[]) {
    if (v.color && !colors.has(v.color)) colors.set(v.color, v.color_hex);
    if (v.size) sizes.add(v.size);
  }
  const sizeOrder = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "3XL"];
  return {
    colors: [...colors.entries()].map(([name, hex]) => ({ name, hex })).sort((a, b) => a.name.localeCompare(b.name)),
    sizes: [...sizes].sort((a, b) => {
      const ia = sizeOrder.indexOf(a.toUpperCase());
      const ib = sizeOrder.indexOf(b.toUpperCase());
      if (ia !== -1 && ib !== -1) return ia - ib;
      const na = Number(a), nb = Number(b);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    }),
  };
});

export async function getFeaturedProducts(limit = 8) {
  const { data } = await createPublicClient()
    .from("product_listing")
    .select("*")
    .eq("is_active", true)
    .eq("is_featured", true)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as ProductListing[];
}

export async function getNewArrivals(limit = 8) {
  const { data } = await createPublicClient()
    .from("product_listing")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as ProductListing[];
}

const PRODUCT_SELECT = `
  id, name, slug, description, category_id, base_price, compare_at_price, is_active, is_featured, created_at,
  category:categories ( id, name, slug, color ),
  images:product_images ( id, product_id, path, alt, color, width, height, sort_order ),
  variants:product_variants ( id, product_id, sku, color, color_hex, size, price, stock, is_active, sort_order )
`;

export const getProductBySlug = cache(async (slug: string): Promise<Product | null> => {
  const { data } = await createPublicClient()
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  if (!data) return null;
  const product = data as unknown as Product;
  product.images = [...(product.images ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  product.variants = [...(product.variants ?? [])]
    .filter((v) => v.is_active)
    .sort((a, b) => a.sort_order - b.sort_order);
  return product;
});

export async function getRelatedProducts(categoryId: string | null, excludeId: string, limit = 4) {
  if (!categoryId) return [];
  const { data } = await createPublicClient()
    .from("product_listing")
    .select("*")
    .eq("is_active", true)
    .eq("category_id", categoryId)
    .neq("id", excludeId)
    .limit(limit);
  return (data ?? []) as ProductListing[];
}

export { PRODUCT_SELECT };
