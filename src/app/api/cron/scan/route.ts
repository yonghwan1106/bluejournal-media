// 품질 스캔 cron: 발행 기사 본문/대표의 R2 이미지를 HEAD 점검 → 깨진 이미지를 scan_reports 에 기록.
// 주간 실행. Vercel Cron(Authorization: Bearer CRON_SECRET) 또는 ?key=.
import { getDb } from "@/db";
import { articles } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { replaceOpenScans } from "@/lib/admin-db";

export const runtime = "nodejs";
export const maxDuration = 60;

async function headOk(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(8000) });
    return r.ok;
  } catch {
    return false;
  }
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  const key = new URL(req.url).searchParams.get("key");
  if (secret && auth !== `Bearer ${secret}` && key !== secret) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const rows = await db
    .select({
      id: articles.id,
      title: articles.title,
      thumbnailUrl: articles.thumbnailUrl,
      bodyHtml: articles.bodyHtml,
    })
    .from(articles)
    .where(and(eq(articles.status, "published"), isNull(articles.deletedAt)));

  // R2 이미지 URL → 참조 기사 매핑(중복 URL 은 1회만 점검)
  const urlToArticles = new Map<string, { id: number; title: string }[]>();
  for (const r of rows) {
    const urls = new Set<string>();
    if (r.thumbnailUrl?.includes("media.bluejournal.co.kr")) urls.add(r.thumbnailUrl);
    for (const m of r.bodyHtml.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) {
      if (m[1].includes("media.bluejournal.co.kr")) urls.add(m[1]);
    }
    for (const u of urls) {
      const arr = urlToArticles.get(u) ?? [];
      arr.push({ id: r.id, title: r.title });
      urlToArticles.set(u, arr);
    }
  }

  const urls = [...urlToArticles.keys()];
  const broken: { articleId: number; url: string; detail: string }[] = [];
  const CONC = 15;
  for (let i = 0; i < urls.length; i += CONC) {
    const slice = urls.slice(i, i + CONC);
    const results = await Promise.all(slice.map(async (u) => ({ u, ok: await headOk(u) })));
    for (const { u, ok } of results) {
      if (!ok) {
        for (const a of urlToArticles.get(u)!) {
          broken.push({ articleId: a.id, url: u, detail: a.title.slice(0, 100) });
        }
      }
    }
  }

  try {
    await replaceOpenScans("broken_image", broken);
  } catch (e) {
    console.error("[scan] 저장 실패:", e);
    return Response.json({ error: "fail" }, { status: 500 });
  }
  return Response.json({ scannedImages: urls.length, broken: broken.length });
}
