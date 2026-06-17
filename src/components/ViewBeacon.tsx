"use client";

import { useEffect } from "react";

/** 공개 기사 페이지 마운트 시 조회수 1회 증가(세션당 1회 — 새로고침 중복 완화). */
export function ViewBeacon({ id }: { id: number }) {
  useEffect(() => {
    const key = `bj_viewed_${id}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      /* sessionStorage 불가 환경은 무시 */
    }
    fetch("/api/view", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
      keepalive: true,
    }).catch(() => {});
  }, [id]);
  return null;
}
