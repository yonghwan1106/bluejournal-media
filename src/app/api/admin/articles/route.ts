// 프로그래밍 방식 기사 발행 API (기사자동화 재타깃용)
// 인증: Authorization: Bearer <NEWS_API_KEY>
// 기존 Playwright /adm 폼 대신 JSON POST 한 번으로 발행.
import { adminCreateArticle, dbConfigured } from "@/lib/admin-db";
import { kstInputToDate } from "@/lib/format";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";

const STATUSES = ["published", "draft", "hidden"] as const;
type ArticleStatus = (typeof STATUSES)[number];
/** 허용된 status 값만 통과 — 잘못된 값으로 인한 PG enum 제약 위반(500)을 방지. */
function normStatus(v: unknown, fallback: ArticleStatus): ArticleStatus {
  return typeof v === "string" && (STATUSES as readonly string[]).includes(v)
    ? (v as ArticleStatus)
    : fallback;
}

export async function POST(req: Request) {
  const key = process.env.NEWS_API_KEY;
  const auth = req.headers.get("authorization") || "";
  if (!key || auth !== `Bearer ${key}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!dbConfigured()) {
    return Response.json({ error: "db not configured" }, { status: 503 });
  }

  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  const title = typeof b.title === "string" ? b.title.trim() : "";
  const bodyHtml = typeof b.bodyHtml === "string" ? b.bodyHtml : "";
  if (!title || !bodyHtml) {
    return Response.json({ error: "title, bodyHtml 필수" }, { status: 400 });
  }

  const s = (k: string) => (typeof b[k] === "string" ? (b[k] as string) : null);
  let id: number;
  try {
    id = await adminCreateArticle({
      board: "news",
      title,
      subtitle: s("subtitle"),
      reporterName: s("reporterName") ?? "경인블루저널",
      reporterEmail: null,
      section: s("section") ?? "뉴스",
      region: s("region"),
      displaySlot: s("displaySlot"),
      thumbnailUrl: s("thumbnailUrl"),
      bodyHtml,
      bodyText:
        bodyHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 400) ||
        null,
      source: s("source"),
      sourceUrl: s("sourceUrl"),
      tags: Array.isArray(b.tags) ? (b.tags as string[]) : [],
      viewCount: 0,
      status: normStatus(s("status"), "published"),
      publishedAt: s("publishedAt") ? kstInputToDate(s("publishedAt")!) : new Date(),
    });
  } catch (e) {
    console.error("[api] 기사 발행 실패:", e);
    return Response.json({ error: "발행 처리 중 오류" }, { status: 500 });
  }

  // 공개면 즉시 반영(서버 액션 경로와 동일하게 ISR 무효화)
  revalidatePath("/");
  revalidatePath("/section/[section]", "page");
  revalidatePath("/region/[region]", "page");
  revalidatePath(`/news/${id}`);

  const base = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
  return Response.json({ id, url: `${base}/news/${id}` }, { status: 201 });
}
