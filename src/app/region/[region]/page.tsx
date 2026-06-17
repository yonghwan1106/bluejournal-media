import { getByRegion, REGIONS } from "@/lib/articles";
import { ArticleCard } from "@/components/ArticleCard";
import type { Metadata } from "next";

export const revalidate = 60;

export function generateStaticParams() {
  return REGIONS.map((r) => ({ region: r }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ region: string }>;
}): Promise<Metadata> {
  const { region } = await params;
  return { title: `${decodeURIComponent(region)} 지역뉴스` };
}

export default async function RegionPage({
  params,
}: {
  params: Promise<{ region: string }>;
}) {
  const { region } = await params;
  const r = decodeURIComponent(region);
  const list = await getByRegion(r);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-5 border-b-2 border-brand pb-2 text-2xl font-extrabold">
        {r} <span className="text-base font-bold text-muted">지역뉴스</span>
      </h1>
      {list.length === 0 ? (
        <p className="py-10 text-center text-muted">등록된 기사가 없습니다.</p>
      ) : (
        <div>
          {list.map((a) => (
            <ArticleCard key={a.id} a={a} variant="row" />
          ))}
        </div>
      )}
    </div>
  );
}
