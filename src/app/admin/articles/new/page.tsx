import { requireAdmin, canPublish } from "@/lib/auth";
import { dbConfigured, listSnippets } from "@/lib/admin-db";
import { NoDbNotice } from "@/components/admin/NoDbNotice";
import { ArticleForm } from "@/components/admin/ArticleForm";
import { Toast } from "@/components/admin/Toast";
import { createArticleAction } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "새 기사" };

const ERR: Record<string, string> = {
  title: "제목을 입력하세요.",
  save: "저장 중 오류가 발생했습니다.",
};

export default async function NewArticlePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requireAdmin();
  if (!dbConfigured()) return <NoDbNotice />;
  const sp = await searchParams;
  const snippets = await listSnippets();
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {sp.error && (
        <Toast type="error" message={ERR[sp.error] ?? "오류가 발생했습니다."} />
      )}
      <h1 className="mb-6 text-2xl font-extrabold">새 기사 작성</h1>
      <ArticleForm action={createArticleAction} canPublish={canPublish(session)} snippets={snippets} />
    </div>
  );
}
