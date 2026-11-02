import type { Metadata } from "next";
import { CheckoutForm } from "@/components/checkout-form";
import { serverEnv } from "@/lib/env.server";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

export default function CheckoutPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-extrabold tracking-tight">Checkout</h1>
      <p className="mt-2 text-slate-500">No account needed. You&apos;ll upload your bank transfer slip after placing the order.</p>
      <CheckoutForm deliveryFee={serverEnv.deliveryFee} />
    </div>
  );
}
