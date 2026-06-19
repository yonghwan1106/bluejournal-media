// 뉴스레터 구독 신청. 이메일 받아 미확인 구독자 등록 + 더블옵트인 확인메일 발송.
import crypto from "node:crypto";
import { addSubscriber } from "@/lib/admin-db";
import { sendEmail } from "@/lib/email";
import { SITE } from "@/lib/site";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let email = "";
  let region: string | null = null;
  try {
    const b = await req.json();
    email = String(b?.email ?? "").trim().toLowerCase();
    region = b?.region ? String(b.region).slice(0, 50) : null;
  } catch {
    return Response.json({ error: "잘못된 요청" }, { status: 400 });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 255) {
    return Response.json({ error: "이메일 형식을 확인하세요." }, { status: 400 });
  }

  const token = crypto.randomBytes(24).toString("hex");
  try {
    await addSubscriber(email, region, token);
  } catch (e) {
    console.error("[subscribe] 등록 실패:", e);
    return Response.json({ error: "처리 중 오류가 발생했습니다." }, { status: 500 });
  }

  const url = `${SITE.url}/api/newsletter/confirm?token=${token}`;
  await sendEmail(
    email,
    "[경인블루저널] 뉴스레터 구독 확인",
    `<div style="font-family:sans-serif;max-width:520px">
      <h2 style="color:#0b4ea2">경인블루저널 뉴스레터</h2>
      <p>구독 신청해 주셔서 감사합니다. 아래 버튼을 눌러 구독을 확인해 주세요.</p>
      <p><a href="${url}" style="display:inline-block;padding:11px 22px;background:#0b4ea2;color:#fff;text-decoration:none;border-radius:6px">구독 확인하기</a></p>
      <p style="color:#888;font-size:12px">본인이 신청하지 않았다면 이 메일을 무시하세요.</p>
    </div>`,
  );
  return Response.json({ ok: true });
}
