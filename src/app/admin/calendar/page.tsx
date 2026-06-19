import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { dbConfigured, listScheduled, calendarMonth } from "@/lib/admin-db";
import { NoDbNotice } from "@/components/admin/NoDbNotice";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "발행 캘린더" };

const DOW = ["일", "월", "화", "수", "목", "금", "토"];

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string }>;
}) {
  await requireAdmin();
  if (!dbConfigured()) return <NoDbNotice />;
  const sp = await searchParams;

  const nowKst = new Date(Date.now() + 9 * 3600 * 1000);
  let year = nowKst.getUTCFullYear();
  let month = nowKst.getUTCMonth() + 1;
  if (sp.ym && /^\d{4}-\d{2}$/.test(sp.ym)) {
    const [y, m] = sp.ym.split("-").map(Number);
    if (m >= 1 && m <= 12) {
      year = y;
      month = m;
    }
  }

  const [rows, scheduled] = await Promise.all([calendarMonth(year, month), listScheduled()]);

  const byDay = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const g = byDay.get(r.day) ?? {};
    g[r.status] = (g[r.status] ?? 0) + 1;
    byDay.set(r.day, g);
  }

  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const ymStr = `${year}-${String(month).padStart(2, "0")}`;
  const prev = month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
  const next = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
  const navCls = "rounded-md border border-line px-3 py-1 text-sm hover:border-brand";

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">🗓 발행 캘린더</h1>
        <Link href="/admin" className="rounded-md border border-line px-4 py-2 text-sm font-bold text-muted hover:text-ink">
          ← 기사 관리
        </Link>
      </div>

      <div className="mt-5 flex items-center justify-center gap-4">
        <Link href={`/admin/calendar?ym=${prev}`} className={navCls}>← 이전달</Link>
        <span className="font-extrabold">{year}년 {month}월</span>
        <Link href={`/admin/calendar?ym=${next}`} className={navCls}>다음달 →</Link>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-1 text-xs">
        {DOW.map((d) => (
          <div key={d} className="py-1 text-center font-bold text-muted">{d}</div>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <div key={i} />;
          const key = `${ymStr}-${String(d).padStart(2, "0")}`;
          const g = byDay.get(key);
          return (
            <div key={i} className="min-h-[64px] rounded border border-line p-1">
              <div className="text-right text-muted">{d}</div>
              {g && (
                <div className="mt-0.5 space-y-0.5">
                  {(g.published ?? 0) > 0 && <div className="rounded bg-green-100 px-1 text-green-800">발행 {g.published}</div>}
                  {(g.scheduled ?? 0) > 0 && <div className="rounded bg-amber-100 px-1 text-amber-800">예약 {g.scheduled}</div>}
                  {(g.draft ?? 0) > 0 && <div className="rounded bg-gray-100 px-1 text-gray-600">대기 {g.draft}</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-bold">⏰ 예약된 기사 ({scheduled.length})</h2>
        {scheduled.length === 0 ? (
          <p className="text-sm text-muted">예약된 기사가 없습니다. 기사 편집에서 상태를 ‘예약발행’으로 두고 등록일시를 미래로 설정하세요.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {scheduled.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 border-b border-line pb-1.5">
                <Link href={`/admin/articles/${s.id}/edit`} className="truncate hover:text-brand">
                  {s.title}
                </Link>
                <span className="shrink-0 text-muted">
                  {formatDateTime(s.publishedAt ? new Date(s.publishedAt).toISOString() : null)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
