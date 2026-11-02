"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Menu, Search, ShoppingBag, X, PackageSearch } from "lucide-react";
import { useCart, cartCount } from "@/lib/cart-store";
import { siteConfig } from "@/lib/config";
import { cn } from "@/lib/utils";
import { useHydrated } from "@/lib/use-hydrated";
import type { Category } from "@/lib/types";

export function SiteHeader({ categories }: { categories: Pick<Category, "name" | "slug" | "color">[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const items = useCart((s) => s.items);
  const openCart = useCart((s) => s.open);
  const hydrated = useHydrated();
  const count = hydrated ? cartCount(items) : 0;
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
    setSearchOpen(false);
  }, [pathname]);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const term = q.trim();
    router.push(term ? `/products?q=${encodeURIComponent(term)}` : "/products");
  }

  return (
    <header
      className={cn(
        "sticky top-0 z-40 transition-all duration-300",
        scrolled ? "border-b border-slate-200/70 bg-white/80 backdrop-blur-xl" : "bg-white",
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <button
          className="-ml-2 rounded-lg p-2 text-slate-700 hover:bg-slate-100 lg:hidden"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Toggle menu"
          aria-expanded={menuOpen}
        >
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>

        <Link href="/" className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-brand-500 via-fuchsia-500 to-orange-400 text-sm text-white shadow-lg shadow-fuchsia-500/20">
            {siteConfig.name.slice(0, 1)}
          </span>
          <span>{siteConfig.name}</span>
        </Link>

        <nav className="ml-6 hidden items-center gap-1 lg:flex" aria-label="Main">
          <NavLink href="/products" active={pathname === "/products"}>
            Shop all
          </NavLink>
          {categories.slice(0, 5).map((c) => (
            <NavLink key={c.slug} href={`/products?category=${c.slug}`}>
              {c.name}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <form onSubmit={submitSearch} className="relative hidden md:block" role="search">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              type="search"
              placeholder="Search products…"
              aria-label="Search products"
              className="h-10 w-56 rounded-full border border-slate-200 bg-slate-50 pl-9 pr-4 text-sm transition-all focus:w-72 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-500/10"
            />
          </form>
          <button
            className="rounded-full p-2.5 text-slate-700 hover:bg-slate-100 md:hidden"
            onClick={() => setSearchOpen((v) => !v)}
            aria-label="Search"
          >
            <Search className="h-5 w-5" />
          </button>
          <Link href="/track" className="rounded-full p-2.5 text-slate-700 hover:bg-slate-100" aria-label="Track order" title="Track order">
            <PackageSearch className="h-5 w-5" />
          </Link>
          <button
            onClick={openCart}
            className="relative rounded-full p-2.5 text-slate-700 hover:bg-slate-100"
            aria-label={`Open cart (${count} items)`}
          >
            <ShoppingBag className="h-5 w-5" />
            <AnimatePresence>
              {count > 0 && (
                <motion.span
                  key={count}
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.4, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 500, damping: 18 }}
                  className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-gradient-to-r from-brand-600 to-fuchsia-500 px-1 text-[10px] font-bold text-white"
                >
                  {count}
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>
      </div>

      <AnimatePresence>
        {searchOpen && (
          <motion.form
            onSubmit={submitSearch}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-slate-100 px-4 md:hidden"
            role="search"
          >
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              type="search"
              placeholder="Search products…"
              aria-label="Search products"
              className="my-3 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm focus:border-brand-500 focus:bg-white focus:outline-none"
            />
          </motion.form>
        )}
        {menuOpen && (
          <motion.nav
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-slate-100 lg:hidden"
            aria-label="Mobile"
          >
            <div className="grid gap-1 p-4">
              <Link href="/products" className="rounded-xl px-3 py-2.5 font-medium hover:bg-slate-50">
                Shop all
              </Link>
              {categories.map((c) => (
                <Link
                  key={c.slug}
                  href={`/products?category=${c.slug}`}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 font-medium hover:bg-slate-50"
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                  {c.name}
                </Link>
              ))}
              <Link href="/track" className="rounded-xl px-3 py-2.5 font-medium hover:bg-slate-50">
                Track my order
              </Link>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}

function NavLink({ href, active, children }: { href: string; active?: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-full px-3.5 py-2 text-sm font-medium transition",
        active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
      )}
    >
      {children}
    </Link>
  );
}
