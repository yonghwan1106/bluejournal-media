import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import {
  dbConfigured,
  adminListArticles,
  adminStats,
  type ArticleStatus,
} from "@/lib/admin-db";
import { NoDbNotice } from "@/components/admin/NoDbNotice";
import { Toast } from "@/components/admin/Toast";
import { logoutAction, setStatusAction } from "./actions";
import { formatDate } from "@/lib/format";
import { SECTIONS, REGIONS } from "@/lib/articles";

export const dynamic = "force-dynamic";
export const metadata = { title: "관리자" };

const STATUS_LABEL: Record<string, string> = {
  published: "출력중",
  draft: "대기",
  hidden: "숨김",
};
const STATUS_BADGE: Record<string, string> = {
  published: "bg-green-50 text-green-700",
  draft: "bg-amber-50 text-amber-700",
  hidden: "bg-gray-100 text-gray-500",
};
const VALID_STATUS = ["published", "draft", "hidden"];

function buildQs(p: {
  q?: string;
  status?: string;
  section?: string;
  region?: string;
  page?: number;
}): string {
  const u = new URLSearchParams();
  if (p.q) u.set("q", p.q);
  if (p.status) u.set("status", p.status);
  if (p.section) u.set("section", p.section);
  if (p.region) u.set("region", p.region);
  if (p.page && p.page > 1) u.set("page", String(p.page));
  const s = u.toString();
  return s ? `/admin?${s}` : "/admin";
}

export default async function AdminHome({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    section?: string;
    region?: string;
    page?: string;
    deleted?: string;
  }>;
}) {
  await requireAdmin();
  if (!dbConfigured()) return <NoDbNotice />;

  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const status = (VALID_STATUS.includes(sp.status ?? "") ? sp.status : "") as
    | ArticleStatus
    | "";
  const section = SECTIONS.includes((sp.section ?? "") as never) ? sp.section! : "";
  const region = REGIONS.includes((sp.region ?? "") as never) ? sp.region! : "";

  const [{ rows, total, page, pages }, stats] = await Promise.all([
    adminListArticles({ q, status, section, region, page: Number(sp.page) || 1 }),
    adminStats(),
  ]);

  const filter = { q, status, section, region };
  const returnTo = buildQs({ ...filter, page });

  const cards = [
    { label: "전체", value: stats.total, key: "" },
    { label: "출력중", value: stats.published, key: "published" },
    { label: "대기", value: stats.draft, key: "draft" },
    { label: "숨김", value: stats.hidden, key: "hidden" },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {sp.deleted && <Toast message="기사를 삭제했습니다." />}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">기사 관리</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/articles/new"
            className="rounded-md bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-dark"
          >
            + 새 기사
          </Link>
          <form action={logoutAction}>
            <button className="rounded-md border border-line px-4 py-2 text-sm font-bold text-muted hover:text-ink">
              로그아웃
            </button>
          </form>
        </div>
      </div>

      {/* 통계 카드 (클릭 시 상태별 필터) */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={buildQs({ ...filter, status: c.key, page: 1 })}
            className={`rounded-lg border p-4 transition hover:border-brand ${
              status === c.key ? "border-brand bg-brand-light" : "border-line"
            }`}
          >
            <div className="text-xs text-muted">{c.label}</div>
            <div className="mt-1 text-2xl font-extrabold">{c.value}</div>
          </Link>
        ))}
      </div>

      {/* 검색 + 필터 */}
      <form method="GET" action="/admin" className="mt-6 flex flex-wrap items-center gap-2">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="제목 검색"
          className="min-w-[180px] flex-1 rounded-md border border-line px-3 py-2 text-sm"
        />
        <select name="status" defaultValue={status} className="rounded-md border border-line px-2 py-2 text-sm">
          <option value="">상태 전체</option>
          <option value="published">출력중</option>
          <option value="draft">대기</option>
          <option value="hidden">숨김</option>
        </select>
        <select name="section" defaultValue={section} className="rounded-md border border-line px-2 py-2 text-sm">
          <option value="">섹션 전체</option>
          {SECTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select name="region" defaultValue={region} className="rounded-md border border-line px-2 py-2 text-sm">
          <option value="">지역 전체</option>
          {REGIONS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <button className="rounded-md bg-ink px-4 py-2 text-sm font-bold text-white hover:opacity-90">
          검색
        </button>
        {(q || status || section || region) && (
          <Link href="/admin" className="px-2 py-2 text-sm text-muted hover:text-ink">
            초기화
          </Link>
        )}
      </form>

      <p className="mt-4 text-sm text-muted">
        총 <strong className="text-ink">{total}</strong>건
        {(q || status || section || region) && " (필터 적용됨)"}
      </p>

      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-line text-left text-muted">
              <th className="px-2 py-2">#</th>
              <th className="px-2 py-2">제목</th>
              <th className="px-2 py-2">섹션·지역</th>
              <th className="px-2 py-2">상태</th>
              <th className="px-2 py-2">등록일</th>
              <th className="px-2 py-2 text-right">작업</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-2 py-10 text-center text-muted">
                  조건에 맞는 기사가 없습니다.
                </td>
              </tr>
            )}
            {rows.map((a) => (
              <tr key={a.id} className="border-b border-line hover:bg-[#f7f8fa]">
                <td className="px-2 py-2 text-muted">{a.id}</td>
                <td className="px-2 py-2">
                  <Link
                    href={`/admin/articles/${a.id}/edit`}
                    className="font-medium hover:text-brand"
                  >
                    {a.title}
                  </Link>
                </td>
                <td className="px-2 py-2 text-muted">
                  {a.section}
                  {a.region ? ` · ${a.region}` : ""}
                </td>
                <td className="px-2 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      STATUS_BADGE[a.status] ?? ""
                    }`}
                  >
                    {STATUS_LABEL[a.status] ?? a.status}
                  </span>
                </td>
                <td className="px-2 py-2 text-muted">
                  {formatDate(a.publishedAt ? new Date(a.publishedAt).toISOString() : null)}
                </td>
                <td className="px-2 py-2">
                  <div className="flex items-center justify-end gap-3">
                    <form action={setStatusAction}>
                      <input type="hidden" name="id" value={a.id} />
                      <input
                        type="hidden"
                        name="status"
                        value={a.status === "published" ? "draft" : "published"}
                      />
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <button
                        className={`rounded-md border px-2 py-1 text-xs font-medium ${
                          a.status === "published"
                            ? "border-line text-muted hover:text-ink"
                            : "border-brand text-brand hover:bg-brand-light"
                        }`}
                      >
                        {a.status === "published" ? "숨기기" : "발행"}
                      </button>
                    </form>
                    <Link
                      href={`/admin/articles/${a.id}/edit`}
                      className="text-brand hover:underline"
                    >
                      편집
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 */}
      {pages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-4 text-sm">
          {page > 1 ? (
            <Link href={buildQs({ ...filter, page: page - 1 })} className="rounded-md border border-line px-3 py-1.5 hover:border-brand">
              ← 이전
            </Link>
          ) : (
            <span className="rounded-md border border-line px-3 py-1.5 text-muted opacity-40">← 이전</span>
          )}
          <span className="text-muted">
            {page} / {pages} 페이지
          </span>
          {page < pages ? (
            <Link href={buildQs({ ...filter, page: page + 1 })} className="rounded-md border border-line px-3 py-1.5 hover:border-brand">
              다음 →
            </Link>
          ) : (
            <span className="rounded-md border border-line px-3 py-1.5 text-muted opacity-40">다음 →</span>
          )}
        </div>
      )}
    </div>
  );
}
