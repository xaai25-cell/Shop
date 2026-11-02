"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type CartItem = {
  variantId: string;
  productId: string;
  slug: string;
  name: string;
  variantLabel: string | null;
  price: number;
  image: string | null;
  quantity: number;
  maxStock: number;
};

type CartState = {
  items: CartItem[];
  isOpen: boolean;
  add: (item: Omit<CartItem, "quantity">, quantity?: number) => void;
  setQuantity: (variantId: string, quantity: number) => void;
  remove: (variantId: string) => void;
  clear: () => void;
  replace: (items: CartItem[]) => void;
  open: () => void;
  close: () => void;
};

const MAX_PER_ITEM = 20;

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      isOpen: false,
      add: (item, quantity = 1) =>
        set((state) => {
          const existing = state.items.find((i) => i.variantId === item.variantId);
          const cap = Math.min(item.maxStock, MAX_PER_ITEM);
          if (existing) {
            return {
              isOpen: true,
              items: state.items.map((i) =>
                i.variantId === item.variantId
                  ? { ...i, ...item, quantity: Math.min(i.quantity + quantity, cap) }
                  : i,
              ),
            };
          }
          return { isOpen: true, items: [...state.items, { ...item, quantity: Math.min(quantity, cap) }] };
        }),
      setQuantity: (variantId, quantity) =>
        set((state) => ({
          items: state.items
            .map((i) =>
              i.variantId === variantId
                ? { ...i, quantity: Math.max(0, Math.min(quantity, i.maxStock, MAX_PER_ITEM)) }
                : i,
            )
            .filter((i) => i.quantity > 0),
        })),
      remove: (variantId) => set((state) => ({ items: state.items.filter((i) => i.variantId !== variantId) })),
      clear: () => set({ items: [] }),
      replace: (items) => set({ items }),
      open: () => set({ isOpen: true }),
      close: () => set({ isOpen: false }),
    }),
    {
      name: "cart-v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ items: s.items }),
    },
  ),
);

export const cartCount = (items: CartItem[]) => items.reduce((n, i) => n + i.quantity, 0);
export const cartSubtotal = (items: CartItem[]) => items.reduce((n, i) => n + i.price * i.quantity, 0);
