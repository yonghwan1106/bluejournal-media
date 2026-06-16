import { requireAdmin } from "@/lib/auth";
import { dbConfigured } from "@/lib/admin-db";
import { NoDbNotice } from "@/components/admin/NoDbNotice";
import { ArticleForm } from "@/components/admin/ArticleForm";
import { createArticleAction } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "새 기사" };

export default async function NewArticlePage() {
  await requireAdmin();
  if (!dbConfigured()) return <NoDbNotice />;
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-extrabold">새 기사 작성</h1>
      <ArticleForm action={createArticleAction} />
    </div>
  );
}
