"use client";

import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ShoppingBag, Trash2 } from "lucide-react";
import { useCart, cartSubtotal } from "@/lib/cart-store";
import { useCartSync } from "@/lib/use-cart-sync";
import { formatPrice, productImageUrl } from "@/lib/utils";
import { QuantityControl } from "./cart-drawer";
import { buttonClasses, Card } from "./ui";

export function CartView() {
  const hydrated = useCartSync();
  const { items, setQuantity, remove } = useCart();

  if (!hydrated) return <div className="skeleton mt-8 h-64" />;

  if (items.length === 0) {
    return (
      <div className="mt-10 flex flex-col items-center rounded-3xl border border-dashed border-slate-200 py-20 text-center">
        <ShoppingBag className="h-10 w-10 text-slate-300" />
        <p className="mt-4 font-semibold">Your cart is empty</p>
        <Link href="/products" className={buttonClasses("primary", "md", "mt-6")}>
          Continue shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_340px]">
      <ul className="divide-y divide-slate-100 rounded-3xl border border-slate-200/80">
        <AnimatePresence initial={false}>
          {items.map((item) => {
            const src = productImageUrl(item.image);
            return (
              <motion.li key={item.variantId} layout exit={{ opacity: 0, height: 0 }} className="flex gap-4 p-4 sm:p-5">
                <Link
                  href={`/products/${item.slug}`}
                  className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200"
                >
                  {src && <Image src={src} alt={item.name} fill sizes="96px" className="object-cover" />}
                </Link>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex justify-between gap-4">
                    <div className="min-w-0">
                      <Link href={`/products/${item.slug}`} className="line-clamp-1 font-semibold hover:text-brand-600">
                        {item.name}
                      </Link>
                      {item.variantLabel && <p className="text-sm text-slate-500">{item.variantLabel}</p>}
                      <p className="mt-1 text-sm text-slate-500">{formatPrice(item.price)} each</p>
                    </div>
                    <p className="shrink-0 font-bold">{formatPrice(item.price * item.quantity)}</p>
                  </div>
                  <div className="mt-auto flex items-center justify-between pt-3">
                    <QuantityControl value={item.quantity} max={item.maxStock} onChange={(q) => setQuantity(item.variantId, q)} />
                    <button
                      onClick={() => remove(item.variantId)}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="h-4 w-4" /> Remove
                    </button>
                  </div>
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>

      <Card className="h-fit p-6 lg:sticky lg:top-24">
        <h2 className="font-bold">Order summary</h2>
        <div className="mt-4 flex justify-between text-sm">
          <span className="text-slate-500">Subtotal</span>
          <span className="font-semibold">{formatPrice(cartSubtotal(items))}</span>
        </div>
        <p className="mt-2 text-xs text-slate-500">Delivery fee is shown at checkout.</p>
        <Link href="/checkout" className={buttonClasses("primary", "lg", "mt-6 w-full")}>
          Proceed to checkout
        </Link>
        <Link href="/products" className={buttonClasses("ghost", "md", "mt-2 w-full")}>
          Continue shopping
        </Link>
      </Card>
    </div>
  );
}
