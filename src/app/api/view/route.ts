// 조회수 증가 비콘 엔드포인트. 공개 기사 페이지의 ViewBeacon 이 마운트 시 1회 호출.
// raw SQL 로 view_count 만 증가시켜 updated_at($onUpdate) 을 건드리지 않는다.
import { getDb } from "@/db";
import { dbConfigured } from "@/lib/admin-db";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!dbConfigured()) return Response.json({ ok: false });
  let id: number;
  try {
    const b = await req.json();
    id = Number(b?.id);
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ ok: false }, { status: 400 });
  }
  try {
    await getDb().execute(
      sql`update articles set view_count = view_count + 1 where id = ${id} and deleted_at is null and status = 'published'`,
    );
  } catch (e) {
    console.error("[view] 증가 실패:", e);
  }
  return Response.json({ ok: true });
}
