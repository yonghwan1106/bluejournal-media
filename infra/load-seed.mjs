// seed/articles.json → MySQL (articles 테이블)
// 사전: .env 의 DATABASE_URL 설정 + `npx drizzle-kit push` 로 스키마 생성
// 실행: node infra/load-seed.mjs
import mysql from "mysql2/promise";
import { readFileSync } from "node:fs";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("ERROR: DATABASE_URL 환경변수가 필요합니다.");
  process.exit(1);
}

const rows = JSON.parse(
  readFileSync(new URL("../seed/articles.json", import.meta.url), "utf8"),
);

// ISO(+09:00) → 'YYYY-MM-DD HH:MM:SS' (KST 벽시계 보존)
function toMysqlDt(iso) {
  if (!iso) return null;
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/);
  return m ? `${m[1]} ${m[2]}` : null;
}

const conn = await mysql.createConnection(url);
console.log(`적재 시작: ${rows.length}건`);

const cols = [
  "id", "board", "title", "subtitle", "reporter_name", "reporter_email",
  "section", "region", "display_slot", "thumbnail_url", "body_html",
  "body_text", "source", "source_url", "tags", "view_count", "status",
  "published_at",
];
const placeholders = `(${cols.map(() => "?").join(",")})`;

let done = 0;
const BATCH = 50;
for (let i = 0; i < rows.length; i += BATCH) {
  const chunk = rows.slice(i, i + BATCH);
  const values = [];
  const sqlRows = [];
  for (const a of chunk) {
    sqlRows.push(placeholders);
    values.push(
      a.id, a.board ?? "news", a.title, a.subtitle, a.reporterName,
      a.reporterEmail, a.section ?? "뉴스", a.region, a.displaySlot,
      a.thumbnailUrl, a.bodyHtml, a.bodyText, a.source, a.sourceUrl,
      JSON.stringify(a.tags ?? []), a.viewCount ?? 0, a.status ?? "published",
      toMysqlDt(a.publishedAt),
    );
  }
  const sql =
    `INSERT INTO articles (${cols.join(",")}) VALUES ${sqlRows.join(",")} ` +
    `ON DUPLICATE KEY UPDATE title=VALUES(title), body_html=VALUES(body_html), ` +
    `subtitle=VALUES(subtitle), thumbnail_url=VALUES(thumbnail_url), ` +
    `tags=VALUES(tags), published_at=VALUES(published_at)`;
  await conn.execute(sql, values);
  done += chunk.length;
  process.stdout.write(`\r적재 ${done}/${rows.length}`);
}

console.log(`\n완료: ${done}건 적재됨.`);
await conn.end();
