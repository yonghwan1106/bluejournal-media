// 예약발행 cron: status=scheduled 이고 publishedAt 도래분을 published 로 승격 + ISR 무효화.
// Vercel Cron 이 Authorization: Bearer <CRON_SECRET> 로 호출(또는 ?key=).
import { getDb } from "@/db";
import { articles } from "@/db/schema";
import { and, eq, lte, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  const key = new URL(req.url).searchParams.get("key");
  if (secret && auth !== `Bearer ${secret}` && key !== secret) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
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
