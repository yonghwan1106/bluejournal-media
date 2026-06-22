"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { resolveImg } from "@/lib/media";
import { formatDate } from "@/lib/format";
import type { SeedArticle } from "@/lib/articles";

const AUTOPLAY_MS = 5000; // 자동 전환 간격
const MAX_SLIDES = 5; // 히어로에 노출할 특집 최대 건수

/**
 * 히어로(헤드라인) 슬라이드. 특집 기사 최신순 최대 5건을 자동으로 순환한다.
 * - 5초 자동재생(무한 루프) + 좌우 화살표 + 점 인디케이터 + 재생/일시정지 토글
 * - 마우스 호버·포커스 시 일시정지(서로 독립), prefers-reduced-motion 실시간 존중
 * - 자동재생 중엔 aria-live=off, 정지/수동 조작 시 polite 로 전환해 변경 안내
 * - 비활성 슬라이드는 inert + aria-hidden 으로 탭/스크린리더에서 제외
 * - ←/→ 키로도 이동
 * 페이지 본체는 서버 컴포넌트(SSR/ISR)이고 이 히어로 영역만 클라이언트로 분리한다.
 */
export function HeroCarousel({ articles }: { articles: SeedArticle[] }) {
  const slides = articles.slice(0, MAX_SLIDES);
  const count = slides.length;

  const [index, setIndex] = useState(0);
  const [hovering, setHovering] = useState(false); // 마우스 호버
  const [focusWithin, setFocusWithin] = useState(false); // 포커스 진입
  const [userPaused, setUserPaused] = useState(false); // 사용자가 명시적으로 멈춤
  const [reducedMotion, setReducedMotion] = useState(false); // OS 모션 감소 설정

  const go = useCallback(
    (i: number) => setIndex(((i % count) + count) % count),
    [count],
  );
  const next = useCallback(() => setIndex((p) => (p + 1) % count), [count]);
  const prev = useCallback(
    () => setIndex((p) => (p - 1 + count) % count),
    [count],
  );

  // prefers-reduced-motion: 마운트 후 실제값 반영 + OS 토글에 실시간 반응
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const update = () => setReducedMotion(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const multi = count > 1;
  // 자동재생 조건: 2건 이상 + 사용자 멈춤 아님 + 호버/포커스 없음 + 모션 감소 비선호
  const playing =
    multi && !userPaused && !hovering && !focusWithin && !reducedMotion;

  // 자동재생: index 를 의존성에 넣어 수동 조작/자동 전환 때마다 타이머를 새로 시작(슬라이드별 완전한 간격 보장)
  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => setIndex((p) => (p + 1) % count), AUTOPLAY_MS);
    return () => clearTimeout(t);
  }, [playing, index, count]);

  if (count === 0) return null;

  const active = Math.min(index, count - 1); // 방어적 클램프(렌더 시점)

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!multi) return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      prev();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      next();
    }
  };

  return (
    <section
      aria-roledescription="carousel"
      aria-label="특집 기사"
      className="relative"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onFocusCapture={() => setFocusWithin(true)}
      onBlurCapture={() => setFocusWithin(false)}
      onKeyDown={onKeyDown}
    >
      <div
        className="overflow-hidden rounded-lg"
        aria-live={playing ? "off" : "polite"}
        aria-atomic="false"
      >
        <div
          className="flex transition-transform duration-500 ease-out motion-reduce:transition-none"
          style={{ transform: `translateX(-${active * 100}%)` }}
        >
          {slides.map((a, i) => (
            <HeroSlide
              key={a.id}
              a={a}
              active={i === active}
              position={i + 1}
              total={count}
            />
          ))}
        </div>
      </div>

      {multi && (
        <>
          {/* 좌우 화살표: 이미지 박스(16/9)에 정확히 겹치도록 동일 비율 오버레이로 정렬 */}
          <div className="pointer-events-none absolute inset-x-0 top-0 flex aspect-[16/9] items-center justify-between px-2 sm:px-3">
            <CarouselButton label="이전 특집 기사" onClick={prev}>
              <ChevronLeft />
            </CarouselButton>
            <CarouselButton label="다음 특집 기사" onClick={next}>
              <ChevronRight />
            </CarouselButton>
          </div>

          {/* 컨트롤 바: 재생/일시정지 + 점 인디케이터 */}
          <div className="mt-3 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setUserPaused((v) => !v)}
              aria-label={userPaused ? "자동 재생 시작" : "자동 재생 멈춤"}
              className="grid h-6 w-6 place-items-center rounded-full text-muted transition hover:bg-line hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              {userPaused ? <PlayIcon /> : <PauseIcon />}
            </button>

            <div className="flex items-center gap-2">
              {slides.map((a, i) => {
                const isActive = i === active;
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => go(i)}
                    aria-label={`${i + 1}번째 특집 기사로 이동`}
                    aria-current={isActive ? "true" : undefined}
                    className={`h-2 rounded-full transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                      isActive ? "w-6 bg-brand" : "w-2 bg-muted/50 hover:bg-muted"
                    }`}
                  />
                );
              })}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function HeroSlide({
  a,
  active,
  position,
  total,
}: {
  a: SeedArticle;
  active: boolean;
  position: number;
  total: number;
}) {
  const img = resolveImg(a.thumbnailUrl);
  const label = a.region ?? a.section;
  return (
    <div
      className="w-full shrink-0"
      role="group"
      aria-roledescription="slide"
      aria-label={`${position} / ${total}`}
      aria-hidden={!active}
      inert={!active ? true : undefined}
    >
      <Link href={`/news/${a.id}`} className="group block">
        <div className="mb-3 aspect-[16/9] overflow-hidden rounded-lg bg-line">
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={img}
              alt={a.title}
              className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            />
          ) : (
            // 썸네일 없는 특집: 빈 회색 대신 브랜드 그라데이션 + 라벨로 의도된 화면 구성
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand to-brand-dark">
              <span className="text-xl font-extrabold tracking-wide text-white/90">
                {label}
              </span>
            </div>
          )}
        </div>
        <span className="text-xs font-bold text-accent">{label}</span>
        <h2 className="mt-1 line-clamp-2 text-2xl font-extrabold leading-snug group-hover:text-brand md:text-[28px]">
          {a.title}
        </h2>
        {a.subtitle && (
          <p className="mt-2 line-clamp-2 text-muted">{a.subtitle}</p>
        )}
        <div className="mt-2 text-xs text-muted">
          {a.reporterName} · {formatDate(a.publishedAt)}
        </div>
      </Link>
    </div>
  );
}

function CarouselButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="pointer-events-auto grid h-9 w-9 place-items-center rounded-full bg-black/55 text-white shadow-md ring-1 ring-white/20 backdrop-blur-sm transition hover:bg-black/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
    >
      {children}
    </button>
  );
}

function ChevronLeft() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
