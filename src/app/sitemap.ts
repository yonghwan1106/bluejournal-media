import type { MetadataRoute } from "next";
import { getSitemapArticles } from "@/lib/articles";
import { SITE } from "@/lib/site";

// 신규 기사가 사이트맵에 반영되도록 시간당 재생성(SEO)
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = SITE.url;
  const statics: MetadataRoute.Sitemap = [
    "",
    "/section/뉴스",
    "/section/특집",
    "/section/탐사문학",
    "/region/경기",
    "/region/인천",
    "/about",
    "/ethics",
    "/youth",
    "/privacy",
    "/contact",
  ].map((p) => ({
    url: `${base}${p}`,
    changeFrequency: p === "" ? "hourly" : "daily",
    priority: p === "" ? 1 : 0.5,
  }));

  const articles: MetadataRoute.Sitemap = (await getSitemapArticles()).map(
    (a) => ({
      url: `${base}/news/${a.id}`,
      lastModified: a.publishedAt ?? undefined,
      changeFrequency: "monthly",
      priority: 0.7,
    }),
  );

  return [...statics, ...articles];
}
