import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { dbConfigured, subscriberStats } from "@/lib/admin-db";
import { emailConfigured } from "@/lib/email";
import { NoDbNotice } from "@/components/admin/NoDbNotice";

export const dynamic = "force-dynamic";
export const metadata = { title: "뉴스레터 구독자" };

export default async function SubscribersPage() {
  await requireRole(["admin", "editor"]);
  if (!dbConfigured()) return <NoDbNotice />;
  const stats = await subscriberStats();
  const mail = emailConfigured();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">📧 뉴스레터 구독자</h1>
        <Link href="/admin" className="rounded-md border border-line px-4 py-2 text-sm font-bold text-muted hover:text-ink">
          ← 기사 관리
        </Link>
      </div>

      {!mail && (
        <p className="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          ⚠️ <strong>RESEND_API_KEY 미설정</strong> — 구독 수집은 되지만 확인메일·주간발송은 키 설정 후 작동합니다. (무료: resend.com 가입 → 도메인 인증 → 키를 Vercel 환경변수에 추가)
        </p>
      )}

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-line p-4">
          <div className="text-xs text-muted">확인된 구독자</div>
          <div className="mt-1 text-2xl font-extrabold">{stats.confirmed.toLocaleString()}</div>
        </div>
        <div className="rounded-lg border border-line p-4">
          <div className="text-xs text-muted">확인 대기</div>
          <div className="mt-1 text-2xl font-extrabold">{stats.pending.toLocaleString()}</div>
        </div>
      </div>

      <p className="mt-5 text-xs text-muted">
        주간 뉴스레터는 매주 목요일 저녁 자동 발송됩니다(확인된 구독자 대상). 구독 폼은 사이트 푸터에 있으며, 개인정보는 이메일만 수집하고 원클릭 수신거부를 제공합니다.
      </p>
    </div>
  );
}
