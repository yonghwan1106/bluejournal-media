import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 홈 디렉터리의 다른 package.json 을 워크스페이스 루트로 오인하지 않도록 명시
  turbopack: { root: import.meta.dirname },
  // 본문/썸네일은 외부 다양한 출처(정부기관 등)를 포함하므로 next/image 최적화 대신
  // 일반 <img>로 서빙(프리뷰 단계). R2 전환 후 알려진 도메인만 최적화 적용 예정.
  async redirects() {
    return [
      // 레거시 그누보드 기사 URL → 클린 URL (정수 wr_id 보존, 301)
      {
        source: "/bbs/board.php",
        has: [
          { type: "query", key: "bo_table", value: "news" },
          { type: "query", key: "wr_id", value: "(?<id>\\d+)" },
        ],
        destination: "/news/:id",
        permanent: true,
      },
      // print 등 부가 레거시 → 기사 본문으로
      {
        source: "/bbs/print.php",
        has: [{ type: "query", key: "wr_id", value: "(?<id>\\d+)" }],
        destination: "/news/:id",
        permanent: true,
      },
    ];
  },
  // 전역 보안 응답 헤더. 엄격 CSP 는 Next 하이드레이션 nonce 배선 + 라이브 검증이
  // 필요해 후속 과제로 분리(저장형 XSS 는 본문 새니타이즈로 1차 차단됨).
  async headers() {
    const isProd = process.env.NODE_ENV === "production";
    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-DNS-Prefetch-Control", value: "on" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=()",
      },
      // HSTS 는 https 환경에서만 의미 → 운영(프리뷰 vercel.app 포함 https)에서만 적용.
      ...(isProd
        ? [
            {
              key: "Strict-Transport-Security",
              value: "max-age=31536000; includeSubDomains",
            },
          ]
        : []),
    ];
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
