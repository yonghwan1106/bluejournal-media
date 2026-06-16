/**
 * 이미지 URL 해석.
 * 시드에는 현재 라이브(넷프로) http 절대 URL 이 저장됨. 넷프로는 https 인증서가
 * 무효(공유인증서)라 https 직접 사용 불가 → 다음 우선순위로 해석:
 *   1) NEXT_PUBLIC_MEDIA_BASE 설정 시(R2): bluejournal.co.kr/data → R2 도메인 (최종)
 *   2) 미설정 시: 동일출처 https 프록시 /api/img 로 우회 (혼합콘텐츠 해소, 프리뷰)
 * 외부 핫링크(정부기관 등)는 그대로 둠(대부분 https).
 */
const MEDIA_BASE = process.env.NEXT_PUBLIC_MEDIA_BASE || "";
const ORIGIN_RE = /^https?:\/\/(?:www\.)?bluejournal\.co\.kr(\/data\/[^"'\s]*)/i;

export function resolveImg(url?: string | null): string | null {
  if (!url) return null;
  const m = url.match(ORIGIN_RE);
  if (m) {
    if (MEDIA_BASE) return `${MEDIA_BASE}${m[1]}`;
    return `/api/img?u=${encodeURIComponent(`http://www.bluejournal.co.kr${m[1]}`)}`;
  }
  return url; // 외부 핫링크(대부분 https)는 그대로

}

export function rewriteBodyImages(html: string): string {
  if (!html) return html;
  return html.replace(
    /(<img[^>]+src=["'])([^"']+)(["'])/gi,
    (_m, a, src, c) => a + (resolveImg(src) ?? src) + c,
  );
}
