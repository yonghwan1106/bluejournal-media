// 방문 집계 엔드포인트. 전 페이지의 ViewBeacon 이 마운트 시 1회 호출(세션·경로당 1회).
// page_views 에 익명 이벤트 INSERT + 기사면 view_count 누적. 봇·관리자·API 경로는 제외.
import { getDb } from "@/db";
import { dbConfigured } from "@/lib/admin-db";
import { pageViews } from "@/db/schema";
import { sql } from "drizzle-orm";
import {
  isBotUA,
  kstDay,
  visitorHash,
  deviceOf,
  referrerHostOf,
} from "@/lib/analytics";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!dbConfigured()) return Response.json({ ok: false });
  const ua = req.headers.get("user-agent") || "";
  if (isBotUA(ua)) return Response.json({ ok: true, bot: true });

  let path = "";
  let referrer = "";
  try {
    const b = await req.json();
    path = typeof b?.path === "string" ? b.path : "";
    referrer = typeof b?.referrer === "string" ? b.referrer : "";
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  if (!path.startsWith("/") || path.length > 500) {
    return Response.json({ ok: false }, { status: 400 });
  }
  // 관리자·API 페이지는 접속 통계에서 제외
  if (path.startsWith("/admin") || path.startsWith("/api")) {
    return Response.json({ ok: true, skip: true });
  }

  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "0.0.0.0";
  const day = kstDay();
  const m = path.match(/^\/news\/(\d+)/);
  const articleId = m ? Number(m[1]) : null;

  try {
    const db = getDb();
    await db.insert(pageViews).values({
      day,
      path: path.slice(0, 500),
      articleId,
      visitorHash: visitorHash(ip, ua, day),
      referrerHost: referrerHostOf(referrer),
      device: deviceOf(ua),
    });
    if (articleId) {
      await db.execute(
        sql`update articles set view_count = view_count + 1 where id = ${articleId} and deleted_at is null and status = 'published'`,
      );
    }
  } catch (e) {
    console.error("[view] 기록 실패:", e);
  }
  return Response.json({ ok: true });
}
