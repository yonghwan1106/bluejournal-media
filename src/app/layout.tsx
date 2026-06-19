import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ViewBeacon } from "@/components/ViewBeacon";
import { SITE } from "@/lib/site";

// 프리뷰(vercel.app) 색인 방지 — 본 도메인 컷오버 시 NEXT_PUBLIC_ALLOW_INDEX=true 로 색인 허용
const allowIndex = process.env.NEXT_PUBLIC_ALLOW_INDEX === "true";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: `${SITE.name} | 경기 지역 정론지`,
    template: `%s | ${SITE.name}`,
  },
  description: SITE.description,
  keywords: ["경인블루저널", "수원", "용인", "경기", "지역신문", "인터넷신문"],
  openGraph: {
    siteName: SITE.name,
    type: "website",
    locale: "ko_KR",
    url: SITE.url,
  },
  robots: { index: allowIndex, follow: allowIndex },
  // 네이버 서치어드바이저 사이트 소유확인 (HTML 태그 방식)
  verification: {
    other: { "naver-site-verification": "78b7ca18a929d402763aa298cc0056dbd6f7def6" },
  },
  // RSS 자동발견(브라우저·수집기가 피드를 찾도록)
  alternates: {
    types: { "application/rss+xml": "/rss.xml" },
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className="h-full">
      <body className="flex min-h-full flex-col antialiased">
        <ViewBeacon />
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
