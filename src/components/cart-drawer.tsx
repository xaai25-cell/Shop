"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Minus, Plus, ShoppingBag, Trash2, X } from "lucide-react";
import { useCart, cartSubtotal } from "@/lib/cart-store";
import { useHydrated } from "@/lib/use-hydrated";
import { formatPrice, productImageUrl } from "@/lib/utils";
import { buttonClasses } from "./ui";

export function CartDrawer() {
  const { items, isOpen, close, setQuantity, remove } = useCart();
  const hydrated = useHydrated();

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [isOpen, close]);

  if (!hydrated) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="Shopping cart"
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-2xl"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-bold">Your cart</h2>
              <button onClick={close} className="rounded-lg p-2 hover:bg-slate-100" aria-label="Close cart">
                <X className="h-5 w-5" />
              </button>
            </div>

            {items.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
                <div className="grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-brand-50 to-fuchsia-50">
                  <ShoppingBag className="h-9 w-9 text-brand-500" />
                </div>
                <p className="font-semibold">Your cart is empty</p>
                <p className="text-sm text-slate-500">Discover something you&apos;ll love.</p>
                <Link href="/products" onClick={close} className={buttonClasses("primary")}>
                  Start shopping
                </Link>
              </div>
            ) : (
              <>
                <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto px-5">
                  <AnimatePresence initial={false}>
                    {items.map((item) => {
                      const src = productImageUrl(item.image);
                      return (
                        <motion.li
                          key={item.variantId}
                          layout
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -20, height: 0 }}
                          className="flex gap-4 py-4"
                        >
                          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-slate-100 to-slate-200">
                            {src && <Image src={src} alt={item.name} fill sizes="80px" className="object-cover" />}
                          </div>
                          <div className="flex min-w-0 flex-1 flex-col">
                            <Link
                              href={`/products/${item.slug}`}
                              onClick={close}
                              className="line-clamp-1 font-semibold hover:text-brand-600"
                            >
                              {item.name}
                            </Link>
                            {item.variantLabel && <p className="text-xs text-slate-500">{item.variantLabel}</p>}
                            <div className="mt-auto flex items-center justify-between pt-2">
                              <QuantityControl
                                value={item.quantity}
                                max={item.maxStock}
                                onChange={(q) => setQuantity(item.variantId, q)}
                              />
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold">{formatPrice(item.price * item.quantity)}</span>
                                <button
                                  onClick={() => remove(item.variantId)}
                                  className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                  aria-label={`Remove ${item.name}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </motion.li>
                      );
                    })}
                  </AnimatePresence>
                </ul>
                <div className="space-y-3 border-t border-slate-100 p-5">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Subtotal</span>
                    <span className="font-bold">{formatPrice(cartSubtotal(items))}</span>
                  </div>
                  <p className="text-xs text-slate-500">Delivery calculated at checkout.</p>
                  <Link href="/checkout" onClick={close} className={buttonClasses("primary", "lg", "w-full")}>
                    Checkout
                  </Link>
                  <Link href="/cart" onClick={close} className={buttonClasses("outline", "md", "w-full")}>
                    View cart
                  </Link>
                </div>
              </>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

export function QuantityControl({
  value,
  max,
  onChange,
}: {
  value: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="inline-flex items-center rounded-full border border-slate-200">
      <button
        type="button"
        onClick={() => onChange(value - 1)}
        className="grid h-8 w-8 place-items-center rounded-full hover:bg-slate-100"
        aria-label="Decrease quantity"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="w-7 text-center text-sm font-semibold tabular-nums" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        disabled={value >= Math.min(max, 20)}
        className="grid h-8 w-8 place-items-center rounded-full hover:bg-slate-100 disabled:opacity-40"
        aria-label="Increase quantity"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
