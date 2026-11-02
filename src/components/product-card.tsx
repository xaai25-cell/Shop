import Image from "next/image";
import Link from "next/link";
import { cn, formatPrice, productImageUrl } from "@/lib/utils";
import type { ProductListing } from "@/lib/types";

const GRADIENTS = [
  "from-pink-200 via-fuchsia-200 to-indigo-200",
  "from-amber-200 via-orange-200 to-rose-200",
  "from-emerald-200 via-teal-200 to-sky-200",
  "from-violet-200 via-purple-200 to-pink-200",
  "from-sky-200 via-cyan-200 to-emerald-200",
];

export function placeholderGradient(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length];
}

export function ProductCard({ product, priority = false }: { product: ProductListing; priority?: boolean }) {
  const [first, second] = product.image_paths ?? [];
  const img1 = productImageUrl(first);
  const img2 = productImageUrl(second);
  const outOfStock = product.total_stock <= 0;
  const onSale = product.compare_at_price && Number(product.compare_at_price) > Number(product.min_price);
  const discount = onSale
    ? Math.round((1 - Number(product.min_price) / Number(product.compare_at_price)) * 100)
    : 0;
  const swatches = product.swatches ?? [];

  return (
    <Link
      href={`/products/${product.slug}`}
      className="group block rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-4"
    >
      <div
        className={cn(
          "relative aspect-[4/5] overflow-hidden rounded-3xl bg-gradient-to-br transition-shadow duration-500 group-hover:shadow-xl group-hover:shadow-brand-500/10",
          placeholderGradient(product.id),
        )}
      >
        {img1 ? (
          <>
            <Image
              src={img1}
              alt={product.name}
              fill
              priority={priority}
              sizes="(min-width: 1280px) 300px, (min-width: 768px) 33vw, 50vw"
              className={cn(
                "object-cover transition duration-700 ease-out group-hover:scale-105",
                img2 && "group-hover:opacity-0",
              )}
            />
            {img2 && (
              <Image
                src={img2}
                alt=""
                fill
                sizes="(min-width: 1280px) 300px, (min-width: 768px) 33vw, 50vw"
                className="object-cover opacity-0 transition duration-700 ease-out group-hover:scale-105 group-hover:opacity-100"
              />
            )}
          </>
        ) : (
          <div className="absolute inset-0 grid place-items-center">
            <span className="text-5xl font-black text-white/70 drop-shadow-sm">{product.name.slice(0, 1)}</span>
          </div>
        )}

        <div className="absolute left-3 top-3 flex flex-col gap-1.5">
          {onSale && (
            <span className="rounded-full bg-rose-500 px-2.5 py-1 text-[11px] font-bold text-white shadow">
              -{discount}%
            </span>
          )}
          {product.is_featured && !onSale && (
            <span className="rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold text-slate-900 shadow backdrop-blur">
              Featured
            </span>
          )}
        </div>
        {outOfStock && (
          <div className="absolute inset-x-3 bottom-3 rounded-xl bg-slate-900/80 py-2 text-center text-xs font-semibold text-white backdrop-blur">
            Sold out
          </div>
        )}
      </div>

      <div className="mt-3 space-y-1 px-1">
        {product.category_name && (
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{product.category_name}</p>
        )}
        <h3 className="line-clamp-1 font-semibold text-slate-900 transition group-hover:text-brand-600">
          {product.name}
        </h3>
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm">
            <span className="font-bold text-slate-900">
              {product.min_price !== product.max_price && "From "}
              {formatPrice(product.min_price)}
            </span>
            {onSale && (
              <span className="ml-2 text-xs text-slate-400 line-through">{formatPrice(product.compare_at_price)}</span>
            )}
          </p>
          {swatches.length > 0 && (
            <div className="flex -space-x-1">
              {swatches.slice(0, 4).map((s) => (
                <span
                  key={s.color}
                  title={s.color}
                  className="h-4 w-4 rounded-full border-2 border-white shadow-sm ring-1 ring-slate-200"
                  style={{ backgroundColor: s.hex }}
                />
              ))}
              {swatches.length > 4 && (
                <span className="pl-2 text-[11px] font-medium text-slate-400">+{swatches.length - 4}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

export function ProductCardSkeleton() {
  return (
    <div>
      <div className="skeleton aspect-[4/5] rounded-3xl!" />
      <div className="mt-3 space-y-2 px-1">
        <div className="skeleton h-3 w-16" />
        <div className="skeleton h-4 w-3/4" />
        <div className="skeleton h-4 w-1/3" />
      </div>
    </div>
  );
}
