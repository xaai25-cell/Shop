import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BarChart3, Package, ShieldCheck, ShoppingCart } from "lucide-react";
import { getStaffUser } from "@/lib/auth";
import { homeFor } from "@/lib/roles";
import { siteConfig } from "@/lib/config";
import { firstParam } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { LoginForm } from "./login-form";
import { LoginShowcase } from "./login-showcase";

export const metadata: Metadata = { title: "Admin sign in", robots: { index: false, follow: false } };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const signedIn = await getStaffUser();
  if (signedIn) redirect(homeFor(signedIn.role));
  const next = firstParam((await searchParams).next) ?? "/admin";

  return (
    <div className="grid min-h-dvh bg-white lg:grid-cols-[1.1fr_1fr]">
      {/* ---------- Brand panel (desktop) ---------- */}
      <aside className="relative hidden overflow-hidden bg-slate-950 text-white lg:flex lg:flex-col">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 -top-24 h-[28rem] w-[28rem] animate-blob rounded-full bg-fuchsia-600/40 blur-3xl" />
          <div className="absolute -right-20 top-1/3 h-[26rem] w-[26rem] animate-blob rounded-full bg-indigo-600/40 blur-3xl [animation-delay:-5s]" />
          <div className="absolute -bottom-32 left-1/4 h-[24rem] w-[24rem] animate-blob rounded-full bg-orange-500/25 blur-3xl [animation-delay:-9s]" />
          {/* subtle grid */}
          <div
            className="absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage:
                "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
              backgroundSize: "44px 44px",
            }}
          />
        </div>

        <div className="relative flex flex-1 flex-col p-12 xl:p-16">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white shadow-lg shadow-fuchsia-500/20">
              <Logo className="h-8" priority />
            </span>
            <span className="text-lg font-extrabold tracking-tight">{siteConfig.name}</span>
          </div>

          <div className="my-auto max-w-lg py-12">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold text-fuchsia-200 backdrop-blur">
              <ShieldCheck className="h-3.5 w-3.5" /> Admin dashboard
            </p>
            <h2 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight xl:text-5xl">
              Run your store
              <br />
              <span className="bg-gradient-to-r from-fuchsia-300 via-pink-300 to-orange-200 bg-clip-text text-transparent">
                from one place.
              </span>
            </h2>
            <p className="mt-4 text-slate-300">
              Verify payment slips, manage products and stock, and follow every order from pending to delivered.
            </p>

            <LoginShowcase />

            <ul className="mt-10 grid gap-3 text-sm text-slate-300 sm:grid-cols-3">
              {[
                { icon: ShoppingCart, label: "Orders & slips" },
                { icon: Package, label: "Products & stock" },
                { icon: BarChart3, label: "Live statistics" },
              ].map(({ icon: Icon, label }) => (
                <li key={label} className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2.5 ring-1 ring-white/10">
                  <Icon className="h-4 w-4 text-fuchsia-300" />
                  {label}
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-slate-500">© {new Date().getFullYear()} {siteConfig.name}</p>
        </div>
      </aside>

      {/* ---------- Form panel ---------- */}
      <main className="relative flex flex-col px-6 py-8 sm:px-12">
        {/* soft colour on mobile, where the brand panel is hidden */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-fuchsia-50 via-indigo-50/60 to-transparent lg:hidden" />

        <Link
          href="/"
          className="relative inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" /> Back to store
        </Link>

        <div className="relative mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <div className="lg:hidden">
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-white shadow-xl shadow-indigo-500/10 ring-1 ring-slate-100">
              <Logo className="h-10" priority />
            </span>
          </div>
          <p className="mt-6 text-sm font-semibold text-brand-600 lg:mt-0">{siteConfig.name} Admin</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Welcome back</h1>
          <p className="mt-2 text-sm text-slate-500">Sign in with your admin email and password.</p>

          <LoginForm next={next} />

          <p className="mt-8 flex items-center gap-2 text-xs text-slate-400">
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
            Secure sign-in · only approved admin accounts can access this area
          </p>
        </div>
      </main>
    </div>
  );
}
