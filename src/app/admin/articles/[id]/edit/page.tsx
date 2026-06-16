import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { dbConfigured, adminGetArticle } from "@/lib/admin-db";
import { NoDbNotice } from "@/components/admin/NoDbNotice";
import { ArticleForm } from "@/components/admin/ArticleForm";
import { updateArticleAction, deleteArticleAction } from "../../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "기사 편집" };

export default async function EditArticlePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  await requireAdmin();
  if (!dbConfigured()) return <NoDbNotice />;

  const { id } = await params;
  const sp = await searchParams;
  const a = await adminGetArticle(Number(id));
  if (!a) notFound();

  const update = updateArticleAction.bind(null, a.id);
  const del = deleteArticleAction.bind(null, a.id);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">기사 편집 #{a.id}</h1>
        <Link href={`/news/${a.id}`} target="_blank" className="text-sm text-brand">
          미리보기 ↗
        </Link>
      </div>
      {sp.saved && (
        <p className="mb-4 rounded bg-green-50 p-2 text-sm text-green-700">
          저장되었습니다.
        </p>
      )}
      <ArticleForm article={a} action={update} />
      <form action={del} className="mt-10 border-t border-line pt-4">
        <button className="text-sm text-accent hover:underline">
          이 기사 삭제
        </button>
      </form>
    </div>
  );
}
