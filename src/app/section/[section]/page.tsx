import { getBySection, SECTIONS } from "@/lib/articles";
import { ArticleCard } from "@/components/ArticleCard";
import type { Metadata } from "next";

// 발행/수정 시 on-demand revalidation이 있으므로 시간 기반 ISR은 1시간이면 충분하다.
export const revalidate = 3600;

export function generateStaticParams() {
  return SECTIONS.map((s) => ({ section: s }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ section: string }>;
}): Promise<Metadata> {
  const { section } = await params;
  return { title: decodeURIComponent(section) };
}

export default async function SectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  const s = decodeURIComponent(section);
  const list = await getBySection(s);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-5 border-b-2 border-brand pb-2 text-2xl font-extrabold">
        {s}
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
