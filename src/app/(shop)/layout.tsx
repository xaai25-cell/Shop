import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { CartDrawer } from "@/components/cart-drawer";
import { getCategories } from "@/lib/queries";

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const categories = await getCategories().catch(() => []);
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow"
      >
        Skip to content
      </a>
      <SiteHeader categories={categories.map(({ name, slug, color }) => ({ name, slug, color }))} />
      <main id="main" className="min-h-[60vh]">
        {children}
      </main>
      <SiteFooter />
      <CartDrawer />
    </>
  );
}
