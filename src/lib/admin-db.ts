import "server-only";
import {
  eq,
  desc,
  and,
  ilike,
  count,
  isNull,
  isNotNull,
  sql,
  type SQL,
} from "drizzle-orm";
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
  /** true = 휴지통(삭제된 것만), false/미지정 = 일반(삭제 안 된 것만) */
  trash?: boolean;
};

export type ListResult = {
  rows: Article[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
};

/** 관리자 기사 목록 — 휴지통 분리 + 검색(제목)·필터(상태/섹션/지역)·페이지네이션. */
export async function adminListArticles(params: ListParams = {}): Promise<ListResult> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, params.pageSize ?? 30));

  const conds: SQL[] = [
    params.trash ? isNotNull(articles.deletedAt) : isNull(articles.deletedAt),
  ];
  if (params.q?.trim()) conds.push(ilike(articles.title, `%${params.q.trim()}%`));
  if (params.status) conds.push(eq(articles.status, params.status));
  if (params.section) conds.push(eq(articles.section, params.section));
  if (params.region) conds.push(eq(articles.region, params.region));
  const where = and(...conds);

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

/** 상태별 건수 통계(휴지통 제외) + 휴지통 건수. */
export async function adminStats(): Promise<{
  total: number;
  published: number;
  draft: number;
  hidden: number;
  trash: number;
  totalViews: number;
}> {
  const db = getDb();
  const rows = await db
    .select({ status: articles.status, c: count() })
    .from(articles)
    .where(isNull(articles.deletedAt))
    .groupBy(articles.status);
  const m = { total: 0, published: 0, draft: 0, hidden: 0, trash: 0, totalViews: 0 };
  for (const r of rows) {
    const n = Number(r.c);
    m.total += n;
    if (r.status === "published" || r.status === "draft" || r.status === "hidden") {
      m[r.status] = n;
    }
  }
  const [{ c }] = await db
    .select({ c: count() })
    .from(articles)
    .where(isNotNull(articles.deletedAt));
  m.trash = Number(c);
  const [{ v }] = await db
    .select({ v: sql<number>`coalesce(sum(${articles.viewCount}), 0)::int` })
    .from(articles)
    .where(isNull(articles.deletedAt));
  m.totalViews = Number(v);
  return m;
}

/** 조회수 상위 기사(휴지통 제외). */
export async function adminTopViewed(
  limit = 5,
): Promise<{ id: number; title: string; viewCount: number }[]> {
  return getDb()
    .select({
      id: articles.id,
      title: articles.title,
      viewCount: articles.viewCount,
    })
    .from(articles)
    .where(isNull(articles.deletedAt))
    .orderBy(desc(articles.viewCount))
    .limit(limit);
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

/** 휴지통으로 이동(소프트 삭제) — 공개·일반 목록에서 제외되나 복원 가능. */
export async function adminDeleteArticle(id: number): Promise<void> {
  await getDb()
    .update(articles)
    .set({ deletedAt: new Date() })
    .where(eq(articles.id, id));
}

/** 휴지통에서 복원. */
export async function adminRestoreArticle(id: number): Promise<void> {
  await getDb()
    .update(articles)
    .set({ deletedAt: null })
    .where(eq(articles.id, id));
}

/** 영구 삭제(되돌릴 수 없음). */
export async function adminPurgeArticle(id: number): Promise<void> {
  await getDb().delete(articles).where(eq(articles.id, id));
}
