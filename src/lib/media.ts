/**
 * 이미지 URL 해석.
 * - 시드에는 현재 라이브(넷프로) 절대 URL 이 저장됨.
 * - NEXT_PUBLIC_MEDIA_BASE 가 설정되면(예: R2 도메인) bluejournal.co.kr/data → 그 도메인으로 치환.
 *   · 프리뷰(미설정): 라이브 넷프로 이미지 사용 → 컷오버 전까지 정상 표시
 *   · R2 준비 후(설정): R2 에서 서빙
 */
const MEDIA_BASE = process.env.NEXT_PUBLIC_MEDIA_BASE || "";

export function resolveImg(url?: string | null): string | null {
  if (!url) return null;
  if (MEDIA_BASE) {
    return url.replace(
      /^https?:\/\/(?:www\.)?bluejournal\.co\.kr\/data\//i,
      `${MEDIA_BASE}/data/`,
    );
  }
  return url;
}

export function rewriteBodyImages(html: string): string {
  if (!MEDIA_BASE || !html) return html;
  return html.replace(
    /(<img[^>]+src=["'])([^"']+)(["'])/gi,
    (_m, a, src, c) => a + (resolveImg(src) ?? src) + c,
  );
}
