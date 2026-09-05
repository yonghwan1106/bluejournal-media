import * as cheerio from "cheerio";
import type {
  WeeklyFeatureCandidate,
  WeeklyFeatureEvidence,
} from "@/lib/weekly-gyeonggi-feature-core";

const OFFICIAL_ORIGIN = "https://gnews.gg.go.kr";

export const WEEKLY_FEATURE_BOARDS = [
  {
    code: "s017",
    listPath: "/briefing/brief_gongbo.do",
    sourceName: "경기도청 보도자료",
  },
  {
    code: "s003",
    listPath: "/briefing/brief_sigun.do",
    sourceName: "경기도 시군 보도자료",
  },
] as const;

export type WeeklyFeatureBoard = (typeof WEEKLY_FEATURE_BOARDS)[number];

function inlineText(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/\u0000/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dateToken(value: string): string {
  const match = value.match(/(20\d{2})[./-](\d{1,2})[./-](\d{1,2})/);
  if (!match) return "";
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function officialDetailUrl(value: string | undefined): URL | null {
  if (!value) return null;
  const url = new URL(value, OFFICIAL_ORIGIN);
  url.pathname = url.pathname.replace(/;jsessionid=[^/]+$/i, "");
  if (
    url.protocol !== "https:" ||
    url.hostname !== "gnews.gg.go.kr" ||
    url.pathname !== "/briefing/brief_gongbo_view.do"
  ) {
    return null;
  }
  return url;
}

/**
 * 목록 서버는 날짜 검색 파라미터가 붙으면 간헐적으로 404를 반환한다.
 * 각 보드의 실제 목록 경로를 페이지 단위로 읽은 뒤 게시일은 파서에서 제한한다.
 */
export function buildWeeklyFeatureListUrl(board: WeeklyFeatureBoard, page: number): string {
  if (!Number.isInteger(page) || page < 1) throw new Error("목록 페이지는 1 이상의 정수여야 합니다.");
  const url = new URL(board.listPath, OFFICIAL_ORIGIN);
  url.searchParams.set("page", String(page));
  url.searchParams.set("BS_CODE", board.code);
  return url.href;
}

export function parseWeeklyFeatureListPage(params: {
  html: string;
  board: WeeklyFeatureBoard;
  weekStart: string;
  sourceEnd: string;
}): { candidates: WeeklyFeatureCandidate[]; publishedDates: string[] } {
  const $ = cheerio.load(params.html);
  const byId = new Map<string, WeeklyFeatureCandidate>();
  const publishedDates: string[] = [];

  $(".sub-con-element.gongbo table tbody tr").each((_, element) => {
    const row = $(element);
    const link = row.find("td.tit > a.txtLink[href*='brief_gongbo_view.do']").first();
    if (!link.length) return;
    const url = officialDetailUrl(link.attr("href"));
    if (!url || url.searchParams.get("BS_CODE") !== params.board.code) return;

    const number = url.searchParams.get("number");
    if (!number || !/^\d+$/.test(number)) return;

    const publishedDate = dateToken(inlineText(row.find("td.date").text()));
    if (publishedDate) publishedDates.push(publishedDate);
    if (
      !publishedDate ||
      publishedDate < params.weekStart ||
      publishedDate > params.sourceEnd
    ) {
      return;
    }

    const title = inlineText(link.text());
    if (title.length < 5) return;

    const id = `${params.board.code}-${number}`;
    byId.set(id, {
      id,
      title,
      date: publishedDate,
      url: url.href,
      sourceName: params.board.sourceName,
    });
  });

  return {
    candidates: [...byId.values()].sort(
      (a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id),
    ),
    publishedDates,
  };
}

export function parseWeeklyFeatureListHtml(
  params: Parameters<typeof parseWeeklyFeatureListPage>[0],
): WeeklyFeatureCandidate[] {
  return parseWeeklyFeatureListPage(params).candidates;
}

function elementTextWithBreaks($: cheerio.CheerioAPI, selector: string): string {
  const element = $(selector).first().clone();
  if (!element.length) return "";
  element.find("script,style,noscript").remove();
  element.find("br").replaceWith("\n");
  element.find("p,div,li").append("\n");
  return String(element.text())
    .replace(/\u0000/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .trim();
}

function verifyDetailIdentity($: cheerio.CheerioAPI, candidate: WeeklyFeatureCandidate): void {
  const ogUrl = $("meta[property='og:url']").attr("content");
  if (!ogUrl) return;
  const actual = new URL(ogUrl, OFFICIAL_ORIGIN);
  const expected = new URL(candidate.url);
  if (
    actual.hostname !== "gnews.gg.go.kr" ||
    actual.pathname !== "/briefing/brief_gongbo_view.do" ||
    actual.searchParams.get("BS_CODE") !== expected.searchParams.get("BS_CODE") ||
    actual.searchParams.get("number") !== expected.searchParams.get("number")
  ) {
    throw new Error(`공식 상세 페이지 식별자가 후보와 다릅니다: ${candidate.url}`);
  }
}

export function parseWeeklyFeatureDetailHtml(
  html: string,
  candidate: WeeklyFeatureCandidate,
): WeeklyFeatureEvidence {
  const $ = cheerio.load(html);
  verifyDetailIdentity($, candidate);
  $("script,style,noscript").remove();

  const title =
    inlineText($("div.sub-con-element.brief_detail > #contents.wrap > h3").first().text()) ||
    inlineText($("meta[property='og:title']").attr("content")) ||
    candidate.title;
  const summary =
    inlineText($("div.sub-con-element.brief_detail > #contents.wrap > ul > li").first().text()).replace(
      /^○\s*/,
      "",
    ) || inlineText($("meta[property='og:description']").attr("content"));
  const bodyText = elementTextWithBreaks($, ".postbody > .postBody").slice(0, 6_000);
  const sourceDate =
    dateToken(inlineText($(".postmenu > .postinfo").first().text())) || candidate.date;

  if (title.length < 5) throw new Error(`공식 근거 제목 추출 실패: ${candidate.url}`);
  if (bodyText.length < 180) throw new Error(`공식 근거 본문 추출 부족: ${candidate.url}`);

  return { ...candidate, title, date: sourceDate, summary, bodyText };
}
