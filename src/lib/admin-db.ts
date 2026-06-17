import "server-only";
import { eq, desc, and, ilike, count, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { articles, type NewArticle, type Article } from "@/db/schema";

export function dbConfigured(): boolean {
  return !!process.env.DATABASE_URL;
}

export type ArticleStatus = "published" | "draft" | "hidden";

export type ListParams = {
  q?: string;
  status?: ArticleStatus | "";
  section?: string;
  region?: string;
  page?: number;
  pageSize?: number;
};

export type ListResult = {
  rows: Article[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
};

/** 관리자 기사 목록 — 검색(제목)·필터(상태/섹션/지역)·페이지네이션 + 총건수. */
export async function adminListArticles(params: ListParams = {}): Promise<ListResult> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, params.pageSize ?? 30));

  const conds: SQL[] = [];
  if (params.q?.trim()) conds.push(ilike(articles.title, `%${params.q.trim()}%`));
  if (params.status) conds.push(eq(articles.status, params.status));
  if (params.section) conds.push(eq(articles.section, params.section));
  if (params.region) conds.push(eq(articles.region, params.region));
  const where = conds.length ? and(...conds) : undefined;

  const db = getDb();
  const rows = await db
    .select()
    .from(articles)
    .where(where)
    .orderBy(desc(articles.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const [{ c }] = await db.select({ c: count() }).from(articles).where(where);
  const total = Number(c);
  return { rows, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** 상태별 건수 통계(대시보드 카드용). */
export async function adminStats(): Promise<{
  total: number;
  published: number;
  draft: number;
  hidden: number;
}> {
  const rows = await getDb()
    .select({ status: articles.status, c: count() })
    .from(articles)
    .groupBy(articles.status);
  const m = { total: 0, published: 0, draft: 0, hidden: 0 };
  for (const r of rows) {
    const n = Number(r.c);
    m.total += n;
    if (r.status === "published" || r.status === "draft" || r.status === "hidden") {
      m[r.status] = n;
    }
  }
  return m;
}

export async function adminGetArticle(id: number): Promise<Article | null> {
  const r = await getDb()
    .select()
    .from(articles)
    .where(eq(articles.id, id))
    .limit(1);
  return r[0] ?? null;
}

export async function adminCreateArticle(
  data: Omit<NewArticle, "id">,
): Promise<number> {
  // PG 에는 mysql2 의 insertId 가 없으므로 RETURNING 으로 새 id 를 받는다.
  const [res] = await getDb()
    .insert(articles)
    .values(data)
    .returning({ id: articles.id });
  return res.id;
}

export async function adminUpdateArticle(
  id: number,
  data: Partial<NewArticle>,
): Promise<void> {
  await getDb().update(articles).set(data).where(eq(articles.id, id));
}

export async function adminDeleteArticle(id: number): Promise<void> {
  await getDb().delete(articles).where(eq(articles.id, id));
}
