import Link from "next/link";
import { siteConfig } from "@/lib/config";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-slate-100 bg-slate-50/60">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-4 lg:px-8">
        <div className="md:col-span-2">
          <p className="text-lg font-extrabold">{siteConfig.name}</p>
          <p className="mt-2 max-w-sm text-sm text-slate-500">{siteConfig.description}</p>
        </div>
        <div>
          <p className="text-sm font-semibold">Shop</p>
          <ul className="mt-3 space-y-2 text-sm text-slate-500">
            <li><Link className="hover:text-slate-900" href="/products">All products</Link></li>
            <li><Link className="hover:text-slate-900" href="/products?sort=newest">New arrivals</Link></li>
            <li><Link className="hover:text-slate-900" href="/cart">Cart</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold">Help</p>
          <ul className="mt-3 space-y-2 text-sm text-slate-500">
            <li><Link className="hover:text-slate-900" href="/track">Track your order</Link></li>
            {siteConfig.contactPhone && <li>Call / Viber: {siteConfig.contactPhone}</li>}
            <li>Payment: Bank transfer ({siteConfig.bank.name})</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-slate-100 py-6 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} {siteConfig.name}. All rights reserved.
      </div>
    </footer>
  );
}
