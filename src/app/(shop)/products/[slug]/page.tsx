import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { getProductBySlug, getRelatedProducts } from "@/lib/queries";
import { ProductView } from "@/components/product-view";
import { ProductCard } from "@/components/product-card";
import { Stagger, StaggerItem } from "@/components/motion";
import { productImageUrl } from "@/lib/utils";
import { siteConfig } from "@/lib/config";

export const revalidate = 60;

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: "Product not found" };
  const image = productImageUrl(product.images[0]?.path);
  return {
    title: product.name,
    description: product.description?.slice(0, 160) ?? undefined,
    alternates: { canonical: `/products/${product.slug}` },
    openGraph: { title: product.name, images: image ? [image] : undefined },
  };
}

export default async function ProductPage({ params }: { params: Params }) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const related = await getRelatedProducts(product.category_id, product.id).catch(() => []);
  const prices = product.variants.map((v) => Number(v.price ?? product.base_price));
  const inStock = product.variants.some((v) => v.stock > 0);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description ?? undefined,
    image: product.images.map((i) => productImageUrl(i.path)),
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: siteConfig.currency,
      lowPrice: Math.min(...(prices.length ? prices : [Number(product.base_price)])),
      highPrice: Math.max(...(prices.length ? prices : [Number(product.base_price)])),
      availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    },
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-1 text-sm text-slate-500">
        <Link href="/" className="hover:text-slate-900">Home</Link>
        <ChevronRight className="h-4 w-4" />
        <Link href="/products" className="hover:text-slate-900">Shop</Link>
        {product.category && (
          <>
            <ChevronRight className="h-4 w-4" />
            <Link href={`/products?category=${product.category.slug}`} className="hover:text-slate-900">
              {product.category.name}
            </Link>
          </>
        )}
      </nav>

      <ProductView product={product} />

      {related.length > 0 && (
        <section className="mt-24">
          <h2 className="text-2xl font-extrabold tracking-tight">You may also like</h2>
          <Stagger className="mt-6 grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4">
            {related.map((p) => (
              <StaggerItem key={p.id}>
                <ProductCard product={p} />
              </StaggerItem>
            ))}
          </Stagger>
        </section>
      )}
    </div>
  );
}
