import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdmin } from "@/lib/auth";
import { LoginForm } from "./login-form";
import { LoginShowcase } from "./login-showcase";
import { siteConfig } from "@/lib/config";
import { firstParam } from "@/lib/utils";
import { Logo } from "@/components/logo";

export const metadata: Metadata = { title: "Admin sign in", robots: { index: false, follow: false } };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (await getAdmin()) redirect("/admin");
  const next = firstParam((await searchParams).next) ?? "/admin";

  return (
    <div className="relative min-h-dvh overflow-hidden bg-slate-950">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-20 top-10 h-96 w-96 animate-blob rounded-full bg-fuchsia-600/30 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-96 w-96 animate-blob rounded-full bg-indigo-600/30 blur-3xl [animation-delay:-5s]" />
      </div>
      <div className="relative mx-auto grid min-h-dvh max-w-6xl items-center gap-12 px-4 py-10 lg:grid-cols-2 lg:px-8">
        {/* Brand panel – large screens only */}
        <div className="hidden lg:block">
          <p className="text-sm font-semibold text-fuchsia-300">{siteConfig.name}</p>
          <h2 className="mt-2 text-4xl font-extrabold tracking-tight text-white">
            Run your store from one place.
          </h2>
          <p className="mt-3 max-w-md text-slate-300">
            Review payment slips, approve orders and manage products and categories.
          </p>
          <div className="max-w-md">
            <LoginShowcase />
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-sm rounded-3xl border border-white/10 bg-white/95 p-8 shadow-2xl backdrop-blur">
          <Logo className="h-12" priority />
          <p className="mt-4 text-sm font-semibold text-brand-600">{siteConfig.name}</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Admin sign in</h1>
          <LoginForm next={next} />
        </div>
      </div>
    </div>
  );
}
