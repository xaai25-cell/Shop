"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { refreshCart } from "@/app/actions/orders";
import { useCart } from "@/lib/cart-store";
import { useHydrated } from "@/lib/use-hydrated";

/** Re-validates cart prices & stock against the database once per mount. */
export function useCartSync() {
  const hydrated = useHydrated();
  const done = useRef(false);

  useEffect(() => {
    if (!hydrated || done.current) return;
    done.current = true;
    const { items, replace } = useCart.getState();
    if (items.length === 0) return;

    refreshCart(items.map((i) => i.variantId)).then((live) => {
      const map = new Map(live.map((l) => [l.id, l]));
      let changed = false;
      const next = useCart
        .getState()
        .items.map((i) => {
          const l = map.get(i.variantId);
          if (!l || l.stock <= 0) {
            changed = true;
            return null;
          }
          const quantity = Math.min(i.quantity, l.stock);
          if (quantity !== i.quantity || l.price !== i.price || l.stock !== i.maxStock) changed = true;
          return { ...i, price: l.price, maxStock: l.stock, quantity };
        })
        .filter((i): i is NonNullable<typeof i> => i !== null);
      if (changed) {
        replace(next);
        toast.info("Your cart was updated with the latest prices and stock.");
      }
    }).catch(() => {});
  }, [hydrated]);

  return hydrated;
}
