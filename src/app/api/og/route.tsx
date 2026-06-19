// 동적 OG 공유카드(대표이미지 없는 기사 폴백). edge 런타임 + 경량 neon 쿼리(seed 번들 회피).
// 한글 렌더용 Noto Sans KR(korean subset) 폰트를 런타임 임베드(CDN, 모듈 캐시).
import { ImageResponse } from "next/og";
import { neon } from "@neondatabase/serverless";

export const runtime = "edge";

const FONT_URL =
  "https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-kr@5.1.1/files/noto-sans-kr-korean-700-normal.woff";
let fontCache: ArrayBuffer | null = null;
async function loadFont(): Promise<ArrayBuffer | null> {
  if (fontCache) return fontCache;
  try {
    const r = await fetch(FONT_URL);
    if (r.ok) {
      fontCache = await r.arrayBuffer();
      return fontCache;
    }
  } catch {
    /* 폰트 실패 시 폰트 없이 렌더 */
  }
  return null;
}

export async function GET(req: Request) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  let title = "경인블루저널";
  let section = "뉴스";
  let region = "";
  if (Number.isFinite(id) && id > 0 && process.env.DATABASE_URL) {
    try {
      const sql = neon(process.env.DATABASE_URL);
      const rows = await sql`
        select title, section, region from articles
        where id = ${id} and status = 'published' and deleted_at is null limit 1`;
      const a = rows[0] as { title: string; section: string; region: string | null } | undefined;
      if (a) {
        title = String(a.title).slice(0, 70);
        section = a.section || "뉴스";
        region = a.region ? ` · ${a.region}` : "";
      }
    } catch {
      /* 조회 실패 시 기본 카드 */
    }
  }
  const font = await loadFont();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(135deg, #0b4ea2 0%, #1769c7 100%)",
          color: "white",
          padding: "64px 72px",
          fontFamily: font ? "Noto" : "sans-serif",
        }}
      >
        <div style={{ fontSize: 30, opacity: 0.92 }}>
          경인블루저널 · {section}
          {region}
        </div>
        <div style={{ display: "flex", fontSize: 62, fontWeight: 700, lineHeight: 1.3 }}>{title}</div>
        <div style={{ fontSize: 26, opacity: 0.85 }}>bluejournal.co.kr</div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: font ? [{ name: "Noto", data: font, weight: 700 as const, style: "normal" as const }] : [],
    },
  );
}
