import { getDb } from "@/db";
import { articles } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import {
  extractArticle,
  type SourceItem,
  type SourceType,
} from "@/lib/daily-gyeonggi-news";

export const runtime = "nodejs";
export const maxDuration = 60;

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
function kstDate(d: Date): string {
  return new Date(d.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

// 저장된 source(매체명) → 스캐너 type 복원(재추출 시 올바른 파서 선택)
const TYPE_BY_SOURCE: Record<string, SourceType> = {
  경기도: "gnews",
  인천광역시: "incheon",
  인천광역시의회: "incheon_council",
  성남시: "seongnam",
  수원특례시: "suwon",
  화성특례시: "hwaseong",
  용인특례시: "yongin",
  경기도의회: "ggc",
  수원특례시의회: "suwon_council",
  용인특례시의회: "yongin_council",
  성남시의회: "seongnam_council",
  화성특례시의회: "hwaseong_council",
};

// source(매체명)로 매핑 안 되면(옛 ETL 등 형식이 다른 경우) source_url 호스트로 type 추론
function resolveType(source: string, url: string): SourceType | null {
  if (TYPE_BY_SOURCE[source]) return TYPE_BY_SOURCE[source];
  if (url.includes("gnews.gg.go.kr")) return "gnews";
  if (url.includes("icouncil.go.kr")) return "incheon_council";
  if (url.includes("incheon.go.kr")) return "incheon";
  if (url.includes("council.suwon")) return "suwon_council";
  if (url.includes("suwon.go.kr")) return "suwon";
  if (url.includes("council.hscity")) return "hwaseong_council";
  if (url.includes("hscity.go.kr")) return "hwaseong";
  if (url.includes("council.yongin")) return "yongin_council";
  if (url.includes("yongin.go.kr")) return "yongin";
  if (url.includes("sncouncil.go.kr")) return "seongnam_council";
  if (url.includes("seongnam.go.kr")) return "seongnam";
  if (url.includes("ggc.go.kr")) return "ggc";
  return null;
}

/**
 * 자동수집 기사 재처리(본문/이미지 재추출). 본문에 스크립트가 섞이는 등 파싱 오류로
 * 깨진 기사를 원문에서 다시 추출해 갱신한다. Bearer NEWS_API_KEY 보호.
 * body: { ids: number[] }
 */
export async function POST(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.NEWS_API_KEY}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const { ids } = await req.json().catch(() => ({ ids: null }));
  if (!Array.isArray(ids) || ids.length === 0) {
    return Response.json({ error: "ids(number[]) required" }, { status: 400 });
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(articles)
    .where(inArray(articles.id, ids.map(Number)));

  const results: Array<Record<string, unknown>> = [];
  for (const r of rows) {
    const type = resolveType(r.source ?? "", r.sourceUrl ?? "");
    if (!type || !r.sourceUrl) {
      results.push({ id: r.id, status: "skip", reason: `type 불명(source=${r.source})` });
      continue;
    }
    const date = kstDate(r.publishedAt ?? new Date());
    const item: SourceItem = {
      key: `reprocess-${r.id}`,
      type,
      source: r.source ?? "",
      sourceLabel: `${r.source} 보도자료`,
      sourceUrl: r.sourceUrl,
      listedTitle: r.title,
      listedDate: date,
    };
    try {
      const ext = await extractArticle(item, date, { mirrorAssets: true });
      await db
        .update(articles)
        .set({
          title: ext.title,
          subtitle: ext.subtitle,
          bodyHtml: ext.bodyHtml,
          bodyText: ext.bodyText,
          thumbnailUrl: ext.imageUrl,
          tags: ext.tags,
        })
        .where(eq(articles.id, r.id));
      results.push({ id: r.id, status: "ok", title: ext.title.slice(0, 36), imgs: (ext.bodyHtml.match(/<img/g) || []).length });
    } catch (e) {
      results.push({ id: r.id, status: "fail", reason: (e as Error).message });
    }
  }
  return Response.json({ processed: results.length, results });
}
