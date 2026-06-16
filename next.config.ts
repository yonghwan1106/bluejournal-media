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
};

export default nextConfig;
