"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronLeft, ChevronRight, Minus, Plus, ShieldCheck, ShoppingBag, Truck } from "lucide-react";
import { toast } from "sonner";
import { useCart } from "@/lib/cart-store";
import { cn, formatPrice, productImageUrl } from "@/lib/utils";
import type { Product, ProductVariant } from "@/lib/types";
import { Button } from "./ui";
import { placeholderGradient } from "./product-card";

export function ProductView({ product }: { product: Product }) {
  const variants = product.variants;
  const colors = useMemo(() => {
    const m = new Map<string, string | null>();
    variants.forEach((v) => v.color && !m.has(v.color) && m.set(v.color, v.color_hex));
    return [...m.entries()].map(([name, hex]) => ({ name, hex }));
  }, [variants]);
  const sizes = useMemo(() => [...new Set(variants.map((v) => v.size).filter(Boolean) as string[])], [variants]);

  const firstAvailable = variants.find((v) => v.stock > 0) ?? variants[0];
  const [color, setColor] = useState<string | null>(firstAvailable?.color ?? null);
  const [size, setSize] = useState<string | null>(firstAvailable?.size ?? null);
  const [qty, setQty] = useState(1);
  const [imageIndex, setImageIndex] = useState(0);
  const add = useCart((s) => s.add);

  const selected: ProductVariant | undefined = variants.find(
    (v) => (colors.length === 0 || v.color === color) && (sizes.length === 0 || v.size === size),
  );

  const images = product.images;
  const price = Number(selected?.price ?? product.base_price);
  const compareAt = product.compare_at_price ? Number(product.compare_at_price) : null;
  const stock = selected?.stock ?? 0;

  function chooseColor(c: string) {
    setColor(c);
    setQty(1);
    // If the current size isn't available in this colour, switch to one that is.
    const match = variants.find((v) => v.color === c && v.size === size && v.stock > 0);
    if (!match) {
      const alt = variants.find((v) => v.color === c && v.stock > 0) ?? variants.find((v) => v.color === c);
      setSize(alt?.size ?? null);
    }
    const idx = images.findIndex((i) => i.color?.toLowerCase() === c.toLowerCase());
    if (idx >= 0) setImageIndex(idx);
  }

  function sizeStock(s: string) {
    return variants.filter((v) => v.size === s && (colors.length === 0 || v.color === color)).reduce((n, v) => n + v.stock, 0);
  }

  function addToCart() {
    if (!selected || stock <= 0) return;
    const img = images.find((i) => i.color && i.color === selected.color) ?? images[0];
    add(
      {
        variantId: selected.id,
        productId: product.id,
        slug: product.slug,
        name: product.name,
        variantLabel: [selected.color, selected.size].filter(Boolean).join(" / ") || null,
        price,
        image: img?.path ?? null,
        maxStock: selected.stock,
      },
      qty,
    );
    toast.success("Added to cart", { description: product.name });
  }

  return (
    <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
      <Gallery product={product} index={imageIndex} setIndex={setImageIndex} />

      <div className="lg:pt-4">
        {product.category && (
          <span
            className="inline-block rounded-full px-3 py-1 text-xs font-bold"
            style={{ backgroundColor: `${product.category.color}1a`, color: product.category.color }}
          >
            {product.category.name}
          </span>
        )}
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">{product.name}</h1>

        <div className="mt-4 flex items-baseline gap-3">
          <motion.span key={price} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="text-2xl font-bold">
            {formatPrice(price)}
          </motion.span>
          {compareAt && compareAt > price && (
            <>
              <span className="text-lg text-slate-400 line-through">{formatPrice(compareAt)}</span>
              <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-bold text-rose-600">
                Save {Math.round((1 - price / compareAt) * 100)}%
              </span>
            </>
          )}
        </div>

        {colors.length > 0 && (
          <div className="mt-8">
            <p className="text-sm font-semibold">
              Colour: <span className="font-normal text-slate-500">{color}</span>
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              {colors.map((c) => {
                const available = variants.some((v) => v.color === c.name && v.stock > 0);
                const active = color === c.name;
                return (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => chooseColor(c.name)}
                    aria-pressed={active}
                    aria-label={`${c.name}${available ? "" : " (sold out)"}`}
                    title={c.name}
                    className={cn(
                      "relative h-11 w-11 rounded-full p-1 ring-2 ring-offset-2 transition",
                      active ? "ring-slate-900" : "ring-transparent hover:ring-slate-300",
                      !available && "opacity-40",
                    )}
                  >
                    <span
                      className="block h-full w-full rounded-full border border-black/10"
                      style={{ backgroundColor: c.hex ?? "#e2e8f0" }}
                    />
                    {!available && <span className="absolute inset-0 m-auto h-px w-10 rotate-45 bg-slate-500" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {sizes.length > 0 && (
          <div className="mt-6">
            <p className="text-sm font-semibold">Size</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {sizes.map((s) => {
                const available = sizeStock(s) > 0;
                const active = size === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setSize(s);
                      setQty(1);
                    }}
                    disabled={!available}
                    aria-pressed={active}
                    className={cn(
                      "h-11 min-w-14 rounded-xl border px-4 text-sm font-semibold transition",
                      active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 hover:border-slate-900",
                      !available && "cursor-not-allowed text-slate-300 line-through hover:border-slate-200",
                    )}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-6 h-5 text-sm font-medium">
          {!selected ? (
            <span className="text-slate-500">This combination is not available.</span>
          ) : stock <= 0 ? (
            <span className="text-rose-600">Sold out</span>
          ) : stock <= 5 ? (
            <span className="text-amber-600">Only {stock} left — order soon!</span>
          ) : (
            <span className="inline-flex items-center gap-1 text-emerald-600">
              <Check className="h-4 w-4" /> In stock
            </span>
          )}
        </div>

        <div className="mt-6 flex gap-3">
          <div className="inline-flex h-13 items-center rounded-2xl border border-slate-200">
            <button
              type="button"
              className="grid h-full w-11 place-items-center rounded-l-2xl hover:bg-slate-50"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              aria-label="Decrease quantity"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="w-8 text-center font-semibold tabular-nums">{qty}</span>
            <button
              type="button"
              className="grid h-full w-11 place-items-center rounded-r-2xl hover:bg-slate-50 disabled:opacity-40"
              onClick={() => setQty((q) => Math.min(Math.min(stock, 20), q + 1))}
              disabled={qty >= Math.min(stock, 20)}
              aria-label="Increase quantity"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <Button size="lg" className="flex-1" onClick={addToCart} disabled={!selected || stock <= 0}>
            <ShoppingBag className="h-5 w-5" />
            {stock <= 0 ? "Sold out" : "Add to cart"}
          </Button>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-4 text-sm">
            <Truck className="h-5 w-5 text-brand-600" /> Fast delivery after payment
          </div>
          <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-4 text-sm">
            <ShieldCheck className="h-5 w-5 text-emerald-600" /> Secure bank transfer
          </div>
        </div>

        {product.description && (
          <div className="mt-10 border-t border-slate-100 pt-8">
            <h2 className="font-bold">Description</h2>
            <p className="mt-3 whitespace-pre-line leading-relaxed text-slate-600">{product.description}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Gallery({
  product,
  index,
  setIndex,
}: {
  product: Product;
  index: number;
  setIndex: (i: number) => void;
}) {
  const images = product.images;
  const [direction, setDirection] = useState(1);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const current = images[index];
  const src = productImageUrl(current?.path);

  const go = (delta: number) => {
    if (images.length < 2) return;
    setDirection(delta);
    setIndex((index + delta + images.length) % images.length);
  };

  return (
    <div className="lg:sticky lg:top-24 lg:self-start">
      <div
        className={cn(
          "relative aspect-square overflow-hidden rounded-[2rem] bg-gradient-to-br",
          placeholderGradient(product.id),
        )}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
        }}
        onMouseLeave={() => setZoom(null)}
      >
        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          {current && src ? (
            <motion.div
              key={current.id}
              custom={direction}
              className="absolute inset-0"
              initial={{ opacity: 0, x: direction * 60 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction * -60 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              drag={images.length > 1 ? "x" : false}
              dragConstraints={{ left: 0, right: 0 }}
              onDragEnd={(_, info) => {
                if (info.offset.x < -60) go(1);
                else if (info.offset.x > 60) go(-1);
              }}
            >
              <Image
                src={src}
                alt={current.alt || product.name}
                fill
                priority
                sizes="(min-width: 1024px) 50vw, 100vw"
                className="object-cover transition-transform duration-300 will-change-transform"
                style={
                  zoom
                    ? { transform: "scale(1.6)", transformOrigin: `${zoom.x}% ${zoom.y}%` }
                    : undefined
                }
                draggable={false}
              />
            </motion.div>
          ) : (
            <div className="absolute inset-0 grid place-items-center">
              <span className="text-8xl font-black text-white/70">{product.name.slice(0, 1)}</span>
            </div>
          )}
        </AnimatePresence>

        {images.length > 1 && (
          <>
            <button
              onClick={() => go(-1)}
              className="absolute left-4 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/80 shadow backdrop-blur transition hover:bg-white"
              aria-label="Previous image"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={() => go(1)}
              className="absolute right-4 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/80 shadow backdrop-blur transition hover:bg-white"
              aria-label="Next image"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <div className="absolute inset-x-0 bottom-4 flex justify-center gap-1.5">
              {images.map((img, i) => (
                <span
                  key={img.id}
                  className={cn("h-1.5 rounded-full bg-white/90 transition-all", i === index ? "w-6" : "w-1.5 opacity-60")}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {images.length > 1 && (
        <div className="scrollbar-none mt-4 flex gap-3 overflow-x-auto pb-1">
          {images.map((img, i) => {
            const thumb = productImageUrl(img.path);
            return (
              <button
                key={img.id}
                onClick={() => {
                  setDirection(i > index ? 1 : -1);
                  setIndex(i);
                }}
                className={cn(
                  "relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl ring-2 ring-offset-2 transition",
                  i === index ? "ring-slate-900" : "ring-transparent opacity-70 hover:opacity-100",
                )}
                aria-label={`Show image ${i + 1}`}
              >
                {thumb && <Image src={thumb} alt="" fill sizes="80px" className="object-cover" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
