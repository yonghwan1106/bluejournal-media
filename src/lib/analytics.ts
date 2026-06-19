import "server-only";
import crypto from "node:crypto";

// 봇/크롤러/모니터링 UA 차단(통계 왜곡·불필요 적재 방지). 'naver' 단독은 인앱브라우저와
// 충돌하므로 네이버 크롤러는 yeti 로만 잡는다.
const BOT_RE =
  /(bot|crawl|spider|slurp|mediapartners|bingpreview|facebookexternalhit|whatsapp|telegram|yeti|googlebot|daumoa|baidu|yandex|ahrefs|semrush|mj12|dotbot|headless|phantom|puppeteer|playwright|selenium|python-requests|curl|wget|go-http|java\/|axios|node-fetch|okhttp|monitor|uptime|pingdom|lighthouse|gptbot|claudebot|ccbot|bytespider|petalbot|amazonbot)/i;

export function isBotUA(ua: string): boolean {
  return !ua || BOT_RE.test(ua);
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
/** KST 기준 날짜(YYYY-MM-DD) — 집계 키 + visitor_hash 솔트. */
export function kstDay(d: Date = new Date()): string {
  return new Date(d.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 일별 익명 방문자 해시. 날짜가 솔트에 포함돼 다음날이면 동일인도 새 해시(장기추적 불가). */
export function visitorHash(ip: string, ua: string, day: string): string {
  const salt = process.env.AUTH_SECRET || "bj-stats-salt";
  return crypto
    .createHash("sha256")
    .update(`${ip}|${ua}|${day}|${salt}`)
    .digest("hex");
}

export function deviceOf(ua: string): "mobile" | "desktop" {
  return /Mobile|Android|iPhone|iPad|iPod|Windows Phone/i.test(ua) ? "mobile" : "desktop";
}

/** referrer URL → 호스트(도메인)만. 전체 URL·쿼리(검색어 등) 미저장. */
export function referrerHostOf(ref: string | null | undefined): string | null {
  if (!ref) return null;
  try {
    const h = new URL(ref).hostname.replace(/^www\./, "");
    return h ? h.slice(0, 255) : null;
  } catch {
    return null;
  }
}

export type RefCategory = "검색" | "SNS" | "직접" | "기타";
/** 유입 호스트 → 분류(검색/SNS/직접/기타). 자기 도메인·빈값은 직접. */
export function referrerCategory(host: string | null): RefCategory {
  if (!host || /bluejournal\.co\.kr/.test(host)) return "직접";
  if (/(google|naver|daum|bing|yahoo|duckduckgo|zum|nate)/.test(host)) return "검색";
  if (/(kakao|facebook|instagram|fb\.|t\.co|twitter|x\.com|youtube|youtu\.be|band\.us|threads|tiktok|linkedin)/.test(host)) return "SNS";
  return "기타";
}
