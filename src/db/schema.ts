import {
  mysqlTable,
  int,
  varchar,
  text,
  mediumtext,
  timestamp,
  json,
  mysqlEnum,
  index,
} from "drizzle-orm/mysql-core";

/**
 * 기사 테이블.
 * id = 그누보드 wr_id 를 그대로 보존한다 (→ /news/[id] 클린 URL 유지 + 레거시 301 매핑).
 */
export const articles = mysqlTable(
  "articles",
  {
    id: int("id").autoincrement().primaryKey(), // 그누보드 wr_id 보존(명시삽입), 신규는 자동증가
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
    bodyHtml: mediumtext("body_html").notNull(),
    bodyText: text("body_text"),
    source: varchar("source", { length: 200 }),
    sourceUrl: varchar("source_url", { length: 1000 }),
    tags: json("tags").$type<string[]>().default([]),
    viewCount: int("view_count").notNull().default(0),
    status: mysqlEnum("status", ["published", "draft", "hidden"])
      .notNull()
      .default("published"),
    publishedAt: timestamp("published_at"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
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
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  username: varchar("username", { length: 60 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  email: varchar("email", { length: 200 }),
  role: mysqlEnum("role", ["admin", "editor", "reporter"])
    .notNull()
    .default("reporter"),
  createdAt: timestamp("created_at").defaultNow(),
});

/** 배너 광고 (관리자 → 배너광고관리 대체) */
export const banners = mysqlTable("banners", {
  id: int("id").autoincrement().primaryKey(),
  position: varchar("position", { length: 50 }).notNull(), // 출력위치
  imageUrl: varchar("image_url", { length: 1000 }).notNull(),
  linkUrl: varchar("link_url", { length: 1000 }),
  alt: varchar("alt", { length: 255 }),
  sortOrder: int("sort_order").notNull().default(0),
  active: mysqlEnum("active", ["Y", "N"]).notNull().default("Y"),
  startsAt: timestamp("starts_at"),
  endsAt: timestamp("ends_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

/** 팝업/새창 (관리자 → 새창관리 대체) */
export const popups = mysqlTable("popups", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 255 }),
  imageUrl: varchar("image_url", { length: 1000 }),
  linkUrl: varchar("link_url", { length: 1000 }),
  device: mysqlEnum("device", ["all", "pc", "mobile"]).notNull().default("all"),
  posX: int("pos_x").notNull().default(10),
  posY: int("pos_y").notNull().default(10),
  width: int("width").notNull().default(400),
  height: int("height").notNull().default(500),
  startsAt: timestamp("starts_at"),
  endsAt: timestamp("ends_at"),
  active: mysqlEnum("active", ["Y", "N"]).notNull().default("Y"),
  createdAt: timestamp("created_at").defaultNow(),
});

/** 사이트 설정 / 의무게재 정보 (신문법: 발행인·편집인·청소년보호책임자·등록번호 등) key-value */
export const siteConfig = mysqlTable("site_config", {
  key: varchar("config_key", { length: 100 }).primaryKey(),
  value: text("config_value"),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

/** 구 이미지 경로 → R2 URL 매핑 (이관 추적/리라이트 검증용) */
export const mediaMap = mysqlTable(
  "media_map",
  {
    id: int("id").autoincrement().primaryKey(),
    oldPath: varchar("old_path", { length: 1000 }).notNull(),
    r2Key: varchar("r2_key", { length: 1000 }).notNull(),
    r2Url: varchar("r2_url", { length: 1000 }).notNull(),
    bytes: int("bytes"),
    contentType: varchar("content_type", { length: 100 }),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [index("oldpath_idx").on(t.oldPath)],
);

export type Article = typeof articles.$inferSelect;
export type NewArticle = typeof articles.$inferInsert;
