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
  pageViews,
  cronRuns,
  snippets,
  subscribers,
  scanReports,
  users,
  type NewArticle,
  type Article,
} from "@/db/schema";
import { hashPassword, type Role } from "@/lib/auth";
import { referrerCategory, type RefCategory } from "@/lib/analytics";

export function dbConfigured(): boolean {
  return !!process.env.DATABASE_URL;
}

export type ArticleStatus = "published" | "draft" | "hidden" | "scheduled";

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

const adminArticleOrder = sql`${articles.publishedAt} desc nulls last, ${articles.id} desc`;

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
    .orderBy(adminArticleOrder)
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

// ───────── 접속 통계(page_views) ─────────

export type StatUnit = "day" | "week" | "month";

const sinceDays = (n: number) => sql`${pageViews.day} >= (current_date - ${n}::int)`;

/** 기간 합계 + 직전 동기간(증감률 계산용). */
export async function statsSummary(days: number) {
  const db = getDb();
  const sel = {
    pv: sql<number>`count(*)::int`,
    uv: sql<number>`count(distinct ${pageViews.visitorHash})::int`,
  };
  const [cur] = await db.select(sel).from(pageViews).where(sinceDays(days));
  const [prev] = await db
    .select(sel)
    .from(pageViews)
    .where(
      sql`${pageViews.day} >= (current_date - ${days * 2}::int) and ${pageViews.day} < (current_date - ${days}::int)`,
    );
  return {
    pv: Number(cur?.pv ?? 0),
    uv: Number(cur?.uv ?? 0),
    prevPv: Number(prev?.pv ?? 0),
    prevUv: Number(prev?.uv ?? 0),
  };
}

/** 일/주/월 버킷별 PV·UV 추이. */
export async function statsTrend(unit: StatUnit, days: number) {
  const bucket =
    unit === "day"
      ? sql`${pageViews.day}`
      : sql`date_trunc(${unit}, ${pageViews.day})::date`;
  const rows = await getDb()
    .select({
      bucket: sql<string>`${bucket}`,
      pv: sql<number>`count(*)::int`,
      uv: sql<number>`count(distinct ${pageViews.visitorHash})::int`,
    })
    .from(pageViews)
    .where(sinceDays(days))
    .groupBy(bucket)
    .orderBy(bucket);
  return rows.map((r) => ({ bucket: String(r.bucket).slice(0, 10), pv: Number(r.pv), uv: Number(r.uv) }));
}

/** 기간 내 조회 많은 기사(누적 아닌 기간 합계). */
export async function statsTopArticles(days: number, limit = 10) {
  const rows = await getDb()
    .select({
      id: articles.id,
      title: articles.title,
      section: articles.section,
      region: articles.region,
      views: sql<number>`count(*)::int`,
    })
    .from(pageViews)
    .innerJoin(articles, eq(pageViews.articleId, articles.id))
    .where(and(sinceDays(days), isNull(articles.deletedAt)))
    .groupBy(articles.id, articles.title, articles.section, articles.region)
    .orderBy(desc(sql`count(*)`))
    .limit(limit);
  return rows.map((r) => ({ ...r, views: Number(r.views) }));
}

/** 섹션별 기간 조회 합계. */
export async function statsTopSections(days: number) {
  const rows = await getDb()
    .select({ section: articles.section, views: sql<number>`count(*)::int` })
    .from(pageViews)
    .innerJoin(articles, eq(pageViews.articleId, articles.id))
    .where(and(sinceDays(days), isNull(articles.deletedAt)))
    .groupBy(articles.section)
    .orderBy(desc(sql`count(*)`));
  return rows.map((r) => ({ section: r.section, views: Number(r.views) }));
}

/** 유입경로 분류 비중(검색/SNS/직접/기타). */
export async function statsReferrers(days: number): Promise<Record<RefCategory, number>> {
  const rows = await getDb()
    .select({ host: pageViews.referrerHost, c: sql<number>`count(*)::int` })
    .from(pageViews)
    .where(sinceDays(days))
    .groupBy(pageViews.referrerHost);
  const cat: Record<RefCategory, number> = { 검색: 0, SNS: 0, 직접: 0, 기타: 0 };
  for (const r of rows) cat[referrerCategory(r.host)] += Number(r.c);
  return cat;
}

/** 디바이스(모바일/데스크톱) 비율. */
export async function statsDevices(days: number) {
  const rows = await getDb()
    .select({ device: pageViews.device, c: sql<number>`count(*)::int` })
    .from(pageViews)
    .where(sinceDays(days))
    .groupBy(pageViews.device);
  return rows.map((r) => ({ device: (r.device as string) ?? "기타", count: Number(r.c) }));
}

// ───────── 자동수집 cron 헬스 ─────────

