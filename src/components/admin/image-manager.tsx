"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight, ImagePlus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteProductImage, reorderProductImages, updateProductImage, uploadProductImages } from "@/app/admin/actions";
import { compressImage, formatBytes } from "@/lib/compress-image";
import { cn, productImageUrl } from "@/lib/utils";
import type { ProductImage } from "@/lib/types";
import { Card, Select, Spinner } from "@/components/ui";

export function ImageManager({
  productId,
  images: initial,
  colors,
}: {
  productId: string;
  images: ProductImage[];
  colors: string[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState(initial);
  const [uploadColor, setUploadColor] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => setImages(initial), [initial]);

  async function handleFiles(list: FileList | null) {
    const files = Array.from(list ?? []).filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    if (files.length > 10) {
      toast.error("Upload up to 10 images at a time.");
      return;
    }

    // Compress in the browser first, then upload in small batches to stay under the request size limit.
    setStatus("Compressing…");
    const compressed: File[] = [];
    let before = 0;
    let after = 0;
    for (const f of files) {
      const c = await compressImage(f, { maxSize: 1800, quality: 0.85 }).catch(() => f);
      before += f.size;
      after += c.size;
      compressed.push(c);
    }

    const batches: File[][] = [];
    let current: File[] = [];
    let size = 0;
    for (const f of compressed) {
      if (current.length && size + f.size > 3_000_000) {
        batches.push(current);
        current = [];
        size = 0;
      }
      current.push(f);
      size += f.size;
    }
    if (current.length) batches.push(current);

    let uploaded = 0;
    for (const [i, batch] of batches.entries()) {
      setStatus(`Uploading ${i + 1}/${batches.length}…`);
      const fd = new FormData();
      batch.forEach((f) => fd.append("files", f));
      if (uploadColor) fd.set("color", uploadColor);
      const res = await uploadProductImages(productId, fd);
      if (!res.ok) toast.error(res.error);
      else uploaded += res.data?.count ?? 0;
    }
    setStatus(null);
    if (uploaded) toast.success(`${uploaded} image(s) uploaded`, { description: `${formatBytes(before)} → ${formatBytes(after)} before server optimisation` });
    router.refresh();
  }

  function move(index: number, delta: number) {
    const next = [...images];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setImages(next);
    startTransition(async () => {
      const res = await reorderProductImages(productId, next.map((i) => i.id));
      if (!res.ok) toast.error(res.error);
    });
  }

  function remove(id: string) {
    if (!confirm("Delete this image?")) return;
    setImages((imgs) => imgs.filter((i) => i.id !== id));
    startTransition(async () => {
      const res = await deleteProductImage(id);
      if (!res.ok) {
        toast.error(res.error);
        router.refresh();
      }
    });
  }

  function setColor(id: string, color: string) {
    setImages((imgs) => imgs.map((i) => (i.id === id ? { ...i, color: color || null } : i)));
    startTransition(async () => {
      const res = await updateProductImage(id, { color: color || null });
      if (!res.ok) toast.error(res.error);
    });
  }

  function setAlt(id: string, alt: string) {
    startTransition(async () => {
      const res = await updateProductImage(id, { alt: alt || null });
      if (!res.ok) toast.error(res.error);
    });
  }

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-bold">Images</h2>
          <p className="text-xs text-slate-500">
            First image is the cover. Images are compressed to WebP automatically. Tag an image with a colour to show it when that colour is picked.
          </p>
        </div>
        {(pending || status) && (
          <span className="inline-flex items-center gap-2 text-sm text-slate-500">
            <Spinner /> {status ?? "Saving…"}
          </span>
        )}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <AnimatePresence initial={false}>
          {images.map((img, i) => {
            const src = productImageUrl(img.path);
            return (
              <motion.div
                key={img.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="group space-y-2"
              >
                <div className="relative aspect-square overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-slate-200">
                  {src && <Image src={src} alt={img.alt ?? ""} fill sizes="200px" className="object-cover" />}
                  {i === 0 && (
                    <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold shadow">
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" /> Cover
                    </span>
                  )}
                  <div className="absolute inset-x-2 bottom-2 flex justify-between opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
                    <div className="flex gap-1">
                      <IconBtn label="Move left" onClick={() => move(i, -1)} disabled={i === 0}>
                        <ChevronLeft className="h-4 w-4" />
                      </IconBtn>
                      <IconBtn label="Move right" onClick={() => move(i, 1)} disabled={i === images.length - 1}>
                        <ChevronRight className="h-4 w-4" />
                      </IconBtn>
                    </div>
                    <IconBtn label="Delete image" onClick={() => remove(img.id)} danger>
                      <Trash2 className="h-4 w-4" />
                    </IconBtn>
                  </div>
                </div>
                {colors.length > 0 && (
                  <Select aria-label="Image colour" value={img.color ?? ""} onChange={(e) => setColor(img.id, e.target.value)} className="h-9 text-xs">
                    <option value="">Any colour</option>
                    {colors.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </Select>
                )}
                <input
                  aria-label="Alt text"
                  defaultValue={img.alt ?? ""}
                  placeholder="Alt text"
                  maxLength={200}
                  onBlur={(e) => e.target.value !== (img.alt ?? "") && setAlt(img.id, e.target.value)}
                  className="h-9 w-full rounded-xl border border-slate-200 px-3 text-xs focus:border-brand-500 focus:outline-none"
                />
              </motion.div>
            );
          })}
        </AnimatePresence>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handleFiles(e.dataTransfer.files);
          }}
          disabled={!!status}
          className={cn(
            "flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed text-sm font-medium text-slate-500 transition",
            dragging ? "border-brand-500 bg-brand-50 text-brand-600" : "border-slate-200 hover:border-brand-400 hover:text-brand-600",
          )}
        >
          <ImagePlus className="h-6 w-6" />
          Add images
          <span className="text-[11px] font-normal text-slate-400">or drop here</span>
        </button>
      </div>

      {colors.length > 0 && (
        <div className="mt-4 flex items-center gap-2 text-sm">
          <span className="text-slate-500">Tag new uploads as:</span>
          <Select value={uploadColor} onChange={(e) => setUploadColor(e.target.value)} className="h-9 w-auto text-xs">
            <option value="">Any colour</option>
            {colors.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="sr-only"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </Card>
  );
}

function IconBtn({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "grid h-8 w-8 place-items-center rounded-lg bg-white/90 shadow backdrop-blur transition disabled:opacity-30",
        danger ? "text-rose-600 hover:bg-rose-50" : "text-slate-700 hover:bg-white",
      )}
    >
      {children}
    </button>
  );
}
