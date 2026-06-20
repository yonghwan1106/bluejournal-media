// 주간 운영 다이제스트 cron. 발행인 이메일로 7일 요약 발송. RESEND_API_KEY 없으면 대기.
import { weeklyDigest, topRecentPublished } from "@/lib/admin-db";
import { sendEmail, emailConfigured } from "@/lib/email";
import { SITE } from "@/lib/site";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  const key = new URL(req.url).searchParams.get("key");
  if (secret && auth !== `Bearer ${secret}` && key !== secret) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!emailConfigured()) return Response.json({ skip: "RESEND_API_KEY 미설정" });

  const to = process.env.DIGEST_TO || SITE.email;
  const [d, top] = await Promise.all([
    weeklyDigest(),
    topRecentPublished(7, 5),
  ]);
  const topHtml = top
    .map((t, i) => `<li>${i + 1}. <a href="${SITE.url}/news/${t.id}">${t.title}</a></li>`)
    .join("");

  const html = `<div style="font-family:sans-serif;max-width:600px">
    <h2 style="color:#0b4ea2">경인블루저널 주간 운영 리포트</h2>
    <p>최근 7일 — 발행 <b>${d.published7}</b>건</p>
    <h3>🔥 이번 주 인기 기사</h3><ol>${topHtml || "<li>데이터 없음</li>"}</ol>
    <p style="color:#888;font-size:12px;border-top:1px solid #eee;padding-top:10px">
      <a href="${SITE.url}/admin/digest">관리자에서 자세히 보기</a>
    </p>
  </div>`;

  const ok = await sendEmail(to, "[경인블루저널] 주간 운영 리포트", html);
  return Response.json({ sent: ok ? 1 : 0 });
}
