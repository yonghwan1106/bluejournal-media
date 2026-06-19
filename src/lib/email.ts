import "server-only";

/**
 * Resend(무료 월 3,000통) HTTP API 발송 래퍼. RESEND_API_KEY 미설정 시 no-op(대기).
 * 패키지 의존 없이 fetch 로 호출.
 */
export function emailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.NEWSLETTER_FROM || "경인블루저널 <noreply@bluejournal.co.kr>";
  if (!key) {
    console.warn("[email] RESEND_API_KEY 미설정 — 발송 생략:", subject);
    return false;
  }
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!r.ok) console.error("[email] 발송 실패:", r.status, await r.text().catch(() => ""));
    return r.ok;
  } catch (e) {
    console.error("[email] 발송 오류:", e);
    return false;
  }
}
