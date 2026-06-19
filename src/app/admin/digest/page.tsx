import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { dbConfigured, weeklyDigest, statsTopArticles, listOpenScans } from "@/lib/admin-db";
import { NoDbNotice } from "@/components/admin/NoDbNotice";

export const dynamic = "force-dynamic";
export const metadata = { title: "주간 다이제스트" };

function Card({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-line p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-2xl font-extrabold">{value.toLocaleString()}</div>
    </div>
  );
}

export default async function DigestPage() {
  await requireAdmin();
  if (!dbConfigured()) return <NoDbNotice />;
  const [d, top, scans] = await Promise.all([
    weeklyDigest(),
    statsTopArticles(7, 5),
    listOpenScans(),
  ]);
  const broken = scans.filter((s) => s.kind === "broken_image").length;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">📋 주간 다이제스트</h1>
        <Link href="/admin" className="rounded-md border border-line px-4 py-2 text-sm font-bold text-muted hover:text-ink">
          ← 기사 관리
        </Link>
      </div>
      <p className="mt-2 text-sm text-muted">최근 7일 운영 요약입니다. 매주 월요일 아침 이메일로도 발송됩니다(Resend 설정 시).</p>

      <div className="mt-5 grid grid-cols-3 gap-3">
        <Card label="발행 (7일)" value={d.published7} />
        <Card label="페이지뷰" value={d.pv7} />
        <Card label="순방문자" value={d.uv7} />
      </div>

      <section className="mt-6 rounded-lg border border-line p-4">
        <h2 className="mb-2 text-sm font-bold">🔥 인기 기사 (7일)</h2>
        {top.length === 0 ? (
          <p className="text-sm text-muted">데이터가 아직 없습니다.</p>
        ) : (
          <ol className="space-y-1 text-sm">
            {top.map((t, i) => (
              <li key={t.id} className="flex items-center justify-between gap-3">
                <Link href={`/admin/articles/${t.id}/edit`} className="truncate hover:text-brand">
                  <span className="mr-1 text-muted">{i + 1}.</span>
                  {t.title}
                </Link>
                <span className="shrink-0 font-semibold">{t.views.toLocaleString()}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="mt-4 rounded-lg border border-line p-4">
        <h2 className="mb-2 text-sm font-bold">⚠️ 손봐야 할 것</h2>
        <p className="text-sm">
          깨진 이미지 <strong className={broken > 0 ? "text-accent" : ""}>{broken}</strong>건
          {broken > 0 && (
            <Link href="/admin/health" className="ml-2 text-brand hover:underline">확인 →</Link>
          )}
        </p>
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-bold">📥 내보내기 (CSV)</h2>
        <div className="flex flex-wrap gap-2">
          <a href="/api/admin/export?type=articles" className="rounded-md border border-line px-3 py-1.5 text-sm hover:border-brand">
            기사 전체 CSV
          </a>
          <a href="/api/admin/export?type=stats" className="rounded-md border border-line px-3 py-1.5 text-sm hover:border-brand">
            일별 통계 CSV
          </a>
        </div>
      </section>
    </div>
  );
}
