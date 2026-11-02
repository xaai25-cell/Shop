import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Truck, Upload, Sparkles } from "lucide-react";
import { getCategories, getFeaturedProducts, getNewArrivals } from "@/lib/queries";
import { ProductCard } from "@/components/product-card";
import { FadeIn, Stagger, StaggerItem } from "@/components/motion";
import { HeroVisual } from "@/components/hero-visual";
import { buttonClasses } from "@/components/ui";
import { siteConfig } from "@/lib/config";
import { categoryImageUrl } from "@/lib/utils";

export const revalidate = 60;

export default async function HomePage() {
  const [categories, featured, latest] = await Promise.all([
    getCategories().catch(() => []),
    getFeaturedProducts(8).catch(() => []),
    getNewArrivals(8).catch(() => []),
  ]);

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -left-24 top-0 h-96 w-96 animate-blob rounded-full bg-fuchsia-300/40 blur-3xl" />
          <div className="absolute right-0 top-20 h-96 w-96 animate-blob rounded-full bg-sky-300/40 blur-3xl [animation-delay:-4s]" />
          <div className="absolute bottom-0 left-1/3 h-80 w-80 animate-blob rounded-full bg-amber-200/50 blur-3xl [animation-delay:-8s]" />
        </div>
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 md:py-24 lg:grid-cols-2 lg:px-8">
          <FadeIn>
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-100 bg-white/70 px-3 py-1 text-xs font-semibold text-brand-700 backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" /> New season just landed
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
              Style that feels <span className="text-gradient">like you.</span>
            </h1>
            <p className="mt-5 max-w-lg text-lg text-slate-600">
              Curated products, honest prices and delivery to your doorstep. Pay easily by bank transfer and
              upload your slip — we&apos;ll handle the rest.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/products" className={buttonClasses("primary", "lg")}>
                Shop now <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/track" className={buttonClasses("outline", "lg")}>
                Track an order
              </Link>
            </div>
          </FadeIn>
          <HeroVisual products={featured.length ? featured : latest} />
        </div>
      </section>

      {/* Categories */}
      {categories.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <SectionHeading title="Shop by category" href="/products" />
          <Stagger className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {categories.map((c) => (
              <StaggerItem key={c.id}>
                <Link
                  href={`/products?category=${c.slug}`}
                  className="group relative flex aspect-[4/5] flex-col justify-end overflow-hidden rounded-3xl p-5 text-white shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl sm:aspect-[5/4] lg:aspect-[4/5]"
                  style={{ background: `linear-gradient(135deg, ${c.color}, ${c.color}aa 60%, #0f172a)` }}
                >
                  {categoryImageUrl(c.image_path) ? (
                    <Image
                      src={categoryImageUrl(c.image_path)!}
                      alt=""
                      fill
                      sizes="(min-width: 1024px) 20vw, (min-width: 640px) 33vw, 50vw"
                      className="object-cover transition duration-700 ease-out group-hover:scale-110"
                    />
                  ) : (
                    <span className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-white/20 blur-xl transition-transform duration-700 group-hover:scale-150" />
                  )}
                  {/* Colour wash in the category colour keeps text readable on any photo */}
                  <span
                    aria-hidden
                    className="absolute inset-0 opacity-90 transition-opacity duration-500 group-hover:opacity-75"
                    style={{ background: `linear-gradient(to top, ${c.color} 0%, ${c.color}99 28%, transparent 65%)` }}
                  />
                  <span className="relative text-lg font-bold drop-shadow-sm">{c.name}</span>
                  <span className="relative mt-1 inline-flex items-center gap-1 text-xs font-medium text-white/80">
                    Explore <ArrowRight className="h-3 w-3 transition group-hover:translate-x-1" />
                  </span>
                </Link>
              </StaggerItem>
            ))}
          </Stagger>
        </section>
      )}

      {featured.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <SectionHeading title="Featured picks" href="/products" />
          <ProductRow products={featured} />
        </section>
      )}

      {/* How it works */}
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <FadeIn className="grid gap-4 rounded-[2rem] bg-slate-900 p-8 text-white sm:p-12 md:grid-cols-3">
          {[
            { icon: BadgeCheck, title: "1. Place your order", text: "Pick your items and checkout in seconds — no account needed." },
            { icon: Upload, title: "2. Upload your slip", text: `Transfer to our ${siteConfig.bank.name} account and upload the receipt.` },
            { icon: Truck, title: "3. We deliver", text: "Once verified, we pack and deliver your order fast." },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10">
              <Icon className="h-7 w-7 text-fuchsia-300" />
              <p className="mt-4 font-semibold">{title}</p>
              <p className="mt-1 text-sm text-slate-300">{text}</p>
            </div>
          ))}
        </FadeIn>
      </section>

      {latest.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <SectionHeading title="New arrivals" href="/products?sort=newest" />
          <ProductRow products={latest} />
        </section>
      )}
    </>
  );
}

function SectionHeading({ title, href }: { title: string; href: string }) {
  return (
    <div className="flex items-end justify-between">
      <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h2>
      <Link href={href} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700">
        View all <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

function ProductRow({ products }: { products: Awaited<ReturnType<typeof getNewArrivals>> }) {
  return (
    <Stagger className="mt-6 grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
      {products.map((p, i) => (
        <StaggerItem key={p.id}>
          <ProductCard product={p} priority={i < 2} />
        </StaggerItem>
      ))}
    </Stagger>
  );
}
