// drizzle/*.sql → Neon 에 비대화형으로 스키마 적용 (drizzle-kit push 의 TTY 의존 회피).
// 사전: `npx drizzle-kit generate` 로 drizzle/000x_*.sql 생성.
// 실행: DATABASE_URL=<UNPOOLED> node infra/apply-schema.mjs
//   (DDL 은 pooler 우회를 위해 UNPOOLED 연결 권장)
import { neon } from "@neondatabase/serverless";
import { readFileSync, readdirSync } from "node:fs";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("ERROR: DATABASE_URL 환경변수가 필요합니다.");
  process.exit(1);
}

const dir = new URL("../drizzle/", import.meta.url);
let files;
try {
  files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
} catch {
  files = [];
}
if (!files.length) {
  console.error("drizzle/*.sql 이 없습니다 — 먼저 `npx drizzle-kit generate` 를 실행하세요.");
  process.exit(1);
}

const sql = neon(url);
let applied = 0;
for (const f of files) {
  const content = readFileSync(new URL(f, dir), "utf8");
  const stmts = content
    .split("--> statement-breakpoint")
    .map((s) => s.trim().replace(/;\s*$/, "")) // neon http 는 단일문 — 끝 세미콜론 제거
    .filter(Boolean);
  console.log(`${f}: ${stmts.length} statements`);
  for (const stmt of stmts) {
    try {
      await sql.query(stmt);
      applied++;
    } catch (e) {
      // 이미 존재(재실행) 등은 무시하지 않고 표시 — 단, idempotent 재적용을 위해
      // "already exists" 류만 경고로 넘긴다.
      const msg = String(e?.message ?? e);
      if (/already exists/i.test(msg)) {
        console.warn(`  (skip, 이미 존재) ${stmt.slice(0, 60)}…`);
      } else {
        console.error(`\n실패:\n${stmt}\n→ ${msg}`);
        process.exit(1);
      }
    }
  }
}
console.log(`스키마 적용 완료: ${applied} statements.`);
