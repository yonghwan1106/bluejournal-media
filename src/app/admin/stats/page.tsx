import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import {
  dbConfigured,
  statsSummary,
  statsTrend,
  statsTopArticles,
  statsReferrers,
  statsDevices,
  type StatUnit,
} from "@/lib/admin-db";
import { NoDbNotice } from "@/components/admin/NoDbNotice";
import { StatsChart } from "@/components/admin/StatsChart";

export const dynamic = "force-dynamic";
export const metadata = { title: "접속 통계" };

const VIEWS: Record<string, { unit: StatUnit; days: number; label: string; tab: string }> = {
  day: { unit: "day", days: 14, label: "최근 14일", tab: "일" },
  week: { unit: "week", days: 84, label: "최근 12주", tab: "주" },
  month: { unit: "month", days: 365, label: "최근 12개월", tab: "월" },
};

function delta(cur: number, prev: number): { txt: string; up: boolean } {
  if (prev === 0) return { txt: cur > 0 ? "신규" : "—", up: cur > 0 };
  const d = ((cur - prev) / prev) * 100;
  return { txt: `${d >= 0 ? "▲" : "▼"} ${Math.abs(d).toFixed(0)}%`, up: d >= 0 };
}

function Card({ label, value, d }: { label: string; value: number | string; d?: { txt: string; up: boolean } }) {
  return (
    <div className="rounded-lg border border-line p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-extrabold">{typeof value === "number" ? value.toLocaleString() : value}</span>
        {d && <span className={`text-xs font-bold ${d.up ? "text-green-600" : "text-accent"}`}>{d.txt}</span>}
      </div>
    </div>
  );
}

function Bar({ label, value, total }: { label: string; value: number; total: number }) {
  const p = Math.round((value / total) * 100);
  return (
    <div>
      <div className="mb-0.5 flex justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className="font-semibold">{value.toLocaleString()} ({p}%)</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[#eef0f3]">
        <div className="h-full rounded-full bg-brand" style={{ width: `${p}%` }} />
      </div>
    </div>
  );
}

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  await requireAdmin();
  if (!dbConfigured()) return <NoDbNotice />;
  const sp = await searchParams;
  const key = sp.view && VIEWS[sp.view] ? sp.view : "day";
  const { unit, days, label } = VIEWS[key];

  const [summary, trend, topArticles, referrers, devices] = await Promise.all([
    statsSummary(days),
    statsTrend(unit, days),
    statsTopArticles(days, 10),
    statsReferrers(days),
    statsDevices(days),
  ]);

  const refTotal = Object.values(referrers).reduce((a, b) => a + b, 0) || 1;
  const devTotal = devices.reduce((a, b) => a + b.count, 0) || 1;
  const mobile = devices.find((d) => d.device === "mobile")?.count ?? 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">📊 접속 통계</h1>
        <Link href="/admin" className="rounded-md border border-line px-4 py-2 text-sm font-bold text-muted hover:text-ink">
          ← 기사 관리
        </Link>
      </div>

      <div className="mt-5 inline-flex rounded-lg border border-line p-1 text-sm">
        {Object.entries(VIEWS).map(([k, v]) => (
          <Link
            key={k}
            href={`/admin/stats?view=${k}`}
            className={`rounded-md px-5 py-1.5 font-bold ${k === key ? "bg-brand text-white" : "text-muted hover:text-ink"}`}
          >
            {v.tab}
          </Link>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card label={`페이지뷰 (${label})`} value={summary.pv} d={delta(summary.pv, summary.prevPv)} />
        <Card label="순방문자 (UV)" value={summary.uv} d={delta(summary.uv, summary.prevUv)} />
        <Card label="모바일 비율" value={`${Math.round((mobile / devTotal) * 100)}%`} />
        <Card label="기사 조회(상위합)" value={topArticles.reduce((a, b) => a + b.views, 0)} />
      </div>

      <section className="mt-6 rounded-lg border border-line p-4">
        <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-muted">
          <span className="font-bold text-ink">{label} 추이</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-3 rounded-sm bg-brand opacity-80" /> 페이지뷰</span>
          <span className="inline-flex items-center gap-1"><span className="h-0.5 w-3 bg-accent" /> 순방문자</span>
        </div>
        <StatsChart data={trend} />
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-line p-4">
          <h2 className="mb-3 text-sm font-bold">🔥 인기 기사 ({label})</h2>
          {topArticles.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">아직 데이터가 없습니다.</p>
          ) : (
            <ol className="space-y-1.5 text-sm">
              {topArticles.map((t, i) => (
                <li key={t.id} className="flex items-center justify-between gap-3">
                  <Link href={`/admin/articles/${t.id}/edit`} className="truncate hover:text-brand">
                    <span className="mr-2 text-muted">{i + 1}.</span>
                    {t.title}
                  </Link>
                  <span className="shrink-0 font-semibold">{t.views.toLocaleString()}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <div className="space-y-6">
          <section className="rounded-lg border border-line p-4">
            <h2 className="mb-3 text-sm font-bold">유입경로</h2>
            <div className="space-y-2">
              {(["검색", "SNS", "직접", "기타"] as const).map((c) => (
                <Bar key={c} label={c} value={referrers[c]} total={refTotal} />
              ))}
            </div>
          </section>
          <section className="rounded-lg border border-line p-4">
            <h2 className="mb-3 text-sm font-bold">디바이스</h2>
            <div className="space-y-2">
              {devTotal <= 1 && devices.length === 0 ? (
                <p className="text-sm text-muted">데이터 없음</p>
              ) : (
                devices.map((d) => (
                  <Bar
                    key={d.device}
                    label={d.device === "mobile" ? "모바일" : d.device === "desktop" ? "데스크톱" : "기타"}
                    value={d.count}
                    total={devTotal}
                  />
                ))
              )}
            </div>
          </section>
        </div>
      </div>

      <p className="mt-6 text-xs text-muted">
        ※ 봇·크롤러는 자동 제외됩니다. IP·쿠키를 저장하지 않는 익명 집계라 실제 방문과 약간 차이가 있을 수 있으며, 방문이 쌓일수록 정확해집니다. 기존 누적 조회수와 별개로 이 시점부터 수집을 시작합니다.
      </p>
    </div>
  );
}
