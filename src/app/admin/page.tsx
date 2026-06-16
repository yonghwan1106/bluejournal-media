import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { dbConfigured, adminListArticles } from "@/lib/admin-db";
import { NoDbNotice } from "@/components/admin/NoDbNotice";
import { logoutAction } from "./actions";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "관리자" };

const STATUS_LABEL: Record<string, string> = {
  published: "출력중",
  draft: "대기",
  hidden: "숨김",
};

export default async function AdminHome() {
  await requireAdmin();
  if (!dbConfigured()) return <NoDbNotice />;

  const list = await adminListArticles();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">기사 관리 ({list.length})</h1>
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

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-line text-left text-muted">
              <th className="px-2 py-2">#</th>
              <th className="px-2 py-2">제목</th>
              <th className="px-2 py-2">섹션</th>
              <th className="px-2 py-2">상태</th>
              <th className="px-2 py-2">등록일</th>
              <th className="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {list.map((a) => (
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
                  {a.region ?? a.section}
                </td>
                <td className="px-2 py-2">{STATUS_LABEL[a.status] ?? a.status}</td>
                <td className="px-2 py-2 text-muted">{formatDate(a.publishedAt ? new Date(a.publishedAt).toISOString() : null)}</td>
                <td className="px-2 py-2">
                  <Link href={`/admin/articles/${a.id}/edit`} className="text-brand">
                    편집
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
