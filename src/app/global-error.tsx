"use client";

/**
 * 루트 레이아웃까지 실패하는 최상위 에러 경계. root layout 을 대체하므로
 * 자체 <html>/<body> 를 렌더해야 하며, globals.css 가 로드되지 않을 수 있어
 * 인라인 스타일로 최소 UI 만 제공한다.
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ko">
      <body
        style={{
          fontFamily: "system-ui, -apple-system, sans-serif",
          display: "flex",
          minHeight: "100vh",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          margin: 0,
          padding: "0 1rem",
          textAlign: "center",
          color: "#1a1a1a",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", fontWeight: 800, margin: 0 }}>
          오류가 발생했습니다
        </h1>
        <p style={{ marginTop: "0.75rem", color: "#666" }}>
          페이지를 표시할 수 없습니다. 잠시 후 다시 시도해 주세요.
        </p>
        <button
          onClick={reset}
          style={{
            marginTop: "1.5rem",
            borderRadius: "0.375rem",
            background: "#1d4ed8",
            color: "#fff",
            border: "none",
            padding: "0.5rem 1rem",
            fontSize: "0.875rem",
            cursor: "pointer",
          }}
        >
          다시 시도
        </button>
      </body>
    </html>
  );
}
