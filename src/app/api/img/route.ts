// 이미지 프록시: 넷프로(http) 이미지를 동일출처 https 로 스트리밍 (혼합콘텐츠 해소).
// R2 전환(NEXT_PUBLIC_MEDIA_BASE) 후에는 사용되지 않음.
// SSRF 방지: bluejournal.co.kr/data 경로만 허용.
const ALLOW = /^https?:\/\/(?:www\.)?bluejournal\.co\.kr\/data\//i;

export const runtime = "nodejs";

export async function GET(req: Request) {
  const u = new URL(req.url).searchParams.get("u");
  if (!u) return new Response("missing u", { status: 400 });
  if (!ALLOW.test(u)) return new Response("forbidden", { status: 403 });

  let upstream: Response;
  try {
    upstream = await fetch(u, {
      headers: { "User-Agent": "bluejournal-img-proxy/1.0" },
      // 넷프로 원본은 자주 안 바뀌므로 캐시 허용
      cache: "force-cache",
    });
  } catch {
    return new Response("upstream error", { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    return new Response("not found", { status: upstream.status || 404 });
  }

  const ct = upstream.headers.get("content-type") || "image/jpeg";
  return new Response(upstream.body, {
    headers: {
      "Content-Type": ct,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
