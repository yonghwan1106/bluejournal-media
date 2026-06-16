import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getArticle, getAllIds, getRelated } from "@/lib/articles";
import { rewriteBodyImages, resolveImg } from "@/lib/media";
import { formatDateTime } from "@/lib/format";
import { ArticleCard } from "@/components/ArticleCard";

export function generateStaticParams() {
  return getAllIds().map((id) => ({ id: String(id) }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const a = getArticle(Number(id));
  if (!a) return { title: "기사를 찾을 수 없습니다" };
  const img = resolveImg(a.thumbnailUrl);
  const desc = a.subtitle ?? a.bodyText?.slice(0, 120) ?? undefined;
  return {
    title: a.title,
    description: desc,
    alternates: { canonical: `/news/${a.id}` },
    openGraph: {
      title: a.title,
      description: desc,
      type: "article",
      url: `/news/${a.id}`,
      images: img ? [img] : undefined,
      publishedTime: a.publishedAt ?? undefined,
    },
  };
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const a = getArticle(Number(id));
  if (!a) notFound();

  const body = rewriteBodyImages(a.bodyHtml);
  const related = getRelated(a);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <nav className="text-xs text-muted">
        <Link href="/" className="hover:text-brand">
          홈
        </Link>{" "}
        ›{" "}
        <Link href={`/section/${a.section}`} className="hover:text-brand">
          {a.section}
        </Link>
      </nav>

      <h1 className="mt-3 text-3xl font-extrabold leading-tight">{a.title}</h1>
      {a.subtitle && (
        <p className="mt-3 text-lg leading-relaxed text-muted">{a.subtitle}</p>
      )}

      <div className="mt-5 flex items-center justify-between border-y border-line py-3 text-sm text-muted">
        <span className="font-medium text-ink">{a.reporterName} 기자</span>
        <time dateTime={a.publishedAt ?? undefined}>
          입력 {formatDateTime(a.publishedAt)}
        </time>
      </div>

      <div
        className="article-body mt-7"
        dangerouslySetInnerHTML={{ __html: body }}
      />

      {a.tags.length > 0 && (
        <div className="mt-8 flex flex-wrap gap-2">
          {a.tags.map((t) => (
            <Link
              key={t}
              href={`/search?q=${encodeURIComponent(t)}`}
              className="rounded-full bg-brand-light px-3 py-1 text-xs text-brand-dark hover:bg-brand hover:text-white"
            >
              #{t}
            </Link>
          ))}
        </div>
      )}

      {(a.source || a.sourceUrl) && (
        <div className="mt-6 rounded-md bg-[#f7f8fa] p-4 text-sm text-muted">
          {a.source && (
            <div>
              <strong className="text-ink">출처</strong> : {a.source}
            </div>
          )}
          {a.sourceUrl && (
            <div className="mt-1 break-all">
              <strong className="text-ink">원문</strong> :{" "}
              <a
                href={a.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand underline"
              >
                {a.sourceUrl}
              </a>
            </div>
          )}
        </div>
      )}

      {related.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-3 border-b-2 border-brand pb-2 text-lg font-extrabold">
            관련기사
          </h2>
          <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            {related.map((r) => (
              <ArticleCard key={r.id} a={r} variant="row" />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
