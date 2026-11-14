export const WORLD_SECTION = "세계 자치모델";
export const WORLD_DOMAINS = [
  "council.nyc.gov", "nyc.gov", "hel.fi", "paris.fr", "london.gov.uk",
  "seattle.gov", "decidim.barcelona", "reykjavik.is", "madrid.es",
  "cascais.pt", "quezoncity.gov.ph", "zagreb.hr", "buenosaires.gob.ar",
  "dublincity.ie", "melbourne.vic.gov.au", "boston.gov", "porto.pt",
  "local.gov.uk", "oecd.org", "opengovpartnership.org",
] as const;
export type WorldSource = { id: string; title: string; url: string; text: string; fetchedAt: string };
export type WorldDraft = {
  title: string; subtitle: string; lead: string; city: string; mechanism: string;
  sections: { heading: string; paragraphs: string[]; sourceIds: string[] }[];
  conclusion: string; tags: string[];
};
export function officialWorldUrl(value: string): URL {
  const u = new URL(value);
  if (u.protocol !== "https:" || u.username || u.password || u.port ||
    !WORLD_DOMAINS.some(d => u.hostname === d || u.hostname.endsWith("." + d))) {
    throw new Error("허용되지 않은 공식 출처 주소");
  }
  u.hash = "";
  for (const key of [...u.searchParams.keys()]) {
    if (/^(utm_|fbclid|gclid)/i.test(key)) u.searchParams.delete(key);
  }
  return u;
}
export function worldSchedule(now: Date) {
  if (!Number.isFinite(now.getTime())) throw new Error("잘못된 실행 시각");
  const clock = new Date(now.getTime() + 9 * 3600000);
  const monday = new Date(Date.UTC(clock.getUTCFullYear(), clock.getUTCMonth(),
    clock.getUTCDate() - (clock.getUTCDay() + 6) % 7));
  const weekStart = monday.toISOString().slice(0, 10);
  const publishAt = new Date(monday.getTime() + 2 * 86400000);
  return { runKey: "global-local-governance:" + weekStart, weekStart, publishAt };
}
export function worldText(d: WorldDraft) {
  return [d.lead, ...d.sections.flatMap(s => s.paragraphs), d.conclusion].join("\n\n");
}
export function worldDraftErrors(d: WorldDraft, sources: WorldSource[]): string[] {
  const errors: string[] = [];
  if (d.title.length < 10 || d.title.length > 120) errors.push("제목 길이");
  if (d.sections.length < 3 || d.sections.length > 4) errors.push("소제목 3~4개");
  if (worldText(d).length < 1600 || worldText(d).length > 3800) errors.push("본문 1600~3800자");
  const ids = new Set(sources.map(s => s.id));
  if(ids.size!==sources.length)errors.push("중복 출처 ID");
  const cited = new Set(d.sections.flatMap(s => s.sourceIds));
  if (new Set(sources.filter(s => cited.has(s.id)).map(s => s.url)).size < 2) errors.push("서로 다른 공식 출처 2개");
  if (d.sections.some(s => !s.sourceIds.length || !s.paragraphs.length) ||
    [...cited].some(id => !ids.has(id))) errors.push("문단별 유효한 출처");
  const paragraphs=[d.lead,...d.sections.flatMap(s=>s.paragraphs),d.conclusion];
  if(paragraphs.some(p=>!/[.!?。！？]$/.test(p.replace(/\s*\(?S\d+(?:\s*[,·]\s*S\d+)*\)?\s*$/g,"").trim())))errors.push("문단은 완결된 문장으로 끝나야 함");
  if (!d.city.trim() || !d.mechanism.trim()) errors.push("도시와 제도 식별");
  return errors;
}
const escape = (v: string) => v.replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export function worldBodyHtml(d: WorldDraft, sources: WorldSource[], now: Date): string {
  const p = (t: string) => "<p>" + escape(t) + "</p>";
  return p(d.lead) + d.sections.map(s => "<h2>" + escape(s.heading) + "</h2>" +
    s.paragraphs.map(p).join("") + '<p class="article-sources">' +
    s.sourceIds.map(id => {
      const source = sources.find(x => x.id === id);
      if (!source) throw new Error("존재하지 않는 출처");
      return '<a href="' + escape(officialWorldUrl(source.url).href) +
        '" rel="noopener noreferrer">' + escape(source.title) + "</a>";
    }).join(" · ") + "</p>").join("") + p(d.conclusion) +
    p("공식자료 확인: " + now.toISOString().slice(0,10) +
      ". AI를 활용해 작성하고 독립된 검수 단계에서 근거를 대조했습니다. 대표 이미지는 편집용 도안입니다.");
}
export function normalizedWorldUrl(url: string): string {
  try { return officialWorldUrl(url).href.replace(/\/$/, ""); } catch { return url; }
}
