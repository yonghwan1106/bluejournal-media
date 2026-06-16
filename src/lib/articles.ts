import "server-only";
import seedData from "../../seed/articles.json";

export type SeedArticle = {
  id: number;
  board: string;
  title: string;
  subtitle: string | null;
  reporterName: string | null;
  reporterEmail: string | null;
  section: string;
  region: string | null;
  displaySlot: string | null;
  thumbnailUrl: string | null;
  bodyHtml: string;
  bodyText: string | null;
  source: string | null;
  sourceUrl: string | null;
  tags: string[];
  viewCount: number;
  status: "published" | "draft" | "hidden";
  publishedAt: string | null;
  brokenImages?: number;
};

/**
 * 데이터 소스.
 * 현재: seed/articles.json (Vultr MySQL 구축 전 라이브 프리뷰용).
 * 이후: DATABASE_URL 존재 시 Drizzle/MySQL 질의로 교체 (src/db).
 */
let cache: SeedArticle[] | null = null;

function load(): SeedArticle[] {
  if (cache) return cache;
  const raw = (seedData as unknown as SeedArticle[]).slice();
  raw.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
  cache = raw;
  return cache;
}

const isPub = (a: SeedArticle) => a.status === "published";

export function getAllArticles(): SeedArticle[] {
  return load().filter(isPub);
}

export function getArticle(id: number): SeedArticle | null {
  return load().find((a) => a.id === id) ?? null;
}

export function getLatest(n = 20): SeedArticle[] {
  return getAllArticles().slice(0, n);
}

export function getHeadline(): SeedArticle | null {
  return getAllArticles()[0] ?? null;
}

export function getBySection(section: string, n?: number): SeedArticle[] {
  const r = getAllArticles().filter((a) => a.section === section);
  return n ? r.slice(0, n) : r;
}

export function getByRegion(region: string, n?: number): SeedArticle[] {
  const r = getAllArticles().filter((a) => a.region === region);
  return n ? r.slice(0, n) : r;
}

export function searchArticles(q: string, limit = 50): SeedArticle[] {
  const s = q.trim();
  if (!s) return [];
  return getAllArticles()
    .filter(
      (a) =>
        a.title.includes(s) ||
        (a.bodyText ?? "").includes(s) ||
        (a.subtitle ?? "").includes(s) ||
        (a.tags ?? []).some((t) => t.includes(s)),
    )
    .slice(0, limit);
}

export function getRelated(a: SeedArticle, n = 6): SeedArticle[] {
  return getAllArticles()
    .filter(
      (x) =>
        x.id !== a.id &&
        (x.region === a.region || (x.tags ?? []).some((t) => (a.tags ?? []).includes(t))),
    )
    .slice(0, n);
}

export function getAllIds(): number[] {
  return getAllArticles().map((a) => a.id);
}

export function countArticles(): number {
  return getAllArticles().length;
}

export const REGIONS = ["경기", "서울", "인천"] as const;
export const SECTIONS = ["뉴스", "특집", "지역뉴스"] as const;
