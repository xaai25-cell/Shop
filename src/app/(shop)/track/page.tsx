import type { Metadata } from "next";
import { PackageSearch } from "lucide-react";
import { OrderLookupForm } from "@/components/order-lookup-form";

export const metadata: Metadata = { title: "Track your order" };

export default function TrackPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-fuchsia-500 text-white shadow-lg shadow-brand-500/30">
          <PackageSearch className="h-6 w-6" />
        </span>
        <h1 className="mt-5 text-3xl font-extrabold tracking-tight">Track your order</h1>
        <p className="mt-2 text-slate-500">Enter your order number and the phone number used at checkout.</p>
      </div>
      <OrderLookupForm />
    </div>
  );
}
