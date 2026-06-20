// 주간 운영 다이제스트 cron. 발행인 이메일로 7일 요약 발송. RESEND_API_KEY 없으면 대기.
import { weeklyDigest, topRecentPublished, listOpenScans } from "@/lib/admin-db";
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
  const [d, top, scans] = await Promise.all([
    weeklyDigest(),
    topRecentPublished(7, 5),
    listOpenScans(),
  ]);
  const broken = scans.filter((s) => s.kind === "broken_image").length;
  const topHtml = top
    .map((t) => `<li><a href="${SITE.url}/news/${t.id}">${t.title}</a> (${t.views})</li>`)
    .join("");

  const html = `<div style="font-family:sans-serif;max-width:600px">
    <h2 style="color:#0b4ea2">경인블루저널 주간 운영 리포트</h2>
    <p>최근 7일 — 발행 <b>${d.published7}</b>건 · 페이지뷰 <b>${d.pv7}</b> · 순방문자 <b>${d.uv7}</b></p>
    <h3>🔥 이번 주 인기 기사</h3><ol>${topHtml || "<li>데이터 없음</li>"}</ol>
    <h3>⚠️ 점검</h3><p>깨진 이미지 ${broken}건 — <a href="${SITE.url}/admin/health">확인</a></p>
    <p style="color:#888;font-size:12px;border-top:1px solid #eee;padding-top:10px">
      <a href="${SITE.url}/admin/digest">관리자에서 자세히 보기</a>
    </p>
  </div>`;

  const ok = await sendEmail(to, "[경인블루저널] 주간 운영 리포트", html);
  return Response.json({ sent: ok ? 1 : 0 });
}
