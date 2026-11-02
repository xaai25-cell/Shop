"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import { placeOrder } from "@/app/actions/orders";
import { useCart, cartSubtotal } from "@/lib/cart-store";
import { useCartSync } from "@/lib/use-cart-sync";
import { formatPrice, productImageUrl } from "@/lib/utils";
import { siteConfig } from "@/lib/config";
import { Button, Card, Field, Input, Textarea, buttonClasses } from "./ui";

type Errors = Record<string, string[] | undefined>;

export function CheckoutForm({ deliveryFee }: { deliveryFee: number }) {
  const hydrated = useCartSync();
  const router = useRouter();
  const items = useCart((s) => s.items);
  const clear = useCart((s) => s.clear);
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);

  if (!hydrated) return <div className="skeleton mt-8 h-96" />;

  if (items.length === 0) {
    return (
      <div className="mt-10 rounded-3xl border border-dashed border-slate-200 py-16 text-center">
        <p className="font-semibold">Your cart is empty</p>
        <Link href="/products" className={buttonClasses("primary", "md", "mt-6")}>
          Browse products
        </Link>
      </div>
    );
  }

  const subtotal = cartSubtotal(items);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const get = (k: string) => String(fd.get(k) ?? "");
    setFormError(null);

    startTransition(async () => {
      const res = await placeOrder({
        customer_name: get("customer_name"),
        phone: get("phone"),
        email: get("email"),
        address: get("address"),
        island: get("island"),
        notes: get("notes"),
        website: get("website"),
        items: items.map((i) => ({ variant_id: i.variantId, quantity: i.quantity })),
      });
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        setFormError(res.error);
        toast.error(res.error);
        return;
      }
      clear();
      toast.success(`Order ${res.data?.orderNumber} placed!`);
      router.push(res.data!.url);
    });
  }

  const err = (k: string) => errors[k]?.[0];

  return (
    <form onSubmit={onSubmit} className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]" noValidate>
      <Card className="space-y-5 p-6 sm:p-8">
        <h2 className="text-lg font-bold">Delivery details</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Full name" htmlFor="customer_name" error={err("customer_name")}>
            <Input id="customer_name" name="customer_name" autoComplete="name" required maxLength={120} aria-invalid={!!err("customer_name")} />
          </Field>
          <Field label="Phone number" htmlFor="phone" error={err("phone")} hint="We'll contact you about delivery">
            <Input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" required maxLength={20} placeholder="7XXXXXX" aria-invalid={!!err("phone")} />
          </Field>
        </div>
        <Field label="Email (optional)" htmlFor="email" error={err("email")}>
          <Input id="email" name="email" type="email" autoComplete="email" maxLength={200} aria-invalid={!!err("email")} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-[1fr_200px]">
          <Field label="Address" htmlFor="address" error={err("address")}>
            <Input id="address" name="address" autoComplete="street-address" required maxLength={300} placeholder="House name, street, floor" aria-invalid={!!err("address")} />
          </Field>
          <Field label="Island / City" htmlFor="island" error={err("island")}>
            <Input id="island" name="island" autoComplete="address-level2" required maxLength={80} placeholder="Malé" aria-invalid={!!err("island")} />
          </Field>
        </div>
        <Field label="Order notes (optional)" htmlFor="notes" error={err("notes")}>
          <Textarea id="notes" name="notes" maxLength={500} placeholder="Delivery instructions, preferred time…" />
        </Field>
        {/* Honeypot – hidden from humans */}
        <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label htmlFor="website">Website</label>
          <input id="website" name="website" tabIndex={-1} autoComplete="off" />
        </div>

        <div className="rounded-2xl bg-gradient-to-br from-brand-50 to-fuchsia-50 p-5 text-sm">
          <p className="font-semibold text-slate-900">Payment by bank transfer</p>
          <p className="mt-1 text-slate-600">
            After placing your order, transfer the total to our {siteConfig.bank.name} account and upload the
            transfer slip. Your order is confirmed once we verify the payment.
          </p>
        </div>
      </Card>

      <Card className="h-fit p-6 lg:sticky lg:top-24">
        <h2 className="font-bold">Order summary</h2>
        <ul className="mt-4 max-h-72 space-y-4 overflow-y-auto pr-1">
          {items.map((i) => {
            const src = productImageUrl(i.image);
            return (
              <li key={i.variantId} className="flex gap-3">
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                  {src && <Image src={src} alt="" fill sizes="56px" className="object-cover" />}
                  <span className="absolute -right-0 -top-0 grid h-5 min-w-5 place-items-center rounded-bl-lg bg-slate-900 px-1 text-[10px] font-bold text-white">
                    {i.quantity}
                  </span>
                </div>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="line-clamp-1 font-medium">{i.name}</p>
                  {i.variantLabel && <p className="text-xs text-slate-500">{i.variantLabel}</p>}
                </div>
                <p className="text-sm font-semibold">{formatPrice(i.price * i.quantity)}</p>
              </li>
            );
          })}
        </ul>
        <dl className="mt-6 space-y-2 border-t border-slate-100 pt-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-500">Subtotal</dt>
            <dd className="font-medium">{formatPrice(subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Delivery</dt>
            <dd className="font-medium">{deliveryFee > 0 ? formatPrice(deliveryFee) : "Free"}</dd>
          </div>
          <div className="flex justify-between border-t border-slate-100 pt-3 text-base">
            <dt className="font-bold">Total</dt>
            <dd className="font-extrabold">{formatPrice(subtotal + deliveryFee)}</dd>
          </div>
        </dl>
        {formError && <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{formError}</p>}
        <Button type="submit" size="lg" className="mt-6 w-full" loading={pending}>
          <Lock className="h-4 w-4" /> Place order
        </Button>
        <p className="mt-3 text-center text-xs text-slate-400">Prices and stock are verified when you place the order.</p>
      </Card>
    </form>
  );
}
