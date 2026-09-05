// 예약발행 cron: status=scheduled 이고 publishedAt 도래분을 published 로 승격 + ISR 무효화.
// Vercel Cron 이 Authorization: Bearer <CRON_SECRET> 로 호출한다.
import { getDb } from "@/db";
import { articles } from "@/db/schema";
import { authorizeCronRequest } from "@/lib/cron-auth";
import { and, eq, lte, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const authorization = authorizeCronRequest(req);
  if (!authorization.ok) {
    if (authorization.status === 503) {
      console.error("[cron] CRON_SECRET가 설정되지 않아 예약발행 요청을 거부했습니다.");
    }
    return Response.json({ error: authorization.error }, { status: authorization.status });
  }

  let ids: number[] = [];
  try {
    const rows = await getDb()
      .update(articles)
      .set({ status: "published" })
      .where(
        and(
          eq(articles.status, "scheduled"),
          lte(articles.publishedAt, new Date()),
          isNull(articles.deletedAt),
        ),
      )
      .returning({ id: articles.id });
    ids = rows.map((r) => r.id);
    if (ids.length) {
      revalidatePath("/");
      revalidatePath("/rss.xml");
      revalidatePath("/section/[section]", "page");
      revalidatePath("/region/[region]", "page");
      for (const id of ids) revalidatePath(`/news/${id}`);
    }
  } catch (e) {
    console.error("[cron] 예약발행 실패:", e);
    return Response.json({ error: "fail" }, { status: 500 });
  }
  return Response.json({ published: ids.length, ids });
}
