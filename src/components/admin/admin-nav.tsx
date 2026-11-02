"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, ExternalLink, FolderTree, LogOut, Package, ShoppingCart } from "lucide-react";
import { signOut } from "@/app/admin/actions";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";

const LINKS = [
  { href: "/admin", label: "Dashboard", icon: BarChart3, exact: true },
  { href: "/admin/orders", label: "Orders", icon: ShoppingCart },
  { href: "/admin/products", label: "Products", icon: Package },
  { href: "/admin/categories", label: "Categories", icon: FolderTree },
];

export function AdminNav({ email, name }: { email: string; name: string }) {
  const pathname = usePathname();
  const isActive = (href: string, exact?: boolean) => (exact ? pathname === href : pathname.startsWith(href));

  return (
    <aside className="sticky top-0 z-30 border-b border-slate-200 bg-white lg:h-dvh lg:border-b-0 lg:border-r">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between px-4 py-4 lg:px-6 lg:py-6">
          <Link href="/admin" className="flex items-center gap-2 font-extrabold">
            <Logo className="h-8" />
            Admin
          </Link>
          <form action={signOut} className="lg:hidden">
            <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Sign out">
              <LogOut className="h-5 w-5" />
            </button>
          </form>
        </div>
        <nav className="scrollbar-none flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:px-3" aria-label="Admin">
          {LINKS.map(({ href, label, icon: Icon, exact }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                isActive(href, exact) ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
          <Link
            href="/"
            target="_blank"
            className="flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            <ExternalLink className="h-4 w-4" /> View store
          </Link>
        </nav>
        <div className="mt-auto hidden border-t border-slate-100 p-4 lg:block">
          <p className="truncate text-sm font-semibold">{name || "Admin"}</p>
          <p className="truncate text-xs text-slate-500">{email}</p>
          <form action={signOut}>
            <button className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-rose-600">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
