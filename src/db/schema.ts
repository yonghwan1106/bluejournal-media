import {
  pgTable,
  pgEnum,
  integer,
  varchar,
  text,
  jsonb,
  timestamp,
  date,
  index,
} from "drizzle-orm/pg-core";

/**
 * Postgres enum 타입 (Neon). MySQL mysqlEnum 대체.
 * 주의: PG enum 은 값 추가 시 `ALTER TYPE ... ADD VALUE` 가 필요(drizzle-kit 이 처리).
 */
export const articleStatus = pgEnum("article_status", [
  "published",
  "draft",
  "hidden",
  "scheduled",
]);
export const userRole = pgEnum("user_role", ["admin", "editor", "reporter"]);
export const yn = pgEnum("yn", ["Y", "N"]);
export const popupDevice = pgEnum("popup_device", ["all", "pc", "mobile"]);

// 모든 시각은 timestamptz(withTimezone)로 '실제 instant' 를 저장한다.
// 이렇게 해야 시드(KST +09:00 ISO)와 관리자 입력(KST)이 동일 규약으로 일관되게
// 저장/조회되고, 표시 계층(format.ts)이 Asia/Seoul 로 렌더한다.
// (timestamp without tz 를 쓰면 drizzle 이 naive 문자열을 UTC 로 읽어 +9h 드리프트 발생.)
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/**
 * 기사 테이블.
 * id = 그누보드 wr_id 를 그대로 보존한다 (→ /news/[id] 클린 URL 유지 + 레거시 301 매핑).
 * identity(BY DEFAULT) 라 시드 시 명시 id 삽입이 가능하고, 신규는 자동 증가.
 * ⚠️ 시드(명시 id) 적재 후에는 시퀀스를 MAX(id)로 전진시켜야 신규 발행 PK 충돌이 없다
 *    (load-seed.mjs 의 setval 단계 참고).
 */
export const articles = pgTable(
  "articles",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    board: varchar("board", { length: 32 }).notNull().default("news"),
    title: varchar("title", { length: 500 }).notNull(),
    subtitle: varchar("subtitle", { length: 500 }),
    reporterName: varchar("reporter_name", { length: 100 }),
    reporterEmail: varchar("reporter_email", { length: 200 }),
    // 섹션: 뉴스 / 특집 / 탐사문학
    section: varchar("section", { length: 50 }).notNull().default("뉴스"),
    // 지역: 경기 / 인천 (경인 매체 — 서울 제외)
    region: varchar("region", { length: 50 }),
    // 메인 출력영역: 헤드라인 / 주요뉴스 / 중앙섹션 / 우측섹션
    displaySlot: varchar("display_slot", { length: 50 }),
    thumbnailUrl: varchar("thumbnail_url", { length: 1000 }),
    // MySQL mediumtext → PG text(무제한 길이)
    bodyHtml: text("body_html").notNull(),
    bodyText: text("body_text"),
    source: varchar("source", { length: 200 }),
    sourceUrl: varchar("source_url", { length: 1000 }),
    // MySQL json → PG jsonb
    tags: jsonb("tags").$type<string[]>().default([]),
    viewCount: integer("view_count").notNull().default(0),
    status: articleStatus("status").notNull().default("published"),
    publishedAt: ts("published_at"),
    createdAt: ts("created_at").defaultNow(),
    // MySQL onUpdateNow() 대체: 앱(Drizzle) 레벨에서 갱신 시각 자동 설정
    updatedAt: ts("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date()),
    // 휴지통(소프트 삭제): 값이 있으면 삭제 상태 → 공개·관리 목록에서 제외, 복원 가능.
    deletedAt: ts("deleted_at"),
    // 작성자(users.id) — 기자 권한(자기 글만 편집) 판정용. 기존/외부 기사는 null.
    authorId: integer("author_id"),
    // SEO·공유 메타. 비어 있으면 발행 시 본문/대표이미지로 자동 채움.
    metaDescription: varchar("meta_description", { length: 300 }),
    ogImage: varchar("og_image", { length: 1000 }),
    // 정정/업데이트 고지(독자에게 기사 상단 배너로 노출)
    correctionNote: varchar("correction_note", { length: 500 }),
    correctionAt: ts("correction_at"),
  },
  (t) => [
    index("section_idx").on(t.section),
    index("region_idx").on(t.region),
    index("slot_idx").on(t.displaySlot),
    index("published_idx").on(t.publishedAt),
    index("status_idx").on(t.status),
  ],
);

/** 관리자/기자 계정 (그누보드 회원 비밀번호는 이관하지 않고 신규 발급) */
export const users = pgTable("users", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  username: varchar("username", { length: 60 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  email: varchar("email", { length: 200 }),
  role: userRole("role").notNull().default("reporter"),
  createdAt: ts("created_at").defaultNow(),
});

/** 배너 광고 (관리자 → 배너광고관리 대체) */
export const banners = pgTable("banners", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  position: varchar("position", { length: 50 }).notNull(), // 출력위치
  imageUrl: varchar("image_url", { length: 1000 }).notNull(),
  linkUrl: varchar("link_url", { length: 1000 }),
  alt: varchar("alt", { length: 255 }),
  sortOrder: integer("sort_order").notNull().default(0),
  active: yn("active").notNull().default("Y"),
  startsAt: ts("starts_at"),
  endsAt: ts("ends_at"),
  createdAt: ts("created_at").defaultNow(),
});

