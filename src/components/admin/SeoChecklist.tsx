"use client";

/**
 * 발행 전 SEO·공유 사전점검(클라이언트 실시간). 발행을 막지 않고 신호등으로 안내만.
 * 제목 길이·대표이미지(OG)·본문 길이·메타설명을 검사.
 */
export function SeoChecklist({
  title,
  thumb,
  bodyHtml,
  metaDescription,
}: {
  title: string;
  thumb: string;
  bodyHtml: string;
  metaDescription: string;
}) {
  const textLen = bodyHtml.replace(/<[^>]+>/g, "").replace(/\s+/g, "").length;
  const titleLen = title.trim().length;
  const metaLen = (metaDescription || "").trim().length;

  const rows = [
    {
      state: titleLen === 0 ? "bad" : titleLen >= 12 && titleLen <= 45 ? "ok" : "warn",
      label: `제목 ${titleLen}자`,
      hint: "15~45자 권장 (검색·공유에 최적)",
    },
    {
      state: thumb ? "ok" : "bad",
      label: thumb ? "대표이미지 있음" : "대표이미지 없음",
      hint: "카톡·검색 공유 시 썸네일로 노출 (없으면 자동 카드 생성)",
    },
    {
      state: textLen >= 200 ? "ok" : textLen > 0 ? "warn" : "bad",
      label: `본문 ${textLen.toLocaleString()}자`,
      hint: "200자 이상 권장",
    },
    {
      state: metaLen === 0 ? "auto" : metaLen <= 160 ? "ok" : "warn",
      label: metaLen === 0 ? "메타설명 자동 생성" : `메타설명 ${metaLen}자`,
      hint: "비워두면 부제/본문 앞부분으로 자동 채움 (120자 권장)",
    },
  ] as const;

  const icon = (s: string) =>
    s === "ok" ? "🟢" : s === "warn" ? "🟡" : s === "auto" ? "⚪" : "🔴";

  return (
    <div className="rounded-md border border-line bg-[#f9fafb] p-3">
      <div className="mb-2 text-xs font-bold text-muted">📋 발행 전 점검 (공유·검색 노출)</div>
      <ul className="space-y-1.5 text-sm">
        {rows.map((r, i) => (
          <li key={i} className="flex flex-wrap items-center gap-x-2">
            <span>{icon(r.state)}</span>
            <span className="font-medium">{r.label}</span>
            <span className="text-xs text-muted">— {r.hint}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
