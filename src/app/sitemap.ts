import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/config";
import { createPublicClient } from "@/lib/supabase/public";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { data } = await createPublicClient()
    .from("products")
    .select("slug, updated_at")
    .eq("is_active", true)
    .limit(5000);

  return [
    { url: siteConfig.url, changeFrequency: "daily", priority: 1 },
    { url: `${siteConfig.url}/products`, changeFrequency: "daily", priority: 0.9 },
    ...((data ?? []) as { slug: string; updated_at: string }[]).map((p) => ({
      url: `${siteConfig.url}/products/${p.slug}`,
      lastModified: p.updated_at,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