/** 팝업/새창 (관리자 → 새창관리 대체) */
export const popups = pgTable("popups", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  title: varchar("title", { length: 255 }),
  imageUrl: varchar("image_url", { length: 1000 }),
  linkUrl: varchar("link_url", { length: 1000 }),
  device: popupDevice("device").notNull().default("all"),
  posX: integer("pos_x").notNull().default(10),
  posY: integer("pos_y").notNull().default(10),
  width: integer("width").notNull().default(400),
  height: integer("height").notNull().default(500),
  startsAt: ts("starts_at"),
  endsAt: ts("ends_at"),
  active: yn("active").notNull().default("Y"),
  createdAt: ts("created_at").defaultNow(),
});

/** 사이트 설정 / 의무게재 정보 (신문법: 발행인·편집인·청소년보호책임자·등록번호 등) key-value */
export const siteConfig = pgTable("site_config", {
  key: varchar("config_key", { length: 100 }).primaryKey(),
  value: text("config_value"),
  updatedAt: ts("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/** 구 이미지 경로 → R2 URL 매핑 (이관 추적/리라이트 검증용) */
export const mediaMap = pgTable(
  "media_map",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    oldPath: varchar("old_path", { length: 1000 }).notNull(),
    r2Key: varchar("r2_key", { length: 1000 }).notNull(),
    r2Url: varchar("r2_url", { length: 1000 }).notNull(),
    bytes: integer("bytes"),
    contentType: varchar("content_type", { length: 100 }),
    createdAt: ts("created_at").defaultNow(),
  },
  (t) => [index("oldpath_idx").on(t.oldPath)],
);

/** 기사 수정 이력(버전) — 저장 직전 상태를 jsonb 스냅샷으로 보관, 되돌리기 지원. */
export const articleRevisions = pgTable(
  "article_revisions",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    articleId: integer("article_id").notNull(),
    title: varchar("title", { length: 500 }),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
    createdAt: ts("created_at").defaultNow(),
  },
  (t) => [index("rev_article_idx").on(t.articleId)],
);

/**
 * 페이지 방문 이벤트(일/주/월 접속자 통계용).
 * 개인정보 비식별: IP·UA 원문·전체 referrer·쿠키 미저장. visitor_hash 는
 * SHA-256(ip+ua+day+salt)로 날짜가 솔트에 포함돼 일별 익명 유니크 근사만 가능.
 * 90일 경과 행은 cron 으로 정리(daily 롤업은 후속).
 */
export const pageViews = pgTable(
  "page_views",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    day: date("day").notNull(), // KST 기준 날짜(집계 키)
    path: varchar("path", { length: 500 }).notNull(),
    articleId: integer("article_id"), // 기사 페이지만 채움
    visitorHash: varchar("visitor_hash", { length: 64 }).notNull(),
    referrerHost: varchar("referrer_host", { length: 255 }), // 도메인만
    device: varchar("device", { length: 20 }), // 'mobile' | 'desktop'
    createdAt: ts("created_at").defaultNow(),
  },
  (t) => [
    index("pv_day_idx").on(t.day),
    index("pv_article_day_idx").on(t.articleId, t.day),
  ],
);

/** 자동수집 cron 실행 로그(기관별 1행) — 헬스 대시보드용. */
export const cronRuns = pgTable(
  "cron_runs",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    runAt: ts("run_at").defaultNow(),
    job: varchar("job", { length: 50 }).notNull().default("gyeonggi-news"),
    sourceAgency: varchar("source_agency", { length: 100 }).notNull(),
    fetched: integer("fetched").notNull().default(0),
    published: integer("published").notNull().default(0),
    skipped: integer("skipped").notNull().default(0),
    failed: integer("failed").notNull().default(0),
    errorText: text("error_text"),
  },
  (t) => [index("cron_runs_runat_idx").on(t.runAt)],
);

/** 뉴스레터 구독자. 더블옵트인(confirmed_at) + 원클릭 해지(unsubscribe_token). */
export const subscribers = pgTable("subscribers", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  region: varchar("region", { length: 50 }), // 관심 지역(선택)
  confirmedAt: ts("confirmed_at"), // null = 미확인(옵트인 대기)
  unsubscribeToken: varchar("unsubscribe_token", { length: 64 }).notNull(),
  createdAt: ts("created_at").defaultNow(),
});

/** 재사용 본문 스니펫(기자 서명·제보 안내 등). 에디터에서 삽입. */
export const snippets = pgTable("snippets", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  label: varchar("label", { length: 100 }).notNull(),
  html: text("html").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: ts("created_at").defaultNow(),
});

/** 품질 스캐너 결과(깨진 이미지·죽은 링크·고아 파일). */
export const scanReports = pgTable(
  "scan_reports",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    kind: varchar("kind", { length: 30 }).notNull(), // broken_image | dead_link | orphan_file
    articleId: integer("article_id"),
    url: varchar("url", { length: 1000 }),
    detail: varchar("detail", { length: 500 }),
    status: varchar("status", { length: 20 }).notNull().default("open"), // open | resolved | ignored
    createdAt: ts("created_at").defaultNow(),
  },
  (t) => [index("scan_kind_idx").on(t.kind), index("scan_status_idx").on(t.status)],
);

export type Article = typeof articles.$inferSelect;
export type NewArticle = typeof articles.$inferInsert;
export type PageView = typeof pageViews.$inferInsert;
export type CronRun = typeof cronRuns.$inferSelect;
export type Subscriber = typeof subscribers.$inferSelect;
export type Snippet = typeof snippets.$inferSelect;
export type ScanReport = typeof scanReports.$inferSelect;
