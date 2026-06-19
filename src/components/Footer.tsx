import Link from "next/link";
import { SITE } from "@/lib/site";
import { SubscribeForm } from "@/components/SubscribeForm";

export function Footer() {
  return (
    <footer className="mt-16 border-t border-line bg-[#f7f8fa]">
      <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-muted">
        <div className="mb-6 rounded-lg border border-line bg-white p-4 sm:max-w-md">
          <div className="text-sm font-bold text-ink">📧 경인블루저널 뉴스레터</div>
          <p className="mb-2 mt-1 text-xs">매주 경기·인천 주요 소식을 메일로 받아보세요.</p>
          <SubscribeForm />
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2 pb-5 text-xs font-medium text-ink">
          <Link href="/about" className="hover:text-brand">
            회사소개
          </Link>
          <Link href="/ethics" className="hover:text-brand">
            윤리강령
          </Link>
          <Link href="/youth" className="hover:text-brand">
            청소년보호정책
          </Link>
          <Link href="/privacy" className="hover:text-brand">
            개인정보처리방침
          </Link>
          <Link href="/contact" className="hover:text-brand">
            기사제보·광고문의
          </Link>
        </div>

        <div className="text-lg font-extrabold text-brand">경인블루저널</div>

        <dl className="mt-3 space-y-1 leading-relaxed">
          <div>
            등록번호 {SITE.registerNo} · 등록일 {SITE.founded} · 발행·편집인{" "}
            {SITE.publisher}
          </div>
          <div>
            청소년보호책임자 {SITE.youthOfficer} · 사업자등록번호 {SITE.bizNo}
          </div>
          <div>{SITE.address}</div>
          <div>
            대표전화 {SITE.tel}, {SITE.mobile} · 이메일 {SITE.email}
          </div>
        </dl>

        <p className="mt-5 text-xs text-muted">
          © {new Date().getFullYear()} 경인블루저널. All rights reserved. 본지의
          모든 콘텐츠(기사)는 저작권법의 보호를 받습니다.
        </p>
      </div>
    </footer>
  );
}
