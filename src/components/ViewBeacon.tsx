"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * 전역 방문 비콘. 공용 레이아웃에 1개 배치 → 모든 공개 페이지(홈/섹션/지역/기사)에서
 * 경로 이동 시 1회 POST /api/view{path, referrer}. 세션·경로당 1회(새로고침 중복 완화).
 * 관리자 경로는 전송하지 않는다. 서버에서 봇·경로 필터 + 익명 집계.
 */
export function ViewBeacon() {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname || pathname.startsWith("/admin")) return;
    const key = `bj_pv_${pathname}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      /* sessionStorage 불가 환경은 무시 */
    }
    fetch("/api/view", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: pathname, referrer: document.referrer || "" }),
      keepalive: true,
    }).catch(() => {});
  }, [pathname]);
  return null;
}
