// 동적 OG 공유카드(대표이미지 없는 기사용 폴백). 제목·섹션을 1200×630 카드로 렌더.
// 한글 렌더를 위해 Noto Sans KR(korean subset) 폰트를 런타임 임베드(CDN, 모듈 캐시).
import { ImageResponse } from "next/og";
import { getArticle } from "@/lib/articles";

export const runtime = "nodejs";

const FONT_URL =
  "https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-kr@5.1.1/files/noto-sans-kr-korean-700-normal.woff";
let fontCache: ArrayBuffer | null = null;
async function loadFont(): Promise<ArrayBuffer | null> {
  if (fontCache) return fontCache;
  try {
    const r = await fetch(FONT_URL);
    if (!r.ok) return null;
    fontCache = await r.arrayBuffer();
    return fontCache;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  const a = Number.isFinite(id) && id > 0 ? await getArticle(id) : null;
  const title = (a?.title ?? "경인블루저널").slice(0, 70);
  const section = a?.section ?? "뉴스";
  const region = a?.region ? ` · ${a.region}` : "";
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
      fonts: font ? [{ name: "Noto", data: font, weight: 700, style: "normal" }] : [],
    },
  );
}
