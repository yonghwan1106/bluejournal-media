import type { MetadataRoute } from "next";
import { getAllArticles } from "@/lib/articles";
import { SITE } from "@/lib/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = SITE.url;
  const statics: MetadataRoute.Sitemap = [
    "",
    "/section/뉴스",
    "/section/특집",
    "/section/지역뉴스",
    "/region/경기",
    "/region/서울",
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

  const articles: MetadataRoute.Sitemap = getAllArticles().map((a) => ({
    url: `${base}/news/${a.id}`,
    lastModified: a.publishedAt ?? undefined,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  return [...statics, ...articles];
}
