import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

/**
 * Neon(서버리스 Postgres) + drizzle neon-http 드라이버.
 * Vercel 서버리스에 최적: HTTP 단발 쿼리라 커넥션 풀/ProxySQL 불필요(Neon 풀러 내장).
 *
 * DATABASE_URL 미설정 환경(프리뷰 등)에서도 import 만으로 throw 하지 않도록
 * 실제 첫 쿼리 시점까지 클라이언트 생성을 지연(lazy)한다. neon() 은 빈 연결문자열에
 * 즉시 throw 하므로, 관리자 레이어가 dbConfigured() 가드를 통과한 뒤에만 getDb() 를 호출한다.
 */
const globalForDb = globalThis as unknown as {
  _db?: NeonHttpDatabase<typeof schema>;
};

export function getDb(): NeonHttpDatabase<typeof schema> {
  if (globalForDb._db) return globalForDb._db;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL 미설정 — db 사용 전 dbConfigured() 로 가드해야 합니다.",
    );
  }
  const instance = drizzle(neon(url), { schema });
  globalForDb._db = instance;
  return instance;
}

export { schema };
