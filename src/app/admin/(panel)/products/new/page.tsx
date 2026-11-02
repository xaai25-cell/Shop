import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { ProductForm } from "@/components/admin/product-form";
import type { Category } from "@/lib/types";

export const metadata = { title: "New product" };

export default async function NewProductPage() {
  const { supabase } = await requireAdmin();
  const { data } = await supabase.from("categories").select("id, name, slug, description, color, sort_order, is_active").order("sort_order");
  return (
    <div className="space-y-6">
      <Link href="/admin/products" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> Back to products
      </Link>
      <h1 className="text-2xl font-extrabold tracking-tight">New product</h1>
      <ProductForm categories={(data ?? []) as Category[]} />
    </div>
  );
}
