"use client";

import { useEffect, useState } from "react";

/**
 * 관리자 작업 결과 토스트. 서버 페이지가 searchParams(?saved·?error·?deleted)를 읽어
 * message/type 을 내려주면, 우상단에 잠깐 떴다가 자동으로 사라진다.
 */
export function Toast({
  message,
  type = "success",
}: {
  message: string;
  type?: "success" | "error";
}) {
  const [show, setShow] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setShow(false), 3500);
    return () => clearTimeout(t);
  }, []);

  if (!show || !message) return null;

  const color = type === "error" ? "bg-accent" : "bg-green-600";
  return (
    <div
      role="status"
      className={`fixed right-4 top-4 z-50 max-w-xs rounded-md ${color} px-4 py-3 text-sm font-medium text-white shadow-lg`}
    >
      {message}
    </div>
  );
}
