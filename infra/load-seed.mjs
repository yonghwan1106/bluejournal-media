// seed/articles.json → Neon Postgres (articles 테이블)
// 사전: .env 의 DATABASE_URL(Neon) 설정 + `npx drizzle-kit push` 로 스키마 생성
// 실행: node infra/load-seed.mjs
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("ERROR: DATABASE_URL 환경변수가 필요합니다.");
  process.exit(1);
}

const rows = JSON.parse(
  readFileSync(new URL("../seed/articles.json", import.meta.url), "utf8"),
);

// varchar 컬럼 최대 길이(스키마와 일치). 초과 시 한 행 때문에 전체 적재가 중단되지 않도록
// 안전하게 절단하고 경고를 남긴다(예: id=583 source 가 본문 중복으로 15,138자).
const VARCHAR = {
  board: 32, reporterName: 100, reporterEmail: 200, section: 50, region: 50,
  displaySlot: 50, source: 200, title: 500, subtitle: 500,
  thumbnailUrl: 1000, sourceUrl: 1000,
};
let clipped = 0;
function clip(field, v) {
  if (typeof v !== "string") return v;
  const max = VARCHAR[field];
  if (max && v.length > max) {
    clipped++;
    console.warn(`\n  ⚠️ 절단: ${field} ${v.length}→${max}자`);
    return v.slice(0, max);
  }
  return v;
}

const sql = neon(url);
console.log(`적재 시작: ${rows.length}건`);

const cols = [
  "id", "board", "title", "subtitle", "reporter_name", "reporter_email",
  "section", "region", "display_slot", "thumbnail_url", "body_html",
  "body_text", "source", "source_url", "tags", "view_count", "status",
  "published_at",
];

let done = 0;
const BATCH = 50;
for (let i = 0; i < rows.length; i += BATCH) {
  const chunk = rows.slice(i, i + BATCH);
  const values = [];
  const sqlRows = [];
  let p = 1;
  for (const a of chunk) {
    // tags 는 jsonb, published_at 은 timestamptz 이므로 명시 캐스트
    const ph = cols.map((c) => {
      if (c === "tags") return `$${p++}::jsonb`;
      if (c === "published_at") return `$${p++}::timestamptz`;
      return `$${p++}`;
    });
    sqlRows.push(`(${ph.join(",")})`);
    values.push(
      a.id, clip("board", a.board ?? "news"), clip("title", a.title),
      clip("subtitle", a.subtitle), clip("reporterName", a.reporterName),
      clip("reporterEmail", a.reporterEmail), clip("section", a.section ?? "뉴스"),
      clip("region", a.region), clip("displaySlot", a.displaySlot),
      clip("thumbnailUrl", a.thumbnailUrl), a.bodyHtml, a.bodyText,
      clip("source", a.source), clip("sourceUrl", a.sourceUrl),
      JSON.stringify(a.tags ?? []), a.viewCount ?? 0, a.status ?? "published",
      // 원본 ISO(+09:00)를 그대로 보내면 PG 가 timestamptz 로 정확한 instant 저장
      a.publishedAt ?? null,
    );
  }
  const text =
    `INSERT INTO articles (${cols.join(",")}) VALUES ${sqlRows.join(",")} ` +
    `ON CONFLICT (id) DO UPDATE SET ` +
    `title=EXCLUDED.title, body_html=EXCLUDED.body_html, ` +
    `subtitle=EXCLUDED.subtitle, thumbnail_url=EXCLUDED.thumbnail_url, ` +
    `tags=EXCLUDED.tags, published_at=EXCLUDED.published_at, ` +
    `section=EXCLUDED.section, region=EXCLUDED.region`;
  await sql.query(text, values);
  done += chunk.length;
  process.stdout.write(`\r적재 ${done}/${rows.length}`);
}

// ⚠️ 필수: 명시 id 로 적재했으므로 identity 시퀀스를 MAX(id) 로 전진시킨다.
// (안 하면 신규 발행 시 id=1 부터 시작해 기존 행과 PK 충돌)
// 3-인자 setval: 빈 테이블이면 is_called=false 로 두어 첫 id 가 1 이 되게 한다.
await sql.query(
  `SELECT setval(
     pg_get_serial_sequence('articles', 'id'),
     GREATEST(COALESCE((SELECT MAX(id) FROM articles), 1), 1),
     (SELECT COUNT(*) FROM articles) > 0
   )`,
);

console.log(
  `\n완료: ${done}건 적재 + id 시퀀스 동기화` +
    (clipped ? ` (varchar 절단 ${clipped}건)` : "") + ".",
);
