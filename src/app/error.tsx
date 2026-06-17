"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * 라우트 세그먼트 에러 경계 — ISR 재생성 중 DB 오류(articles.ts rethrow) 등으로
 * 렌더가 실패해도 Next 기본 오류 화면 대신 사용자 친화 UI + 재시도를 제공.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center px-4 py-20 text-center">
      <h1 className="text-2xl font-extrabold text-ink">
        일시적인 오류가 발생했습니다
      </h1>
      <p className="mt-3 text-muted">
        페이지를 불러오는 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.
      </p>
      <div className="mt-6 flex gap-3">
        <button
          onClick={reset}
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
        >
          다시 시도
        </button>
        <Link
          href="/"
          className="rounded-md border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-[#f7f8fa]"
        >
          홈으로
        </Link>
      </div>
    </div>
  );
}
