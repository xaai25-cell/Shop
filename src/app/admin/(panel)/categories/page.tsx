import { requireRole } from "@/lib/auth";
import { hasRole } from "@/lib/roles";
import { CategoryManager } from "@/components/admin/category-manager";
import type { Category } from "@/lib/types";

export const metadata = { title: "Categories" };

export default async function CategoriesPage() {
  const { supabase, role } = await requireRole("staff");
  const [{ data }, { data: counts }] = await Promise.all([
    supabase.from("categories").select("id, name, slug, description, color, image_path, sort_order, is_active").order("sort_order").order("name"),
    supabase.from("products").select("category_id"),
  ]);
  const productCounts: Record<string, number> = {};
  for (const p of (counts ?? []) as { category_id: string | null }[]) {
    if (p.category_id) productCounts[p.category_id] = (productCounts[p.category_id] ?? 0) + 1;
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Categories</h1>
        <p className="text-sm text-slate-500">Organise products and give each category its own colour.</p>
      </div>
      <CategoryManager categories={(data ?? []) as Category[]} productCounts={productCounts} canDelete={hasRole(role, "manager")} />
    </div>
  );
}
