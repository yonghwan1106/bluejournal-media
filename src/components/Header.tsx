import Link from "next/link";
import { NAV, SITE } from "@/lib/site";

export function Header() {
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur">
      <div className="border-b border-line">
        <div className="mx-auto flex h-9 max-w-6xl items-center justify-between px-4 text-xs text-muted">
          <span className="hidden truncate sm:inline">{SITE.slogan}</span>
          {/* -my-2 로 36px 바 높이를 꽉 채우는 탭 타깃 확보(모바일에서 소개/기사제보/로그인 오탭 방지) */}
          <nav className="-my-2 flex gap-1">
            <Link
              href="/about"
              className="inline-flex items-center px-1.5 py-2 hover:text-brand"
            >
              소개
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center px-1.5 py-2 hover:text-brand"
            >
              기사제보
            </Link>
            <Link
              href="/admin"
              className="inline-flex items-center px-1.5 py-2 hover:text-brand"
            >
              로그인
            </Link>
          </nav>
        </div>
      </div>

      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="text-2xl font-extrabold tracking-tight text-brand">
            경인블루저널
          </span>
          <span className="hidden text-[11px] text-muted sm:inline">
            Gyeongin Blue Journal
          </span>
        </Link>
        <form
          action="/search"
          className="flex items-center gap-1 rounded-full border border-line px-3 py-1.5"
        >
          <input
            name="q"
            placeholder="기사 검색"
            aria-label="기사 검색"
            className="w-28 bg-transparent text-sm outline-none sm:w-44"
          />
          <button
            type="submit"
            aria-label="검색"
            className="-my-1.5 -mr-2 px-2 py-1.5 text-muted hover:text-brand"
          >
            검색
          </button>
        </form>
      </div>

      <nav className="border-y border-line">
        <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4">
          <Link
            href="/"
            className="whitespace-nowrap px-3 py-3 text-sm font-bold hover:text-brand"
          >
            홈
          </Link>
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="whitespace-nowrap px-3 py-3 text-sm font-bold hover:text-brand"
            >
              {n.label}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}
