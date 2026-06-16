// 한국 매체이므로 모든 시각을 KST(Asia/Seoul, 고정 UTC+9, DST 없음)로 렌더한다.
// instant(Date/ISO)를 받아 +9h 오프셋 후 getUTC* 로 읽으면 서버 TZ 와 무관하게 KST 벽시계가 된다.
const KST_MS = 9 * 60 * 60 * 1000;
const pad = (n: number) => String(n).padStart(2, "0");

function kstParts(iso: string | null): {
  y: number; mo: string; d: string; h: string; mi: string;
} | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (isNaN(date.getTime())) return null;
  const k = new Date(date.getTime() + KST_MS);
  return {
    y: k.getUTCFullYear(),
    mo: pad(k.getUTCMonth() + 1),
    d: pad(k.getUTCDate()),
    h: pad(k.getUTCHours()),
    mi: pad(k.getUTCMinutes()),
  };
}

export function formatDate(iso: string | null): string {
  const p = kstParts(iso);
  return p ? `${p.y}.${p.mo}.${p.d}` : "";
}

export function formatDateTime(iso: string | null): string {
  const p = kstParts(iso);
  return p ? `${p.y}.${p.mo}.${p.d} ${p.h}:${p.mi}` : "";
}

/**
 * 시각 문자열을 정확한 instant(Date)로 변환.
 * - 명시 오프셋(Z 또는 ±HH:MM)이 있으면 그대로 존중(자동화 API 의 풀 ISO 대비).
 * - 오프셋이 없으면(관리자 폼의 datetime-local 'YYYY-MM-DDTHH:MM') KST 벽시계로 해석.
 *   → 서버 TZ 와 무관하게 일관된 KST 저장.
 */
export function kstInputToDate(s: string): Date {
  if (/([zZ]|[+-]\d{2}:?\d{2})$/.test(s.trim())) return new Date(s);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return new Date(s);
  const [, y, mo, d, h, mi] = m;
  return new Date(`${y}-${mo}-${d}T${h}:${mi}:00+09:00`);
}

/** Date(instant) → 관리자 폼 datetime-local 값('YYYY-MM-DDTHH:MM', KST 벽시계) */
export function toKstInput(d: Date): string {
  const k = new Date(d.getTime() + KST_MS);
  return `${k.getUTCFullYear()}-${pad(k.getUTCMonth() + 1)}-${pad(
    k.getUTCDate(),
  )}T${pad(k.getUTCHours())}:${pad(k.getUTCMinutes())}`;
}
