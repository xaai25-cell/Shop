"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "motion/react";
import { formatPrice, productImageUrl } from "@/lib/utils";
import type { ProductListing } from "@/lib/types";

const FALLBACK = [
  "from-pink-400 to-orange-300",
  "from-sky-400 to-emerald-300",
  "from-violet-500 to-fuchsia-400",
];

export function HeroVisual({ products }: { products: ProductListing[] }) {
  const tiles = products.slice(0, 3);
  const positions = [
    "left-0 top-6 w-[58%] rotate-[-4deg]",
    "right-0 top-0 w-[46%] rotate-[5deg]",
    "right-[12%] bottom-0 w-[44%] rotate-[-2deg]",
  ];

  return (
    <div className="relative mx-auto aspect-square w-full max-w-lg">
      {[0, 1, 2].map((i) => {
        const p = tiles[i];
        const src = productImageUrl(p?.image_paths?.[0]);
        return (
          <motion.div
            key={i}
            className={`absolute ${positions[i]}`}
            initial={{ opacity: 0, y: 40, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.15 + i * 0.12, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 5 + i, repeat: Infinity, ease: "easeInOut" }}
              className="overflow-hidden rounded-[2rem] bg-white p-2 shadow-2xl shadow-slate-900/15"
            >
              <div className={`relative aspect-[4/5] overflow-hidden rounded-[1.6rem] bg-gradient-to-br ${FALLBACK[i]}`}>
                {src && p && (
                  <Image src={src} alt={p.name} fill priority={i === 0} sizes="300px" className="object-cover" />
                )}
              </div>
              {p && (
                <Link href={`/products/${p.slug}`} className="flex items-center justify-between gap-2 px-2 py-2.5">
                  <span className="line-clamp-1 text-sm font-semibold">{p.name}</span>
                  <span className="shrink-0 rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-bold text-white">
                    {formatPrice(p.min_price)}
                  </span>
                </Link>
              )}
            </motion.div>
          </motion.div>
        );
      })}
    </div>
  );
}
