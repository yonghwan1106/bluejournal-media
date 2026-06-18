import "server-only";
import { cache } from "react";
import { and, eq, ne, or, ilike, isNull, sql as dsql } from "drizzle-orm";
import seedData from "../../seed/articles.json";
import { getDb } from "@/db";
import { articles } from "@/db/schema";

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

/** 리스트/검색 페이지의 한 화면 최대 노출 건수(무제한 방지). 상세는 별도. */
export const LIST_PAGE_SIZE = 100;

/**
 * 공개 데이터 소스. DATABASE_URL 있으면 Neon(Postgres) 조회, 없으면 seed/articles.json.
 * 페이지/카드가 기대하는 SeedArticle 형태(publishedAt: ISO 문자열)로 통일.
 * React cache() 로 렌더 패스 내 동일 호출 디둡. 페이지는 ISR(revalidate)로 캐시되므로
 * DB 는 빌드/재생성 시에만 조회(요청마다 X; 단 /search 는 동적).
 */
type Row = typeof articles.$inferSelect;

// 리스트/카드용 경량 컬럼(본문 제외 → 페이로드 ~15배 절감). 상세(getArticle)만 전체 조회.
const CARD_COLS = {
  id: articles.id,
  board: articles.board,
  title: articles.title,
  subtitle: articles.subtitle,
  reporterName: articles.reporterName,
  reporterEmail: articles.reporterEmail,
  section: articles.section,
  region: articles.region,
  displaySlot: articles.displaySlot,
  thumbnailUrl: articles.thumbnailUrl,
  source: articles.source,
  sourceUrl: articles.sourceUrl,
  tags: articles.tags,
  viewCount: articles.viewCount,
  status: articles.status,
  publishedAt: articles.publishedAt,
} as const;
type CardRow = { [K in keyof typeof CARD_COLS]: Row[K] };

