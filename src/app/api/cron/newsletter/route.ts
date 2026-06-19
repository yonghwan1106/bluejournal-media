// 주간 뉴스레터 발송 cron. 확인된 구독자에게 최신 주요 기사를 메일로 발송.
// Vercel Cron(Authorization: Bearer CRON_SECRET) 또는 ?key=. RESEND_API_KEY 없으면 대기.
import { listConfirmedSubscribers } from "@/lib/admin-db";
import { sendEmail, emailConfigured } from "@/lib/email";
import { getLatest } from "@/lib/articles";
import { SITE } from "@/lib/site";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  const key = new URL(req.url).searchParams.get("key");
  if (secret && auth !== `Bearer ${secret}` && key !== secret) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!emailConfigured()) return Response.json({ skip: "RESEND_API_KEY 미설정" });

  const subs = await listConfirmedSubscribers();
  if (!subs.length) return Response.json({ sent: 0 });

  const articles = await getLatest(8);
  const items = articles
    .map(
      (a) =>
        `<li style="margin-bottom:12px"><a href="${SITE.url}/news/${a.id}" style="color:#0b4ea2;text-decoration:none;font-weight:bold;font-size:16px">${a.title}</a>${
          a.subtitle ? `<div style="color:#666;font-size:13px;margin-top:2px">${a.subtitle}</div>` : ""
        }</li>`,
    )
    .join("");

  let sent = 0;
  for (const s of subs) {
    const unsub = `${SITE.url}/api/newsletter/unsubscribe?token=${s.unsubscribeToken}`;
    const html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#0b4ea2;border-bottom:2px solid #0b4ea2;padding-bottom:8px">경인블루저널 주간 뉴스</h2>
      <ul style="padding-left:18px;margin-top:16px">${items}</ul>
      <p style="color:#888;font-size:12px;margin-top:28px;border-top:1px solid #eee;padding-top:12px">
        경인블루저널 · <a href="${SITE.url}" style="color:#888">bluejournal.co.kr</a> · <a href="${unsub}" style="color:#888">수신거부</a>
      </p>
    </div>`;
    if (await sendEmail(s.email, "[경인블루저널] 이번 주 주요 뉴스", html)) sent++;
  }
  return Response.json({ sent, total: subs.length });
}
