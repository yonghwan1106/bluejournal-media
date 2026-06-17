// RSS 2.0 피드(/rss.xml) — 네이버 서치어드바이저 RSS 제출용. 최신 게시 기사.
// 네이버 규칙: 피드 내 모든 URL 은 소유확인 도메인(bluejournal.co.kr)과 동일해야 함
// → 기사 링크/guid 는 https://bluejournal.co.kr/news/N 만 사용(이미지 서브도메인 미포함).
import { getLatest } from "@/lib/articles";
import { SITE } from "@/lib/site";

export const runtime = "nodejs";
export const revalidate = 600; // 10분 캐시(ISR)

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const base = SITE.url.replace(/\/$/, "");
  const lastBuild = new Date().toUTCString();
  const items = await getLatest(30);

  const body = items
    .map((a) => {
      const link = `${base}/news/${a.id}`;
      const pub = a.publishedAt ? new Date(a.publishedAt).toUTCString() : lastBuild;
      const desc = a.subtitle ?? a.bodyText ?? "";
      return `    <item>
      <title>${esc(a.title)}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${pub}</pubDate>
      <category>${esc(a.section)}</category>
      <description><![CDATA[${desc}]]></description>
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${esc(SITE.name)}</title>
    <link>${base}</link>
    <description>${esc(SITE.description)}</description>
    <language>ko</language>
    <lastBuildDate>${lastBuild}</lastBuildDate>
${body}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=600, stale-while-revalidate=86400",
    },
  });
}
