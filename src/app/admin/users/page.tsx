import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { dbConfigured, listUsers } from "@/lib/admin-db";
import { NoDbNotice } from "@/components/admin/NoDbNotice";
import { Toast } from "@/components/admin/Toast";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { createUserAction, deleteUserAction } from "../actions";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "계정 관리" };

const ROLE_LABEL: Record<string, string> = {
  admin: "관리자",
  editor: "편집장",
  reporter: "기자",
};
const UERR: Record<string, string> = {
  invalid: "아이디·이름·비밀번호(6자 이상)를 확인하세요.",
  dup: "이미 존재하는 아이디이거나 생성에 실패했습니다.",
};
const field =
  "w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-brand";

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; error?: string }>;
}) {
  await requireRole(["admin"]);
  if (!dbConfigured()) return <NoDbNotice />;
  const sp = await searchParams;
  const list = await listUsers();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {sp.created && <Toast message="계정을 생성했습니다." />}
      {sp.error && <Toast type="error" message={UERR[sp.error] ?? "오류가 발생했습니다."} />}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">계정 관리</h1>
        <Link
          href="/admin"
          className="rounded-md border border-line px-4 py-2 text-sm font-bold text-muted hover:text-ink"
        >
          ← 기사 관리
        </Link>
      </div>

      <p className="mt-2 text-sm text-muted">
        기자(reporter)는 초안만 작성하고, 발행은 편집장·관리자가 합니다. 기자는 본인 작성 기사만 수정할 수 있습니다.
      </p>

      <form
        action={createUserAction}
        className="mt-6 grid gap-3 rounded-lg border border-line p-4 sm:grid-cols-2"
      >
        <div>
          <label className="mb-1 block text-xs font-bold">아이디 *</label>
          <input name="username" required className={field} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold">이름 *</label>
          <input name="name" required className={field} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold">비밀번호 * (6자 이상)</label>
          <input name="password" type="password" required minLength={6} className={field} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold">이메일 (선택)</label>
          <input name="email" type="email" className={field} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold">역할</label>
          <select name="role" defaultValue="reporter" className={field}>
            <option value="reporter">기자</option>
            <option value="editor">편집장</option>
            <option value="admin">관리자</option>
          </select>
        </div>
        <div className="flex items-end">
          <button className="rounded-md bg-brand px-5 py-2 text-sm font-bold text-white hover:bg-brand-dark">
            계정 생성
          </button>
        </div>
      </form>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-line text-left text-muted">
              <th className="px-2 py-2">아이디</th>
              <th className="px-2 py-2">이름</th>
              <th className="px-2 py-2">역할</th>
              <th className="px-2 py-2">생성일</th>
              <th className="px-2 py-2 text-right">작업</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr>
                <td colSpan={5} className="px-2 py-10 text-center text-muted">
                  아직 계정이 없습니다. 위에서 추가하세요. (슈퍼관리자 env 계정은 항상 로그인 가능)
                </td>
              </tr>
            )}
            {list.map((u) => (
              <tr key={u.id} className="border-b border-line hover:bg-[#f7f8fa]">
                <td className="px-2 py-2 font-medium">{u.username}</td>
                <td className="px-2 py-2">{u.name}</td>
                <td className="px-2 py-2">{ROLE_LABEL[u.role] ?? u.role}</td>
                <td className="px-2 py-2 text-muted">
                  {formatDate(u.createdAt ? new Date(u.createdAt).toISOString() : null)}
                </td>
                <td className="px-2 py-2 text-right">
                  <form action={deleteUserAction}>
                    <input type="hidden" name="id" value={u.id} />
                    <ConfirmButton
                      message={`"${u.username}" 계정을 삭제합니다. 계속할까요?`}
                      className="rounded-md border border-accent px-2 py-1 text-xs font-medium text-accent hover:bg-red-50"
                    >
                      삭제
                    </ConfirmButton>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
