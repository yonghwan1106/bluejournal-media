import {
  pgTable,
  pgEnum,
  integer,
  varchar,
  text,
  jsonb,
  timestamp,
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
    // 1차 섹션: 뉴스 / 특집 / 지역뉴스
    section: varchar("section", { length: 50 }).notNull().default("뉴스"),
    // 2차 섹션(지역뉴스 하위): 경기 / 서울 / 인천
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

export type Article = typeof articles.$inferSelect;
export type NewArticle = typeof articles.$inferInsert;
