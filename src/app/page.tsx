import Link from "next/link";
import { getLatest, getByRegion, getBySection } from "@/lib/articles";
import { ArticleCard } from "@/components/ArticleCard";
import { HeroCarousel } from "@/components/HeroCarousel";

// ISR: 정적 캐시 후 최대 60초마다 백그라운드 재생성 (관리자 발행/수정은 revalidatePath 로 즉시 반영)
export const revalidate = 60;

function SectionTitle({ title, href }: { title: string; href?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between border-b-2 border-brand pb-2">
      <h2 className="text-lg font-extrabold text-ink">{title}</h2>
      {href && (
        <Link href={href} className="text-xs text-muted hover:text-brand">
          더보기 +
        </Link>
      )}
    </div>
  );
}

export default async function Home() {
  const [featured, top, gyeonggi, incheon] = await Promise.all([
    getBySection("특집", 5), // 히어로 슬라이드: 특집 최신 5건
    getLatest(22),
    getByRegion("경기", 8),
    getByRegion("인천", 8),
  ]);
  // 히어로(헤드라인) 슬라이드: 특집 최신순. 특집이 하나도 없으면 최신 1건으로 폴백(빈 헤드라인 방지).
  const heroItems = featured.length ? featured : top.slice(0, 1);
  const heroIds = new Set(heroItems.map((a) => a.id));
  const rest = top.filter((a) => !heroIds.has(a.id)); // 히어로 기사들은 아래 목록에서 중복 제거
  const sub = rest.slice(0, 4); // 주요뉴스
  const latest = rest.slice(4, 16); // 최신

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {/* 헤드라인 + 주요뉴스 */}
      <section className="grid gap-8 lg:grid-cols-3">
        {/* min-w-0: 그리드 아이템 기본 min-width:auto 때문에 캐러셀 flex 트랙이 컬럼 폭으로 줄지 못해
            모바일 가로 오버플로가 생기는 것을 방지 */}
        <div className="min-w-0 lg:col-span-2">
          {heroItems.length > 0 && <HeroCarousel articles={heroItems} />}
        </div>
        <div>
          <SectionTitle title="주요뉴스" />
          <div className="space-y-0">
            {sub.map((a) => (
              <ArticleCard key={a.id} a={a} variant="row" />
            ))}
          </div>
        </div>
      </section>

      {/* 최신기사 */}
      <section className="mt-12">
        <SectionTitle title="최신기사" href="/section/뉴스" />
        <div className="grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
          {latest.map((a) => (
            <ArticleCard key={a.id} a={a} variant="default" />
          ))}
        </div>
      </section>

      {/* 지역뉴스 2열 (경기·인천) */}
      <section className="mt-12 grid gap-8 md:grid-cols-2">
        <div>
          <SectionTitle title="경기" href="/region/경기" />
          {gyeonggi.map((a) => (
            <ArticleCard key={a.id} a={a} variant="compact" />
          ))}
        </div>
        <div>
          <SectionTitle title="인천" href="/region/인천" />
          {incheon.length ? (
            incheon.map((a) => <ArticleCard key={a.id} a={a} variant="compact" />)
          ) : (
            <p className="py-4 text-sm text-muted">등록된 기사가 없습니다.</p>
          )}
        </div>
      </section>
    </div>
  );
}