export async function recordCronRun(
  entries: {
    job?: string;
    sourceAgency: string;
    fetched?: number;
    published?: number;
    skipped?: number;
    failed?: number;
    errorText?: string | null;
  }[],
): Promise<void> {
  if (!entries.length) return;
  await getDb()
    .insert(cronRuns)
    .values(
      entries.map((r) => ({
        job: r.job ?? "gyeonggi-news",
        sourceAgency: r.sourceAgency,
        fetched: r.fetched ?? 0,
        published: r.published ?? 0,
        skipped: r.skipped ?? 0,
        failed: r.failed ?? 0,
        errorText: r.errorText ?? null,
      })),
    );
}

/** 최근 7일 cron 실행 로그(기관 헬스 신호등용, 최신순). */
export async function cronHealth() {
  return getDb()
    .select({
      agency: cronRuns.sourceAgency,
      runAt: cronRuns.runAt,
      fetched: cronRuns.fetched,
      published: cronRuns.published,
      skipped: cronRuns.skipped,
      failed: cronRuns.failed,
      errorText: cronRuns.errorText,
    })
    .from(cronRuns)
    .where(sql`${cronRuns.runAt} >= now() - interval '7 days'`)
    .orderBy(desc(cronRuns.runAt))
    .limit(200);
}

// ───────── 본문 스니펫 ─────────

export async function listSnippets() {
  return getDb().select().from(snippets).orderBy(snippets.sortOrder, desc(snippets.id));
}
export async function createSnippet(label: string, html: string) {
  await getDb().insert(snippets).values({ label, html });
}
export async function deleteSnippet(id: number) {
  await getDb().delete(snippets).where(eq(snippets.id, id));
}

// ───────── 뉴스레터 구독자 ─────────

export async function addSubscriber(email: string, region: string | null, token: string) {
  await getDb()
    .insert(subscribers)
    .values({ email, region, unsubscribeToken: token })
    .onConflictDoNothing();
}
export async function confirmSubscriber(token: string): Promise<string | null> {
  const [row] = await getDb()
    .update(subscribers)
    .set({ confirmedAt: new Date() })
    .where(eq(subscribers.unsubscribeToken, token))
    .returning({ email: subscribers.email });
  return row?.email ?? null;
}
export async function removeSubscriber(token: string): Promise<boolean> {
  const rows = await getDb()
    .delete(subscribers)
    .where(eq(subscribers.unsubscribeToken, token))
    .returning({ id: subscribers.id });
  return rows.length > 0;
}
export async function listConfirmedSubscribers() {
  return getDb().select().from(subscribers).where(isNotNull(subscribers.confirmedAt));
}
export async function subscriberStats() {
  const [a] = await getDb().select({ c: count() }).from(subscribers).where(isNotNull(subscribers.confirmedAt));
  const [b] = await getDb().select({ c: count() }).from(subscribers).where(isNull(subscribers.confirmedAt));
  return { confirmed: Number(a.c), pending: Number(b.c) };
}

// ───────── 품질 스캔 ─────────

export async function replaceOpenScans(
  kind: string,
  entries: { articleId?: number | null; url?: string | null; detail?: string | null }[],
): Promise<void> {
  const db = getDb();
  await db.delete(scanReports).where(and(eq(scanReports.kind, kind), eq(scanReports.status, "open")));
  if (entries.length) {
    await db.insert(scanReports).values(
      entries.map((e) => ({
        kind,
        articleId: e.articleId ?? null,
        url: e.url ?? null,
        detail: e.detail ?? null,
      })),
    );
  }
}
export async function listOpenScans() {
  return getDb()
    .select()
    .from(scanReports)
    .where(eq(scanReports.status, "open"))
    .orderBy(desc(scanReports.id))
    .limit(300);
}
export async function resolveScan(id: number): Promise<void> {
  await getDb().update(scanReports).set({ status: "resolved" }).where(eq(scanReports.id, id));
}

// ───────── 발행 캘린더 ─────────

export async function listScheduled() {
  return getDb()
    .select({
      id: articles.id,
      title: articles.title,
      section: articles.section,
      region: articles.region,
      publishedAt: articles.publishedAt,
    })
    .from(articles)
    .where(and(eq(articles.status, "scheduled"), isNull(articles.deletedAt)))
    .orderBy(articles.publishedAt);
}

/** 해당 월(KST) 발행/예약/대기 기사를 날짜·상태로 반환(캘린더 도트용). */
export async function calendarMonth(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  return getDb()
    .select({
      day: sql<string>`to_char(${articles.publishedAt} AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD')`,
      status: articles.status,
    })
    .from(articles)
    .where(
      and(
        isNull(articles.deletedAt),
        sql`(${articles.publishedAt} AT TIME ZONE 'Asia/Seoul') >= ${start}::date`,
        sql`(${articles.publishedAt} AT TIME ZONE 'Asia/Seoul') < (${start}::date + interval '1 month')`,
      ),
    );
}
