import { searchArticles } from "@/lib/articles";
import { ArticleCard } from "@/components/ArticleCard";

export const metadata = { title: "기사 검색" };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").toString().trim();
  const results = q ? await searchArticles(q) : [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-extrabold">기사 검색</h1>
      <form action="/search" className="mt-4 flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="검색어를 입력하세요"
          className="flex-1 rounded-md border border-line px-4 py-2.5 outline-none focus:border-brand"
        />
        <button
          type="submit"
          className="rounded-md bg-brand px-5 py-2.5 font-bold text-white hover:bg-brand-dark"
        >
          검색
        </button>
      </form>

      {q && (
        <p className="mt-5 text-sm text-muted">
          <strong className="text-ink">{q}</strong> 검색결과 {results.length}건
        </p>
      )}

      <div className="mt-4">
        {results.map((a) => (
          <ArticleCard key={a.id} a={a} variant="row" />
        ))}
        {q && results.length === 0 && (
          <p className="py-10 text-center text-muted">검색 결과가 없습니다.</p>
        )}
      </div>
    </div>
  );
}