function isoOrNull(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

function fromCard(r: CardRow): SeedArticle {
  return {
    id: r.id,
    board: r.board,
    title: r.title,
    subtitle: r.subtitle,
    reporterName: r.reporterName,
    reporterEmail: r.reporterEmail,
    section: r.section,
    region: r.region,
    displaySlot: r.displaySlot,
    thumbnailUrl: r.thumbnailUrl,
    bodyHtml: "", // 리스트에선 본문 미조회
    bodyText: null,
    source: r.source,
    sourceUrl: r.sourceUrl,
    tags: (r.tags as string[] | null) ?? [],
    viewCount: r.viewCount,
    status: r.status,
    publishedAt: isoOrNull(r.publishedAt),
  };
}

function fromFull(r: Row): SeedArticle {
  return {
    ...fromCard(r),
    bodyHtml: r.bodyHtml ?? "",
    bodyText: r.bodyText,
  };
}

const hasDatabaseUrl = () => !!process.env.DATABASE_URL;

// publishedAt 내림차순(NULL 마지막) + id 내림차순 tie-breaker → 양 경로 결정적 동일 정렬
const pubOrder = dsql`${articles.publishedAt} desc nulls last, ${articles.id} desc`;

/**
 * DB 우선 + 폴백. 단, 폴백(시드)은 빌드 단계에서만 허용한다.
 * 런타임(ISR 재생성/동적)에서 DB 오류 시 재throw → Next 가 마지막 정상 페이지를 유지
 * (스테일 시드 스냅샷을 캐시에 덮어쓰지 않도록). DATABASE_URL 미설정(프리뷰)이면 항상 시드.
 */
async function viaDb<T>(run: () => Promise<T>, fallback: () => T): Promise<T> {
  if (!hasDatabaseUrl()) return fallback();
  try {
    return await run();
  } catch (e) {
    const buildPhase = process.env.NEXT_PHASE === "phase-production-build";
    if (buildPhase) {
      console.warn(
        "[articles] 빌드 중 DB 조회 실패 → 시드 폴백:",
        (e as Error)?.name ?? "error",
      );
      return fallback();
    }
    throw e; // 런타임: 마지막 정상 ISR 페이지 유지
  }
}

// ───────── JSON 시드 폴백 (정적, 모듈 캐시 OK) ─────────
let jsonCache: SeedArticle[] | null = null;
function jsonSorted(): SeedArticle[] {
  if (jsonCache) return jsonCache;
  const raw = (seedData as unknown as SeedArticle[]).slice();
  // publishedAt desc, 동률은 id desc (DB pubOrder 와 동일 결정적 정렬)
  raw.sort(
    (a, b) =>
      (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "") || b.id - a.id,
  );
  jsonCache = raw;
  return jsonCache;
}
const isPub = (a: SeedArticle) => a.status === "published";
const jsonPub = () => jsonSorted().filter(isPub);

// 관련기사 매칭(양 경로 동일): 지역 일치(지역이 있을 때) 또는 태그 겹침
function relatedMatch(x: SeedArticle, a: SeedArticle): boolean {
  const regionHit = a.region != null && x.region === a.region;
  const tagHit = (a.tags ?? []).some((t) => (x.tags ?? []).includes(t));
  return regionHit || tagHit;
}

// ───────── 공개 조회 API (전부 async) ─────────

/** 전체 게시 기사(경량). 카드용. */
export const getAllArticles = cache(
  async (): Promise<SeedArticle[]> =>
    viaDb(
      async () =>
        (
          await getDb()
            .select(CARD_COLS)
            .from(articles)
            .where(and(eq(articles.status, "published"), isNull(articles.deletedAt)))
            .orderBy(pubOrder)
        ).map(fromCard),
      () => jsonPub(),
    ),
);

/** 사이트맵용 경량 조회(id + publishedAt 만). */
export const getSitemapArticles = cache(
  async (): Promise<{ id: number; publishedAt: string | null }[]> =>
    viaDb(
      async () =>
        (
          await getDb()
            .select({ id: articles.id, publishedAt: articles.publishedAt })
            .from(articles)
            .where(and(eq(articles.status, "published"), isNull(articles.deletedAt)))
            .orderBy(pubOrder)
        ).map((r) => ({ id: r.id, publishedAt: isoOrNull(r.publishedAt) })),
      () => jsonPub().map((a) => ({ id: a.id, publishedAt: a.publishedAt })),
    ),
);

/** 단일 게시 기사(비공개 상태는 공개에 노출하지 않음 → 404). 본문 포함 전체 조회. */
export const getArticle = cache(
  async (id: number): Promise<SeedArticle | null> =>
    viaDb(
      async () => {
        const r = await getDb()
          .select()
          .from(articles)
          .where(and(eq(articles.id, id), and(eq(articles.status, "published"), isNull(articles.deletedAt))))
          .limit(1);
        return r[0] ? fromFull(r[0]) : null;
      },
      () => jsonPub().find((a) => a.id === id) ?? null,
    ),
);

export const getLatest = cache(
  async (n = 20): Promise<SeedArticle[]> =>
    viaDb(
      async () =>
        (
          await getDb()
            .select(CARD_COLS)
            .from(articles)
            .where(and(eq(articles.status, "published"), isNull(articles.deletedAt)))
            .orderBy(pubOrder)
            .limit(n)
        ).map(fromCard),
      () => jsonPub().slice(0, n),
    ),
);

export const getHeadline = cache(
  async (): Promise<SeedArticle | null> => (await getLatest(1))[0] ?? null,
);

export const getBySection = cache(
  async (section: string, n = LIST_PAGE_SIZE): Promise<SeedArticle[]> =>
    viaDb(
      async () =>
        (
          await getDb()
            .select(CARD_COLS)
            .from(articles)
            .where(
              and(and(eq(articles.status, "published"), isNull(articles.deletedAt)), eq(articles.section, section)),
            )
            .orderBy(pubOrder)
            .limit(n)
        ).map(fromCard),
      () => jsonPub().filter((a) => a.section === section).slice(0, n),
    ),
);

export const getByRegion = cache(
  async (region: string, n = LIST_PAGE_SIZE): Promise<SeedArticle[]> =>
    viaDb(
      async () =>
        (
          await getDb()
            .select(CARD_COLS)
            .from(articles)
            .where(
              and(and(eq(articles.status, "published"), isNull(articles.deletedAt)), eq(articles.region, region)),
            )
            .orderBy(pubOrder)
            .limit(n)
        ).map(fromCard),
      () => jsonPub().filter((a) => a.region === region).slice(0, n),
    ),
);

export const searchArticles = cache(
  async (q: string, limit = 50): Promise<SeedArticle[]> => {
    const s = q.trim();
    if (!s) return [];
    return viaDb(
      async () => {
        const like = `%${s}%`;
        const rows = await getDb()
          .select(CARD_COLS)
          .from(articles)
          .where(
            and(
              and(eq(articles.status, "published"), isNull(articles.deletedAt)),
              or(
                ilike(articles.title, like),
                ilike(articles.bodyText, like),
                ilike(articles.subtitle, like),
                dsql`${articles.tags}::text ilike ${like}`,
              ),
            ),
          )
          .orderBy(pubOrder)
          .limit(limit);
        return rows.map(fromCard);
      },
      () =>
        jsonPub()
          .filter(
            (a) =>
              a.title.includes(s) ||
              (a.bodyText ?? "").includes(s) ||
              (a.subtitle ?? "").includes(s) ||
              (a.tags ?? []).some((t) => t.includes(s)),
          )
          .slice(0, limit),
    );
  },
);

/** 관련 기사: 같은 지역(지역 있을 때) 또는 태그 겹침, 자기 제외, 최신순. */
export const getRelated = cache(
  async (a: SeedArticle, n = 6): Promise<SeedArticle[]> =>
    viaDb(
      async () => {
        const tags = a.tags ?? [];
        const regionCond =
          a.region != null ? eq(articles.region, a.region) : dsql`false`;
        const tagCond = tags.length
          ? dsql`${articles.tags} ?| array[${dsql.join(
              tags.map((t) => dsql`${t}`),
              dsql`, `,
            )}]::text[]`
          : dsql`false`;
        const rows = await getDb()
          .select(CARD_COLS)
          .from(articles)
          .where(
            and(
              and(eq(articles.status, "published"), isNull(articles.deletedAt)),
              ne(articles.id, a.id),
              or(regionCond, tagCond),
            ),
          )
          .orderBy(pubOrder)
          .limit(n);
        return rows.map(fromCard);
      },
      () =>
        jsonPub()
          .filter((x) => x.id !== a.id && relatedMatch(x, a))
          .slice(0, n),
    ),
);

/** 정적 생성 파라미터용 게시 기사 id 목록. */
export const getAllIds = cache(
  async (): Promise<number[]> =>
    viaDb(
      async () =>
        (
          await getDb()
            .select({ id: articles.id })
            .from(articles)
            .where(and(eq(articles.status, "published"), isNull(articles.deletedAt)))
        ).map((r) => r.id),
      () => jsonPub().map((a) => a.id),
    ),
);

export const countArticles = cache(
  async (): Promise<number> =>
    viaDb(
      async () => {
        const r = await getDb()
          .select({ c: dsql<number>`count(*)::int` })
          .from(articles)
          .where(and(eq(articles.status, "published"), isNull(articles.deletedAt)));
        return r[0]?.c ?? 0;
      },
      () => jsonPub().length,
    ),
);

export const REGIONS = ["경기", "인천"] as const;
export const SECTIONS = ["뉴스", "특집", "탐사문학"] as const;
