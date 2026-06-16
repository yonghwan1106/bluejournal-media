import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { loginAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "관리자 로그인" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  if (await getSession()) redirect("/admin");

  return (
    <div className="mx-auto max-w-sm px-4 py-20">
      <h1 className="text-center text-2xl font-extrabold text-brand">
        경인블루저널 관리자
      </h1>
      {sp.error && (
        <p className="mt-4 rounded bg-red-50 p-2 text-center text-sm text-accent">
          아이디 또는 비밀번호가 올바르지 않습니다.
        </p>
      )}
      <form action={loginAction} className="mt-6 space-y-3">
        <input
          name="username"
          placeholder="아이디"
          defaultValue="admin"
          className="w-full rounded-md border border-line px-3 py-2.5 outline-none focus:border-brand"
        />
        <input
          name="password"
          type="password"
          placeholder="비밀번호"
          required
          className="w-full rounded-md border border-line px-3 py-2.5 outline-none focus:border-brand"
        />
        <button
          type="submit"
          className="w-full rounded-md bg-brand py-2.5 font-bold text-white hover:bg-brand-dark"
        >
          로그인
        </button>
      </form>
    </div>
  );
}
