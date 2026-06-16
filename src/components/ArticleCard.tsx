import Link from "next/link";
import { resolveImg } from "@/lib/media";
import { formatDate } from "@/lib/format";
import type { SeedArticle } from "@/lib/articles";

type Variant = "hero" | "default" | "row" | "compact";

export function ArticleCard({
  a,
  variant = "default",
}: {
  a: SeedArticle;
  variant?: Variant;
}) {
  const img = resolveImg(a.thumbnailUrl);
  const href = `/news/${a.id}`;
  const label = a.region ?? a.section;

  if (variant === "compact") {
    return (
      <Link
        href={href}
        className="group flex items-start gap-2 border-b border-line py-2.5"
      >
        <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-brand" />
        <h3 className="line-clamp-2 text-sm leading-snug group-hover:text-brand">
          {a.title}
        </h3>
      </Link>
    );
  }

  if (variant === "row") {
    return (
      <Link href={href} className="group flex gap-3 border-b border-line py-3">
        <div className="min-w-0 flex-1">
          <span className="text-[11px] font-bold text-brand">{label}</span>
          <h3 className="line-clamp-2 font-semibold leading-snug group-hover:text-brand">
            {a.title}
          </h3>
          <div className="mt-1 text-xs text-muted">
            {a.reporterName} · {formatDate(a.publishedAt)}
          </div>
        </div>
        {img && (
          <div className="h-20 w-28 shrink-0 overflow-hidden rounded">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img} alt="" loading="lazy" className="h-full w-full object-cover" />
          </div>
        )}
      </Link>
    );
  }

  if (variant === "hero") {
    return (
      <Link href={href} className="group block">
        {img && (
          <div className="mb-3 aspect-[16/9] overflow-hidden rounded-lg bg-line">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={img}
              alt={a.title}
              className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            />
          </div>
        )}
        <span className="text-xs font-bold text-accent">{label}</span>
        <h2 className="mt-1 text-2xl font-extrabold leading-snug group-hover:text-brand md:text-[28px]">
          {a.title}
        </h2>
        {a.subtitle && (
          <p className="mt-2 line-clamp-2 text-muted">{a.subtitle}</p>
        )}
        <div className="mt-2 text-xs text-muted">
          {a.reporterName} · {formatDate(a.publishedAt)}
        </div>
      </Link>
    );
  }

  return (
    <Link href={href} className="group block">
      {img && (
        <div className="mb-2 aspect-[16/10] overflow-hidden rounded-md bg-line">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={img}
            alt={a.title}
            loading="lazy"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          />
        </div>
      )}
      <span className="text-[11px] font-bold text-brand">{label}</span>
      <h3 className="line-clamp-2 font-bold leading-snug group-hover:text-brand">
        {a.title}
      </h3>
      {a.subtitle && (
        <p className="mt-1 line-clamp-2 text-sm text-muted">{a.subtitle}</p>
      )}
      <div className="mt-1 text-xs text-muted">
        {a.reporterName} · {formatDate(a.publishedAt)}
      </div>
    </Link>
  );
}
