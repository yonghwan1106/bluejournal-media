import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { dbConfigured, listSnippets } from "@/lib/admin-db";
import { NoDbNotice } from "@/components/admin/NoDbNotice";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { createSnippetAction, deleteSnippetAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "본문 스니펫" };

const field = "w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-brand";

export default async function SnippetsPage() {
  await requireRole(["admin", "editor"]);
  if (!dbConfigured()) return <NoDbNotice />;
  const rows = await listSnippets();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">🧩 본문 스니펫</h1>
        <Link href="/admin" className="rounded-md border border-line px-4 py-2 text-sm font-bold text-muted hover:text-ink">
          ← 기사 관리
        </Link>
      </div>
      <p className="mt-2 text-sm text-muted">
        기자 서명·제보 안내처럼 반복해서 쓰는 본문 조각을 저장해두고, 기사 편집기 툴바의 「🧩 스니펫」에서 한 번에 삽입합니다.
      </p>

      <form action={createSnippetAction} className="mt-5 space-y-3 rounded-lg border border-line p-4">
        <div>
          <label className="mb-1 block text-sm font-bold">이름</label>
          <input name="label" required placeholder="예: 기자 서명" className={field} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-bold">내용 (HTML 가능)</label>
          <textarea name="html" required rows={4} placeholder="예: <p>경인블루저널 ○○○ 기자</p>" className={field} />
        </div>
        <button className="rounded-md bg-brand px-5 py-2 text-sm font-bold text-white hover:bg-brand-dark">추가</button>
      </form>

      <div className="mt-6 space-y-2">
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">등록된 스니펫이 없습니다.</p>
        ) : (
          rows.map((s) => (
            <div key={s.id} className="flex items-start justify-between gap-3 rounded-md border border-line p-3">
              <div className="min-w-0">
                <div className="text-sm font-bold">{s.label}</div>
                <div className="mt-1 truncate text-xs text-muted">{s.html}</div>
              </div>
              <form action={deleteSnippetAction}>
                <input type="hidden" name="id" value={s.id} />
                <ConfirmButton
                  message={`"${s.label}" 스니펫을 삭제할까요?`}
                  className="shrink-0 rounded-md border border-accent px-2 py-1 text-xs font-medium text-accent hover:bg-red-50"
                >
                  삭제
                </ConfirmButton>
              </form>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
