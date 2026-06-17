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
import {
  articles,
  articleRevisions,
  users,
  type NewArticle,
  type Article,
} from "@/db/schema";
import { hashPassword, type Role } from "@/lib/auth";

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

// ───────── 수정 이력(버전) ─────────

export type RevisionSnapshot = {
  title: string;
  subtitle: string | null;
  reporterName: string | null;
  section: string;
  region: string | null;
  displaySlot: string | null;
  thumbnailUrl: string | null;
  bodyHtml: string;
  bodyText: string | null;
  source: string | null;
  sourceUrl: string | null;
  tags: string[];
  status: ArticleStatus;
};

function snapshotOf(a: Article): RevisionSnapshot {
  return {
    title: a.title,
    subtitle: a.subtitle,
    reporterName: a.reporterName,
    section: a.section,
    region: a.region,
    displaySlot: a.displaySlot,
    thumbnailUrl: a.thumbnailUrl,
    bodyHtml: a.bodyHtml,
    bodyText: a.bodyText,
    source: a.source,
    sourceUrl: a.sourceUrl,
    tags: (a.tags as string[] | null) ?? [],
    status: a.status,
  };
}

/** 현재 기사 상태를 이력으로 저장(저장 직전 호출). 기사당 최근 20개만 유지. */
export async function saveRevision(articleId: number): Promise<void> {
  const a = await adminGetArticle(articleId);
  if (!a) return;
  const db = getDb();
  await db
    .insert(articleRevisions)
    .values({ articleId, title: a.title, snapshot: snapshotOf(a) });
  await db.execute(
    sql`delete from article_revisions where article_id = ${articleId} and id not in (select id from article_revisions where article_id = ${articleId} order by id desc limit 20)`,
  );
}

export async function listRevisions(
  articleId: number,
): Promise<{ id: number; title: string; status: string; createdAt: Date | null }[]> {
  const rows = await getDb()
    .select({
      id: articleRevisions.id,
      title: articleRevisions.title,
      snapshot: articleRevisions.snapshot,
      createdAt: articleRevisions.createdAt,
    })
    .from(articleRevisions)
    .where(eq(articleRevisions.articleId, articleId))
    .orderBy(desc(articleRevisions.id))
    .limit(20);
  return rows.map((r) => ({
    id: r.id,
    title: r.title ?? "",
    status: ((r.snapshot as RevisionSnapshot | null)?.status as string) ?? "",
    createdAt: r.createdAt,
  }));
}

/** 특정 이력으로 되돌리기 — 되돌리기 전에 현재 상태도 이력으로 남긴다. */
export async function restoreRevision(
  articleId: number,
  revId: number,
): Promise<void> {
  const [rev] = await getDb()
    .select()
    .from(articleRevisions)
    .where(
      and(
        eq(articleRevisions.id, revId),
        eq(articleRevisions.articleId, articleId),
      ),
    )
    .limit(1);
  if (!rev) return;
  await saveRevision(articleId);
  await adminUpdateArticle(articleId, rev.snapshot as Partial<NewArticle>);
}

// ───────── 사용자 계정(RBAC) ─────────

export async function listUsers() {
  return getDb()
    .select({
      id: users.id,
      username: users.username,
      name: users.name,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.id));
}

export async function createUser(data: {
  username: string;
  name: string;
  password: string;
  role: Role;
  email?: string | null;
}): Promise<void> {
  await getDb().insert(users).values({
    username: data.username,
    name: data.name,
    email: data.email ?? null,
    role: data.role,
    passwordHash: hashPassword(data.password),
  });
}

export async function deleteUser(id: number): Promise<void> {
  await getDb().delete(users).where(eq(users.id, id));
}
