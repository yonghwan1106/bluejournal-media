import * as cheerio from "cheerio";
import type {
  WeeklyFeatureCandidate,
  WeeklyFeatureEvidence,
} from "@/lib/weekly-gyeonggi-feature-core";

const OFFICIAL_ORIGIN = "https://gnews.gg.go.kr";
const PIMAC_ORIGIN = "https://pimac.kdi.re.kr";

export const WEEKLY_FEATURE_BOARDS = [
  {
    code: "s017",
    listPath: "/briefing/brief_gongbo.do",
    sourceName: "경기도청 보도자료",
    titleSearchCode: "8",
  },
  {
    code: "s003",
    listPath: "/briefing/brief_sigun.do",
    sourceName: "경기도 시군 보도자료",
    titleSearchCode: "1",
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
  const boardCode = url.searchParams.get("BS_CODE");
  const number = url.searchParams.get("number");
  if (
    url.protocol !== "https:" ||
    url.hostname !== "gnews.gg.go.kr" ||
    url.pathname !== "/briefing/brief_gongbo_view.do" ||
    (boardCode !== "s017" && boardCode !== "s003") ||
    !number ||
    !/^\d+$/.test(number)
  ) {
    return null;
  }
  const canonical = new URL("/briefing/brief_gongbo_view.do", OFFICIAL_ORIGIN);
  canonical.searchParams.set("BS_CODE", boardCode);
  canonical.searchParams.set("number", number);
  return canonical;
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

function officialSearchKeyword(value: string): string {
  const keyword = inlineText(value.normalize("NFKC").replace(/[^0-9a-z\p{Script=Hangul}\s]/giu, " "));
  if (keyword.length < 2 || keyword.length > 30) {
    throw new Error("공식자료 검색어는 2~30자의 한글·영문·숫자여야 합니다.");
  }
  return keyword;
}

/** 사이트 검색 코드가 다른 두 보드를 제목 검색하되, 불안정한 날짜 query는 보내지 않는다. */
export function buildWeeklyFeatureArchiveSearchUrl(
  board: WeeklyFeatureBoard,
  keywordValue: string,
  page = 1,
): string {
  if (!Number.isInteger(page) || page < 1) throw new Error("목록 페이지는 1 이상의 정수여야 합니다.");
  const url = new URL(board.listPath, OFFICIAL_ORIGIN);
  url.searchParams.set("page", String(page));
  url.searchParams.set("BS_CODE", board.code);
  url.searchParams.set("search", board.titleSearchCode);
  url.searchParams.set("keyword", officialSearchKeyword(keywordValue));
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

export function parseWeeklyFeatureArchiveListHtml(
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

export function buildPimacProjectSearchUrl(keywordValue: string): string {
  const url = new URL("/study/fina_list.jsp", PIMAC_ORIGIN);
  url.searchParams.set("pp", "10");
  url.searchParams.set("bizNm", officialSearchKeyword(keywordValue));
  return url.href;
}

function pimacDetailUrl(examinationNumber: string): URL | null {
  if (!/^\d+$/.test(examinationNumber)) return null;
  const url = new URL("/study/fina_view.jsp", PIMAC_ORIGIN);
  url.searchParams.set("exmn_no", examinationNumber);
  return url;
}

export function parsePimacProjectSearchHtml(params: {
  html: string;
  archiveStart: string;
  sourceEnd: string;
}): WeeklyFeatureCandidate[] {
  const $ = cheerio.load(params.html);
  const byId = new Map<string, WeeklyFeatureCandidate>();

  $("a[href^='javascript:view_fina(']").each((_, element) => {
    const link = $(element);
    const href = inlineText(link.attr("href"));
    const identity = href.match(/^javascript:view_fina\((\d+)\);?$/);
    if (!identity) return;

    const fullTitle = inlineText(link.text());
    const title = fullTitle.replace(/\s*\[\s*조사\s*의뢰일\s*\].*$/u, "").trim();
    const publishedDate = dateToken(fullTitle);
    const url = pimacDetailUrl(identity[1]);
    if (
      !url ||
      title.length < 5 ||
      !publishedDate ||
      publishedDate < params.archiveStart ||
      publishedDate > params.sourceEnd
    ) {
      return;
    }

    const id = `pimac-fina-${identity[1]}`;
    byId.set(id, {
      id,
      title,
      date: publishedDate,
      url: url.href,
      sourceName: "KDI 공공투자관리센터",
    });
  });

  return [...byId.values()].sort(
    (left, right) => right.date.localeCompare(left.date) || right.id.localeCompare(left.id),
  );
}

function verifyPimacIdentity(candidate: WeeklyFeatureCandidate): void {
  const idMatch = candidate.id.match(/^pimac-fina-(\d+)$/);
  const url = new URL(candidate.url);
  if (
    !idMatch ||
    url.protocol !== "https:" ||
    url.hostname !== "pimac.kdi.re.kr" ||
    url.pathname !== "/study/fina_view.jsp" ||
    url.searchParams.size !== 1 ||
    url.searchParams.get("exmn_no") !== idMatch[1]
  ) {
    throw new Error(`PIMAC 상세 페이지 식별자가 후보와 다릅니다: ${candidate.url}`);
  }
}

export function parsePimacProjectDetailHtml(
  html: string,
  candidate: WeeklyFeatureCandidate,
): WeeklyFeatureEvidence {
  verifyPimacIdentity(candidate);
  const $ = cheerio.load(html);
  $("script,style,noscript").remove();

  const bodyText = elementTextWithBreaks($, ".com_contents.fina").slice(0, 6_000);
  const normalizedBody = inlineText(bodyText).replace(/[^0-9a-z\p{Script=Hangul}]+/giu, " ");
  const normalizedTitle = inlineText(candidate.title).replace(
    /[^0-9a-z\p{Script=Hangul}]+/giu,
    " ",
  );
  if (bodyText.length < 180) throw new Error(`PIMAC 공식 근거 본문 추출 부족: ${candidate.url}`);
  if (!normalizedBody.includes(normalizedTitle)) {
    throw new Error(`PIMAC 상세 본문이 후보 사업명과 다릅니다: ${candidate.url}`);
  }

  const titleBlock = inlineText($(".body_contents .tit").first().text());
  const sourceDate = dateToken(titleBlock) || candidate.date;
  const summary = inlineText(bodyText).slice(0, 500);
  return { ...candidate, date: sourceDate, summary, bodyText };
}
