import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin, canPublish, canEditArticle } from "@/lib/auth";
import { dbConfigured, adminGetArticle, listRevisions } from "@/lib/admin-db";
import { NoDbNotice } from "@/components/admin/NoDbNotice";
import { ArticleForm } from "@/components/admin/ArticleForm";
import { Toast } from "@/components/admin/Toast";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { formatDateTime } from "@/lib/format";
import {
  updateArticleAction,
  deleteArticleAction,
  restoreRevisionAction,
} from "../../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "기사 편집" };

const ERR: Record<string, string> = {
  title: "제목을 입력하세요.",
  save: "저장 중 오류가 발생했습니다.",
  delete: "삭제 중 오류가 발생했습니다.",
};

export default async function EditArticlePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const session = await requireAdmin();
  if (!dbConfigured()) return <NoDbNotice />;

  const { id } = await params;
  const sp = await searchParams;
  const a = await adminGetArticle(Number(id));
  if (!a) notFound();
  if (!canEditArticle(session, a.authorId)) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center text-muted">
        이 기사를 수정할 권한이 없습니다. (기자는 본인이 작성한 기사만 수정할 수 있습니다.)
        <div className="mt-4">
          <Link href="/admin" className="text-brand hover:underline">
            ← 기사 관리로
          </Link>
        </div>
      </div>
    );
  }
  const revisions = await listRevisions(a.id);

  const update = updateArticleAction.bind(null, a.id);
  const del = deleteArticleAction.bind(null, a.id);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {sp.saved && <Toast message="저장되었습니다." />}
      {sp.error && (
        <Toast type="error" message={ERR[sp.error] ?? "오류가 발생했습니다."} />
      )}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">기사 편집 #{a.id}</h1>
        {a.status === "published" ? (
          <Link
            href={`/news/${a.id}`}
            target="_blank"
            className="text-sm text-brand"
          >
            미리보기 ↗
          </Link>
        ) : (
          <span className="text-sm text-muted">미게시(공개 미리보기 불가)</span>
        )}
      </div>
      <ArticleForm article={a} action={update} canPublish={canPublish(session)} />

      {revisions.length > 0 && (
        <section className="mt-10 border-t border-line pt-6">
          <h2 className="mb-3 text-sm font-bold text-ink">
            수정 이력 ({revisions.length})
          </h2>
          <ul className="space-y-2 text-sm">
            {revisions.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 border-b border-line pb-2"
              >
                <span className="truncate text-muted">
                  {formatDateTime(
                    r.createdAt ? new Date(r.createdAt).toISOString() : null,
                  )}
                  {" · "}
                  {r.title}
                </span>
                <form action={restoreRevisionAction}>
                  <input type="hidden" name="articleId" value={a.id} />
                  <input type="hidden" name="revId" value={r.id} />
                  <ConfirmButton
                    message="이 버전으로 되돌립니다. 현재 내용도 이력에 저장됩니다. 계속할까요?"
                    className="shrink-0 rounded-md border border-brand px-2 py-1 text-xs font-medium text-brand hover:bg-brand-light"
                  >
                    되돌리기
                  </ConfirmButton>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <form action={del} className="mt-10 border-t border-line pt-4">
        <button className="text-sm text-accent hover:underline">
          이 기사 삭제
        </button>
      </form>
    </div>
  );
}
