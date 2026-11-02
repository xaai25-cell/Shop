import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { PRODUCT_SELECT } from "@/lib/queries";
import { ProductForm } from "@/components/admin/product-form";
import { ImageManager } from "@/components/admin/image-manager";
import { DeleteProductButton } from "@/components/admin/delete-product-button";
import type { Category, Product } from "@/lib/types";

export const metadata = { title: "Edit product" };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase } = await requireAdmin();

  const [{ data: productData }, { data: cats }] = await Promise.all([
    supabase.from("products").select(PRODUCT_SELECT).eq("id", id).maybeSingle(),
    supabase.from("categories").select("id, name, slug, description, color, sort_order, is_active").order("sort_order"),
  ]);
  if (!productData) notFound();
  const product = productData as unknown as Product;
  product.images = [...product.images].sort((a, b) => a.sort_order - b.sort_order);
  product.variants = [...product.variants].sort((a, b) => a.sort_order - b.sort_order);
  const colors = [...new Set(product.variants.map((v) => v.color).filter(Boolean) as string[])];

  return (
    <div className="space-y-6">
      <Link href="/admin/products" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> Back to products
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-extrabold tracking-tight">{product.name}</h1>
        <div className="flex items-center gap-2">
          <Link href={`/products/${product.slug}`} target="_blank" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600">
            View in store <ExternalLink className="h-3.5 w-3.5" />
          </Link>
          <DeleteProductButton id={product.id} name={product.name} />
        </div>
      </div>
      <ImageManager productId={product.id} images={product.images} colors={colors} />
      <ProductForm categories={(cats ?? []) as Category[]} product={product} />
    </div>
  );
}
