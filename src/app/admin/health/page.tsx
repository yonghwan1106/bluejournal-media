import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { dbConfigured, cronHealth } from "@/lib/admin-db";
import { NoDbNotice } from "@/components/admin/NoDbNotice";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "수집 현황" };

type Row = Awaited<ReturnType<typeof cronHealth>>[number];

function signal(last: Row): { c: string; t: string } {
  const ageH = last.runAt ? (Date.now() - new Date(last.runAt).getTime()) / 3.6e6 : 999;
  if (last.errorText) return { c: "bg-red-500", t: "오류" };
  if (ageH > 36) return { c: "bg-gray-300", t: "무응답" };
  if (last.published === 0) return { c: "bg-amber-400", t: "0건" };
  return { c: "bg-green-500", t: "정상" };
}

export default async function HealthPage() {
  await requireAdmin();
  if (!dbConfigured()) return <NoDbNotice />;
  const rows = await cronHealth();

  // 기관별 그룹: 최신 실행(rows는 최신순) + 최근 7일 발행 합계
  const map = new Map<string, { last: Row; pub7: number; runs: number }>();
  for (const r of rows) {
    const g = map.get(r.agency);
    if (!g) map.set(r.agency, { last: r, pub7: r.published, runs: 1 });
    else {
      g.pub7 += r.published;
      g.runs++;
    }
  }
  const agencies = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "ko"));
  const okCount = agencies.filter(([, g]) => signal(g.last).t === "정상").length;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">🩺 자동수집 현황</h1>
        <Link href="/admin" className="rounded-md border border-line px-4 py-2 text-sm font-bold text-muted hover:text-ink">
          ← 기사 관리
        </Link>
      </div>

      {agencies.length === 0 ? (
        <p className="mt-8 rounded-md bg-amber-50 p-4 text-sm text-amber-800">
          아직 수집 기록이 없습니다. 다음 자동수집(매일 새벽) 실행 후 기관별 현황이 표시됩니다.
        </p>
      ) : (
        <>
          <p className="mt-4 text-sm text-muted">
            최근 7일 기준 · 정상 <strong className="text-ink">{okCount}</strong> / 전체{" "}
            <strong className="text-ink">{agencies.length}</strong> 기관
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-line text-left text-muted">
                  <th className="px-2 py-2">상태</th>
                  <th className="px-2 py-2">기관</th>
                  <th className="px-2 py-2 text-right">최근 발행</th>
                  <th className="px-2 py-2 text-right">7일 누적</th>
                  <th className="px-2 py-2">마지막 실행</th>
                  <th className="px-2 py-2">비고</th>
                </tr>
              </thead>
              <tbody>
                {agencies.map(([agency, g]) => {
                  const s = signal(g.last);
                  return (
                    <tr key={agency} className="border-b border-line hover:bg-[#f7f8fa]">
                      <td className="px-2 py-2">
                        <span className="inline-flex items-center gap-1.5">
                          <span className={`h-2.5 w-2.5 rounded-full ${s.c}`} />
                          {s.t}
                        </span>
                      </td>
                      <td className="px-2 py-2 font-medium">{agency}</td>
                      <td className="px-2 py-2 text-right">{g.last.published}</td>
                      <td className="px-2 py-2 text-right text-muted">{g.pub7}</td>
                      <td className="px-2 py-2 text-muted">
                        {g.last.runAt ? formatDateTime(new Date(g.last.runAt).toISOString()) : "—"}
                      </td>
                      <td className="px-2 py-2 text-xs text-accent">{g.last.errorText ?? ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="mt-6 text-xs text-muted">
        🟢 정상 발행 · 🟡 수집됐으나 0건(당일 자료 없음일 수 있음) · 🔴 스캔 오류(사이트 변경·차단 가능) · ⚪ 36시간+ 무응답. 자동수집은 매일 새벽 실행됩니다.
      </p>
    </div>
  );
}
