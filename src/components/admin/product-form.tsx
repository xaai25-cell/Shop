"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Copy, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { saveProduct } from "@/app/admin/actions";
import { slugify } from "@/lib/utils";
import type { Category, Product } from "@/lib/types";
import { Button, Card, Checkbox, Field, Input, Select, Textarea } from "@/components/ui";

type VariantRow = {
  key: string;
  id?: string;
  sku: string;
  color: string;
  color_hex: string;
  size: string;
  price: string;
  stock: string;
  is_active: boolean;
};

let counter = 0;
const newKey = () => `v${Date.now()}-${counter++}`;
const emptyVariant = (): VariantRow => ({
  key: newKey(),
  sku: "",
  color: "",
  color_hex: "",
  size: "",
  price: "",
  stock: "0",
  is_active: true,
});

export function ProductForm({ categories, product }: { categories: Category[]; product?: Product }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(product?.name ?? "");
  const [slug, setSlug] = useState(product?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(!!product);
  const [description, setDescription] = useState(product?.description ?? "");
  const [categoryId, setCategoryId] = useState(product?.category_id ?? "");
  const [basePrice, setBasePrice] = useState(product ? String(product.base_price) : "");
  const [compareAt, setCompareAt] = useState(product?.compare_at_price != null ? String(product.compare_at_price) : "");
  const [isActive, setIsActive] = useState(product?.is_active ?? true);
  const [isFeatured, setIsFeatured] = useState(product?.is_featured ?? false);
  const [variants, setVariants] = useState<VariantRow[]>(
    product?.variants.length
      ? product.variants.map((v) => ({
          key: v.id,
          id: v.id,
          sku: v.sku ?? "",
          color: v.color ?? "",
          color_hex: v.color_hex ?? "",
          size: v.size ?? "",
          price: v.price != null ? String(v.price) : "",
          stock: String(v.stock),
          is_active: v.is_active,
        }))
      : [emptyVariant()],
  );

  const updateVariant = (key: string, patch: Partial<VariantRow>) =>
    setVariants((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const totalStock = variants.reduce((n, v) => n + (Number(v.stock) || 0), 0);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await saveProduct(product?.id ?? null, {
        name,
        slug,
        description,
        category_id: categoryId,
        base_price: basePrice,
        compare_at_price: compareAt,
        is_active: isActive,
        is_featured: isFeatured,
        variants: variants.map((v) => ({
          id: v.id,
          sku: v.sku,
          color: v.color,
          color_hex: v.color_hex,
          size: v.size,
          price: v.price,
          stock: v.stock,
          is_active: v.is_active,
        })),
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(res.message ?? "Saved");
      if (!product && res.data) router.push(`/admin/products/${res.data.id}`);
      else router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-6 xl:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <Card className="space-y-5 p-6">
          <h2 className="font-bold">Details</h2>
          <Field label="Name" htmlFor="name">
            <Input
              id="name"
              value={name}
              required
              maxLength={160}
              onChange={(e) => {
                setName(e.target.value);
                if (!slugTouched) setSlug(slugify(e.target.value));
              }}
            />
          </Field>
          <Field label="URL slug" htmlFor="slug" hint={`/products/${slug || "your-product"}`}>
            <Input
              id="slug"
              value={slug}
              required
              maxLength={80}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(slugify(e.target.value));
              }}
            />
          </Field>
          <Field label="Description" htmlFor="description">
            <Textarea id="description" rows={6} value={description} maxLength={5000} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </Card>

        <Card className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-bold">Variants & stock</h2>
              <p className="text-xs text-slate-500">
                Each colour/size combination has its own stock. Leave price empty to use the base price. Total stock: {totalStock}
              </p>
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={() => setVariants((v) => [...v, emptyVariant()])}>
              <Plus className="h-4 w-4" /> Add variant
            </Button>
          </div>

          <div className="mt-4 space-y-3">
            <AnimatePresence initial={false}>
              {variants.map((v) => (
                <motion.div
                  key={v.key}
                  layout
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 p-3 sm:grid-cols-[1.2fr_auto_0.8fr_1fr_0.9fr_0.8fr_auto]"
                >
                  <Input aria-label="Colour name" placeholder="Colour (e.g. Coral)" value={v.color} maxLength={40} onChange={(e) => updateVariant(v.key, { color: e.target.value })} />
                  <div className="flex items-center gap-1">
                    <input
                      type="color"
                      aria-label="Colour swatch"
                      value={v.color_hex || "#cccccc"}
                      onChange={(e) => updateVariant(v.key, { color_hex: e.target.value })}
                      className="h-11 w-11 cursor-pointer rounded-xl border border-slate-200 bg-white p-1"
                    />
                    {v.color_hex && (
                      <button type="button" className="text-xs text-slate-400 hover:text-slate-700" onClick={() => updateVariant(v.key, { color_hex: "" })}>
                        clear
                      </button>
                    )}
                  </div>
                  <Input aria-label="Size" placeholder="Size" value={v.size} maxLength={20} onChange={(e) => updateVariant(v.key, { size: e.target.value })} />
                  <Input aria-label="SKU" placeholder="SKU" value={v.sku} maxLength={64} onChange={(e) => updateVariant(v.key, { sku: e.target.value })} />
                  <Input aria-label="Price override" placeholder="Price" type="number" min={0} step="0.01" value={v.price} onChange={(e) => updateVariant(v.key, { price: e.target.value })} />
                  <Input aria-label="Stock" placeholder="Stock" type="number" min={0} step={1} value={v.stock} onChange={(e) => updateVariant(v.key, { stock: e.target.value })} />
                  <div className="col-span-2 flex items-center justify-between gap-1 sm:col-span-1">
                    <Checkbox label="Active" checked={v.is_active} onChange={(e) => updateVariant(v.key, { is_active: e.target.checked })} />
                    <button
                      type="button"
                      className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      aria-label="Duplicate variant"
                      onClick={() => setVariants((rows) => [...rows, { ...v, key: newKey(), id: undefined, sku: "", size: "" }])}
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"
                      aria-label="Remove variant"
                      disabled={variants.length === 1}
                      onClick={() => setVariants((rows) => rows.filter((r) => r.key !== v.key))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </Card>
      </div>

      <div className="space-y-6">
        <Card className="space-y-5 p-6">
          <h2 className="font-bold">Pricing</h2>
          <Field label="Base price" htmlFor="base_price">
            <Input id="base_price" type="number" min={0} step="0.01" required value={basePrice} onChange={(e) => setBasePrice(e.target.value)} />
          </Field>
          <Field label="Compare-at price" htmlFor="compare_at" hint="Optional original price, shows a sale badge">
            <Input id="compare_at" type="number" min={0} step="0.01" value={compareAt} onChange={(e) => setCompareAt(e.target.value)} />
          </Field>
        </Card>
        <Card className="space-y-4 p-6">
          <h2 className="font-bold">Organisation</h2>
          <Field label="Category" htmlFor="category">
            <Select id="category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">No category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <Checkbox label="Visible in store" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          <Checkbox label="Featured on home page" checked={isFeatured} onChange={(e) => setIsFeatured(e.target.checked)} />
        </Card>
        <Button type="submit" size="lg" className="w-full" loading={pending}>
          {product ? "Save changes" : "Create product"}
        </Button>
        {!product && <p className="text-center text-xs text-slate-500">You can add images after creating the product.</p>}
      </div>
    </form>
  );
}
