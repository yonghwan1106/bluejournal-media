import Link from "next/link";
import { getAllArticles, getByRegion } from "@/lib/articles";
import { ArticleCard } from "@/components/ArticleCard";

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

export default function Home() {
  const all = getAllArticles();
  const headline = all[0];
  const sub = all.slice(1, 5); // 주요뉴스
  const latest = all.slice(5, 17); // 최신
  const gyeonggi = getByRegion("경기", 6);
  const seoul = getByRegion("서울", 5);
  const incheon = getByRegion("인천", 5);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {/* 헤드라인 + 주요뉴스 */}
      <section className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {headline && <ArticleCard a={headline} variant="hero" />}
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

      {/* 지역뉴스 3열 */}
      <section className="mt-12 grid gap-8 md:grid-cols-3">
        <div>
          <SectionTitle title="경기" href="/region/경기" />
          {gyeonggi.map((a) => (
            <ArticleCard key={a.id} a={a} variant="compact" />
          ))}
        </div>
        <div>
          <SectionTitle title="서울" href="/region/서울" />
          {seoul.length ? (
            seoul.map((a) => <ArticleCard key={a.id} a={a} variant="compact" />)
          ) : (
            <p className="py-4 text-sm text-muted">등록된 기사가 없습니다.</p>
          )}
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
