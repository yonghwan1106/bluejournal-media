// 관리자 CSV 내보내기(세션 인증). type=articles | stats. 엑셀 한글 위해 BOM 부착.
import { getSession } from "@/lib/auth";
import { getDb } from "@/db";
import { articles, pageViews } from "@/db/schema";
import { isNull, desc, sql } from "drizzle-orm";

export const runtime = "nodejs";

function cell(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: Request) {
  if (!(await getSession())) {
    return new Response("unauthorized", { status: 401 });
  }
  const type = new URL(req.url).searchParams.get("type") ?? "articles";
  const db = getDb();
  let csv: string;
  let name: string;

  if (type === "stats") {
    const rows = await db
      .select({
        day: pageViews.day,
        pv: sql<number>`count(*)::int`,
        uv: sql<number>`count(distinct ${pageViews.visitorHash})::int`,
      })
      .from(pageViews)
      .groupBy(pageViews.day)
      .orderBy(desc(pageViews.day));
    csv = "날짜,페이지뷰,순방문자\n" + rows.map((r) => `${r.day},${r.pv},${r.uv}`).join("\n");
    name = "bluejournal-stats.csv";
  } else {
    const rows = await db
      .select({
        id: articles.id,
        title: articles.title,
        section: articles.section,
        region: articles.region,
        status: articles.status,
        views: articles.viewCount,
        publishedAt: articles.publishedAt,
      })
      .from(articles)
      .where(isNull(articles.deletedAt))
      .orderBy(desc(articles.id));
    csv =
      "id,제목,섹션,지역,상태,조회수,발행일\n" +
      rows
        .map((r) =>
          [
            r.id,
            cell(r.title),
            r.section,
            r.region ?? "",
            r.status,
            r.views,
            r.publishedAt ? new Date(r.publishedAt).toISOString().slice(0, 10) : "",
          ].join(","),
        )
        .join("\n");
    name = "bluejournal-articles.csv";
  }

  return new Response("﻿" + csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}"`,
    },
  });
}
