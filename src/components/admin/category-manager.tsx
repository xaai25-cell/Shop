"use client";

import Image from "next/image";
import { useRef, useState, useTransition } from "react";
import { ImagePlus, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { deleteCategory, removeCategoryImage, saveCategory, uploadCategoryImage } from "@/app/admin/actions";
import { compressImage } from "@/lib/compress-image";
import { categoryImageUrl, slugify } from "@/lib/utils";
import type { Category } from "@/lib/types";
import { Button, Card, Checkbox, Field, Input, Spinner, Textarea } from "@/components/ui";

type Draft = {
  id?: string;
  name: string;
  slug: string;
  description: string;
  color: string;
  sort_order: string;
  is_active: boolean;
};

const PALETTE = ["#ec4899", "#f97316", "#eab308", "#10b981", "#0ea5e9", "#6366f1", "#8b5cf6", "#ef4444"];
const blank = (n: number): Draft => ({
  name: "",
  slug: "",
  description: "",
  color: PALETTE[n % PALETTE.length],
  sort_order: String(n + 1),
  is_active: true,
});

export function CategoryManager({
  categories,
  productCounts,
  canDelete,
}: {
  categories: Category[];
  productCounts: Record<string, number>;
  canDelete: boolean;
}) {
  const [draft, setDraft] = useState<Draft>(blank(categories.length));
  const [pending, startTransition] = useTransition();

  const edit = (c: Category) =>
    setDraft({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description ?? "",
      color: c.color,
      sort_order: String(c.sort_order),
      is_active: c.is_active,
    });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await saveCategory(draft);
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message ?? "Saved");
      setDraft(blank(categories.length + (draft.id ? 0 : 1)));
    });
  }

  function remove(c: Category) {
    const n = productCounts[c.id] ?? 0;
    if (!confirm(`Delete "${c.name}"?${n ? ` ${n} product(s) will become uncategorised.` : ""}`)) return;
    startTransition(async () => {
      const res = await deleteCategory(c.id);
      if (!res.ok) toast.error(res.error);
      else toast.success("Category deleted");
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <Card className="divide-y divide-slate-100">
        {categories.map((c) => (
          <div key={c.id} className="flex items-center gap-4 p-4">
            <CategoryImage category={c} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                {c.name} {!c.is_active && <span className="ml-1 text-xs font-medium text-slate-400">(hidden)</span>}
              </p>
              <p className="text-xs text-slate-500">/{c.slug} · {productCounts[c.id] ?? 0} products · order {c.sort_order}</p>
            </div>
            <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={() => edit(c)} aria-label={`Edit ${c.name}`}>
              <Pencil className="h-4 w-4" />
            </button>
            {canDelete && (
              <button className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-600" onClick={() => remove(c)} aria-label={`Delete ${c.name}`}>
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
        {categories.length === 0 && <p className="p-8 text-center text-sm text-slate-500">No categories yet.</p>}
      </Card>

      <Card className="h-fit p-6">
        <form onSubmit={submit} className="space-y-4">
          <h2 className="font-bold">{draft.id ? "Edit category" : "New category"}</h2>
          <Field label="Name" htmlFor="cat-name">
            <Input
              id="cat-name"
              required
              maxLength={80}
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value, slug: d.id ? d.slug : slugify(e.target.value) }))}
            />
          </Field>
          <Field label="Slug" htmlFor="cat-slug">
            <Input id="cat-slug" required value={draft.slug} onChange={(e) => setDraft((d) => ({ ...d, slug: slugify(e.target.value) }))} />
          </Field>
          <Field label="Description" htmlFor="cat-desc">
            <Textarea id="cat-desc" maxLength={500} value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} />
          </Field>
          <div>
            <p className="mb-1.5 text-sm font-medium text-slate-700">Colour</p>
            <div className="flex flex-wrap items-center gap-2">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  onClick={() => setDraft((d) => ({ ...d, color: c }))}
                  className={`h-8 w-8 rounded-full ring-2 ring-offset-2 transition ${draft.color === c ? "ring-slate-900" : "ring-transparent"}`}
                  style={{ backgroundColor: c }}
                />
              ))}
              <input
                type="color"
                aria-label="Custom colour"
                value={draft.color}
                onChange={(e) => setDraft((d) => ({ ...d, color: e.target.value }))}
                className="h-8 w-10 cursor-pointer rounded-lg border border-slate-200 bg-white p-0.5"
              />
            </div>
          </div>
          <Field label="Sort order" htmlFor="cat-order">
            <Input id="cat-order" type="number" min={0} value={draft.sort_order} onChange={(e) => setDraft((d) => ({ ...d, sort_order: e.target.value }))} />
          </Field>
          <Checkbox label="Visible in store" checked={draft.is_active} onChange={(e) => setDraft((d) => ({ ...d, is_active: e.target.checked }))} />
          <div className="flex gap-2">
            {draft.id && (
              <Button type="button" variant="ghost" onClick={() => setDraft(blank(categories.length))}>
                Cancel
              </Button>
            )}
            <Button type="submit" className="flex-1" loading={pending}>
              <Plus className="h-4 w-4" /> {draft.id ? "Save" : "Add category"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function CategoryImage({ category }: { category: Category }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const src = categoryImageUrl(category.image_path);

  async function upload(file: File | undefined) {
    if (!file) return;
    const compressed = await compressImage(file, { maxSize: 1600, quality: 0.82 }).catch(() => file);
    const fd = new FormData();
    fd.set("file", compressed);
    startTransition(async () => {
      const res = await uploadCategoryImage(category.id, fd);
      if (res.ok) toast.success(res.message ?? "Uploaded");
      else toast.error(res.error);
    });
  }

  return (
    <div className="group relative h-14 w-20 shrink-0">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={pending}
        aria-label={`Change image for ${category.name}`}
        title="Change cover image"
        className="relative block h-full w-full overflow-hidden rounded-xl ring-1 ring-slate-200"
        style={{ background: `linear-gradient(135deg, ${category.color}, ${category.color}88)` }}
      >
        {src && <Image src={src} alt="" fill sizes="80px" className="object-cover" />}
        <span className="absolute inset-0 grid place-items-center bg-slate-900/40 text-white opacity-0 transition group-hover:opacity-100">
          {pending ? <Spinner className="h-4 w-4" /> : <ImagePlus className="h-4 w-4" />}
        </span>
      </button>
      {src && !pending && (
        <button
          type="button"
          aria-label={`Remove image for ${category.name}`}
          onClick={() => {
            if (!confirm("Remove this category image?")) return;
            startTransition(async () => {
              const res = await removeCategoryImage(category.id);
              if (!res.ok) toast.error(res.error);
            });
          }}
          className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 place-items-center rounded-full bg-white text-slate-500 shadow ring-1 ring-slate-200 hover:text-rose-600 group-hover:grid"
        >
          <X className="h-3 w-3" />
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(e) => {
          upload(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
