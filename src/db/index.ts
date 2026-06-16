import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";

/**
 * Vercel 서버리스 환경에서 함수 인스턴스마다 풀이 생기는 것을 막기 위해
 * 전역에 풀을 캐싱한다. 실제 커넥션 폭증 방어는 Vultr VPS의 ProxySQL(6033)이 담당.
 */
const globalForDb = globalThis as unknown as { _pool?: mysql.Pool };

const pool =
  globalForDb._pool ??
  mysql.createPool({
    uri: process.env.DATABASE_URL,
    connectionLimit: Number(process.env.DB_POOL_LIMIT ?? 5),
    enableKeepAlive: true,
    waitForConnections: true,
  });

if (process.env.NODE_ENV !== "production") globalForDb._pool = pool;

export const db = drizzle(pool, { schema, mode: "default" });
export { schema };
