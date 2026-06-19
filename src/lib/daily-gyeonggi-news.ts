import "server-only";
import * as cheerio from "cheerio";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { and, eq, gte, lt, or } from "drizzle-orm";
import { request as httpsRequest } from "node:https";
import { getDb } from "@/db";
import { articles, type NewArticle } from "@/db/schema";
import { adminCreateArticle } from "@/lib/admin-db";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 BluejournalCron/1.0";
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export type SourceType =
  | "gnews"
  | "incheon"
  | "incheon_council"
  | "seongnam"
  | "suwon"
  | "hwaseong"
  | "yongin"
  | "ggc"
  | "suwon_council"
  | "yongin_council"
  | "seongnam_council"
  | "hwaseong_council";

export type SourceItem = {
  key: string;
  type: SourceType;
  source: string;
  sourceLabel: string;
  sourceUrl: string;
  listedTitle: string;
  listedDate: string;
  fallbackImageUrl?: string;
  fallbackImageAlt?: string;
};

type ExtractedArticle = SourceItem & {
  title: string;
  subtitle: string | null;
  bodyHtml: string;
  bodyText: string;
  imageUrl: string | null;
  sourceDate: string;
  tags: string[];
};

export type DailyGyeonggiNewsOptions = {
  date?: string;
  dryRun?: boolean;
  limit?: number;
  publishedAtTime?: string;
};

export type DailyGyeonggiNewsResult = {
  date: string;
  dryRun: boolean;
  scannedAt: string;
  publishedAtTime: string;
  scanned: number;
  published: number;
  skipped: number;
  failed: number;
  results: Array<{
    key: string;
    source: string;
    title: string;
    sourceUrl: string;
    status: "published" | "skip_existing" | "skip_no_image" | "dry_run" | "failed";
    id?: number;
    url?: string;
    reason?: string;
  }>;
  exclusions: Array<{ source: string; reason: string; latest?: string }>;
};

class SkipArticleError extends Error {
  constructor(
    public readonly status: "skip_no_image",
    message: string,
  ) {
    super(message);
    this.name = "SkipArticleError";
  }
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function todayKst(): string {
  const k = new Date(Date.now() + KST_OFFSET_MS);
  return `${k.getUTCFullYear()}-${pad(k.getUTCMonth() + 1)}-${pad(k.getUTCDate())}`;
}

function kstNowIso(): string {
  const k = new Date(Date.now() + KST_OFFSET_MS);
  return `${k.getUTCFullYear()}-${pad(k.getUTCMonth() + 1)}-${pad(k.getUTCDate())}T${pad(
    k.getUTCHours(),
  )}:${pad(k.getUTCMinutes())}:${pad(k.getUTCSeconds())}+09:00`;
}

function kstDateToRange(date: string): { start: Date; end: Date } {
  const start = new Date(`${date}T00:00:00+09:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

function dotDate(date: string): string {
  return date.replace(/-/g, ".");
}

function slashDate(date: string): string {
  return date.replace(/-/g, "/");
}

function normalizePublishTime(value: string | undefined): string {
  const match = value?.match(/^(\d{1,2}):(\d{2})$/);
  const hour = match ? Number(match[1]) : 8;
  const minute = match ? Number(match[2]) : 40;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return "08:40";
  return `${pad(hour)}:${pad(minute)}`;
}

function normalizeDateToken(value: string | null | undefined): string {
  const text = String(value ?? "");
  const korean = text.match(/(20\d{2})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (korean) return `${korean[1]}-${pad(Number(korean[2]))}-${pad(Number(korean[3]))}`;
  const match = text.match(/(20\d{2})[./-](\d{1,2})[./-](\d{1,2})/);
  if (!match) return "";
  return `${match[1]}-${pad(Number(match[2]))}-${pad(Number(match[3]))}`;
}

function dateMatches(value: string | null | undefined, date: string): boolean {
  const text = String(value ?? "");
  return (
    normalizeDateToken(text) === date ||
    text.includes(date) ||
    text.includes(dotDate(date)) ||
    text.includes(slashDate(date))
  );
}

function absoluteUrl(url: string | undefined, base: string): string {
  if (!url) return "";
  return new URL(url, base).href.replace(/;jsessionid=[^?]+/i, "");
}

async function fetchText(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`fetch failed ${res.status}: ${url}`);
    return res.text();
  } catch (error) {
    const host = new URL(url).hostname;
    if (host.endsWith("seongnam.go.kr")) return fetchTextWithInsecureCert(url);
    throw error;
  }
}

function fetchTextWithInsecureCert(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      url,
      {
        headers: { "User-Agent": UA },
        rejectUnauthorized: false,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on("end", () => {
          const status = res.statusCode ?? 0;
          if (status < 200 || status >= 300) {
            reject(new Error(`fetch failed ${status}: ${url}`));
            return;
          }
          resolve(Buffer.concat(chunks).toString("utf8"));
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

function cleanText(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .trim();
}

function normalizeInline(value: string | null | undefined): string {
  return cleanText(value).replace(/\s+/g, " ");
}

function htmlEscape(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function slug(value: string): string {
  const ascii = value
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
  return ascii || `item-${Date.now()}`;
}

function splitParagraphs(text: string): string[] {
  const blocked = [
    "문의:",
    "목록",
    "이전글",
    "다음글",
    "첨부파일",
    "담당부서",
    "만족도 조사",
    "성남시청이 창작한",
    "본 저작물은",
    "바로보기",
    "작성자",
    "작성일",
    "조회수",
    "첨부",
    "첨부파일",
    "자료관리부서",
    "이전글",
    "다음글",
    "목록보기",
    "미리보기",
    "다운로드",
    "붙임",
  ];
  const normalized = cleanText(text);
  let lines = normalized
    .split(/\n+/)
    .map((line) => normalizeInline(line))
    .filter(
      (line) =>
        line.length >= 18 &&
        !blocked.some((word) => line.startsWith(word)) &&
        !/내려받기\s*바로보기/.test(line) &&
        !/\.(hwpx?|jpe?g|png|pdf|webp)\b/i.test(line),
    );

  if (lines.length <= 2) {
    lines = normalized
      .replace(/\s+/g, " ")
      .split(/(?<=[.?!다”"]) /)
      .map((line) => normalizeInline(line))
      .filter(
        (line) =>
          line.length >= 18 &&
          !blocked.some((word) => line.startsWith(word)) &&
          !/\.(hwpx?|jpe?g|png|pdf|webp)\b/i.test(line),
      );
  }

  const result: string[] = [];
  for (const line of lines) {
    if (result.length >= 7) break;
    if (line.length <= 420) {
      result.push(line);
      continue;
    }
    let chunk = "";
    for (const sentence of line.split(/(?<=[.?!다”"]) /).filter(Boolean)) {
      if ((chunk + " " + sentence).trim().length > 320 && chunk) {
        result.push(chunk.trim());
        chunk = "";
        if (result.length >= 7) break;
      }
      chunk = `${chunk} ${sentence}`.trim();
    }
    if (chunk && result.length < 7) result.push(chunk);
  }
  return result.slice(0, 7);
}

function buildBody(params: {
  title: string;
  paragraphs: string[];
  source: string;
  sourceLabel: string;
  sourceUrl: string;
  imageUrl: string | null;
}): string {
  const parts = [
    "<div style=\"font-family:'맑은 고딕','Malgun Gothic',sans-serif;font-size:14px;line-height:1.8\">",
  ];
  if (params.imageUrl) {
    parts.push(
      `<p style="margin-bottom:1em"><img src="${htmlEscape(params.imageUrl)}" alt="${htmlEscape(
        params.title,
      )}" style="max-width:100%;height:auto" /></p>`,
    );
  }
  params.paragraphs.forEach((paragraph, index) => {
    const text = htmlEscape(paragraph);
    parts.push(
      `<p style="margin-bottom:1em">${index === 0 ? `<strong>${text}</strong>` : text}</p>`,
    );
  });
  parts.push(
    `<p style="margin-bottom:1em;color:#666;font-size:13px">자료: ${htmlEscape(
      params.source,
    )} / 원문: <a href="${htmlEscape(params.sourceUrl)}" target="_blank" rel="noopener noreferrer">${htmlEscape(
      params.sourceLabel,
    )}</a></p>`,
  );
  parts.push("</div>");
  return parts.join("");
}

function tagsFor(item: SourceItem, title: string): string[] {
  const tags = new Set([regionFor(item), item.source.replace(/\s*웹사이트.*/g, "")]);
  for (const token of title.split(/[,\s·'‘’"“”()]+/)) {
    if (token.length >= 3 && tags.size < 8) tags.add(token);
  }
  return [...tags].slice(0, 8);
}

function latestDateFromText(text: string): string | undefined {
  return text.match(/20\d{2}[./-]\d{2}[./-]\d{2}/)?.[0];
}

function regionFor(item: Pick<SourceItem, "type">): "경기" | "인천" {
  return item.type === "incheon" || item.type === "incheon_council" ? "인천" : "경기";
}

function stripLeadingDateTag(value: string): string {
  return normalizeInline(value).replace(/^\[?20\d{2}[./-]\d{1,2}[./-]\d{1,2}\.?\]?\s*/, "");
}

function elementTextWithBreaks(
  $: cheerio.CheerioAPI,
  selector: string,
  fallback = "",
): string {
  const el = $(selector).first().clone();
  if (!el.length) return cleanText(fallback);
  el.find("script, style").remove();
  el.find("br").replaceWith("\n");
  el.find("p, div, li").append("\n");
  return cleanText(el.text());
}

async function scanGnews(date: string): Promise<{ items: SourceItem[]; latest?: string }> {
  const d = dotDate(date);
  const url = `https://gnews.gg.go.kr/briefing/brief_gongbo.do?BS_CODE=s017&period_1=${d}&period_2=${d}&search=0&keyword=&subject_Code=BO01&page=1`;
  const html = await fetchText(url);
  const $ = cheerio.load(html);
  const items: SourceItem[] = [];
  $("a[href*='brief_gongbo_view.do']").each((_, el) => {
    const href = absoluteUrl($(el).attr("href"), url);
    const number = href.match(/[?&]number=(\d+)/)?.[1];
    if (!number || items.some((item) => item.key === `gnews-${number}`)) return;
    const rowText = normalizeInline($(el).closest("tr,li,div").text());
    if (!rowText.includes(d)) return;
    const title = normalizeInline($(el).text()) || rowText.replace(/^.*?\d+\s+/, "").split(d)[0].trim();
    items.push({
      key: `gnews-${number}`,
      type: "gnews",
      source: "경기도",
      sourceLabel: "경기도뉴스포털 보도자료",
      sourceUrl: href,
      listedTitle: title,
      listedDate: d,
    });
  });
  return { items, latest: latestDateFromText($.root().text()) };
}

async function scanIncheon(date: string): Promise<{ items: SourceItem[]; latest?: string }> {
  const url = "https://www.incheon.go.kr/IC010205";
  const html = await fetchText(url);
  const $ = cheerio.load(html);
  const items: SourceItem[] = [];
  $("a[href*='/IC010205/view']").each((_, el) => {
    const link = $(el);
    const href = absoluteUrl(link.attr("href"), url);
    const repSeq = href.match(/[?&]repSeq=([^&]+)/)?.[1];
    if (!repSeq || items.some((item) => item.key === `incheon-${repSeq}`)) return;
    const rowText = normalizeInline(link.text());
    if (!dateMatches(rowText, date)) return;
    const imageUrl = absoluteUrl(link.find("img").first().attr("src"), url);
    items.push({
      key: `incheon-${repSeq}`,
      type: "incheon",
      source: "인천광역시",
      sourceLabel: "인천광역시 보도자료",
      sourceUrl: href,
      listedTitle: normalizeInline(link.find(".subject").first().text()) || stripLeadingDateTag(rowText),
      listedDate: normalizeDateToken(rowText) || date,
      fallbackImageUrl: imageUrl || undefined,
      fallbackImageAlt: normalizeInline(link.find("img").first().attr("alt")),
    });
  });
  return { items, latest: latestDateFromText($.root().text()) };
}

async function scanIncheonCouncil(date: string): Promise<{ items: SourceItem[]; latest?: string }> {
  const url = "https://www.icouncil.go.kr/main/news/report.jsp";
  const html = await fetchText(url);
  const $ = cheerio.load(html);
  const items: SourceItem[] = [];
  $(".board_list a[href*='bbsMsgDetail.do']").each((_, el) => {
    const link = $(el);
    const href = absoluteUrl(link.attr("href"), url);
    const msgSeq = href.match(/[?&]msg_seq=([^&]+)/)?.[1];
    if (!msgSeq || items.some((item) => item.key === `incheon-council-${msgSeq}`)) return;
    const rowText = normalizeInline(link.closest("li").text() || link.closest("div").text());
    if (!dateMatches(rowText, date)) return;
    items.push({
      key: `incheon-council-${msgSeq}`,
      type: "incheon_council",
      source: "인천광역시의회",
      sourceLabel: "인천광역시의회 보도자료",
      sourceUrl: href,
      listedTitle: stripLeadingDateTag(link.text()).replace(/^new\s+/i, ""),
      listedDate: normalizeDateToken(rowText) || date,
    });
  });
  return { items, latest: latestDateFromText($.root().text()) };
}

async function scanSeongnam(date: string): Promise<{ items: SourceItem[]; latest?: string }> {
  const url = `https://www.seongnam.go.kr/city/1000060/30005/bbsList.do?post_size=50&currentPage=1&searchBeginDt=${date}&searchEndDt=${date}&searchSelect=all&searchWord=`;
  const html = await fetchText(url);
  const $ = cheerio.load(html);
  const items: SourceItem[] = [];
  $("tr, li").each((_, el) => {
    const row = $(el);
    const rowText = normalizeInline(row.text());
    if (!rowText.includes(date)) return;
    const idx =
      row.html()?.match(/dataView\(['"]?(\d+)['"]?\)/)?.[1] ||
      row.find("[onclick*='dataView']").attr("onclick")?.match(/dataView\(['"]?(\d+)['"]?\)/)?.[1];
    if (!idx || items.some((item) => item.key === `seongnam-${idx}`)) return;
    const title =
      normalizeInline(row.find("a, button, [onclick*='dataView']").first().text()) ||
      rowText.split(date)[0].replace(/^NEW\s*/, "").replace(/^\d+\s*/, "").trim();
    items.push({
      key: `seongnam-${idx}`,
      type: "seongnam",
      source: "성남시",
      sourceLabel: "성남시 보도자료",
      sourceUrl: `https://www.seongnam.go.kr/city/1000060/30005/bbsView.do?post_size=50&currentPage=1&idx=${idx}&searchBeginDt=${date}&searchEndDt=${date}&searchSelect=all&searchWord=`,
      listedTitle: title,
      listedDate: date,
    });
  });
  return { items, latest: latestDateFromText($.root().text()) };
}

async function scanSuwon(date: string): Promise<{ items: SourceItem[]; latest?: string }> {
  const url = "https://www.suwon.go.kr/web/board/BD_board.list.do?bbsCd=1043";
  const html = await fetchText(url);
  const $ = cheerio.load(html);
  const items: SourceItem[] = [];
  $("tr").each((_, el) => {
    const row = $(el);
    const rowText = normalizeInline(row.text());
    if (!dateMatches(rowText, date)) return;
    const link = row.find("a[onclick*='jsView']").first();
    const onclick = link.attr("onclick") || "";
    const match = onclick.match(/jsView\(['"]1043['"]\s*,\s*['"]([^'"]+)['"]/);
    const seq = match?.[1];
    if (!seq || items.some((item) => item.key === `suwon-${seq}`)) return;
    items.push({
      key: `suwon-${seq}`,
      type: "suwon",
      source: "수원특례시",
      sourceLabel: "수원특례시 보도자료",
      sourceUrl: `https://www.suwon.go.kr/web/board/BD_board.view.do?bbsCd=1043&seq=${encodeURIComponent(
        seq,
      )}`,
      listedTitle: normalizeInline(link.text()),
      listedDate: normalizeDateToken(rowText) || date,
    });
  });
  return { items, latest: latestDateFromText($.root().text()) };
}

async function scanHwaseong(date: string): Promise<{ items: SourceItem[]; latest?: string }> {
  const url =
    "https://www.hscity.go.kr/www/user/bbs/BD_selectBbsList.do?q_bbsCode=1051&q_rowPerPage=50&q_currPage=1";
  const html = await fetchText(url);
  const $ = cheerio.load(html);
  const items: SourceItem[] = [];
  $("a[href*='BD_selectBbs.do']").each((_, el) => {
    const link = $(el);
    const rowText = normalizeInline(link.closest("tr,li,div").text());
    if (!rowText.includes(date)) return;
    const href = absoluteUrl(link.attr("href"), url);
    const sn = href.match(/q_bbscttSn=([^&]+)/)?.[1] || slug(link.text());
    if (items.some((item) => item.key === `hwaseong-${sn}`)) return;
    items.push({
      key: `hwaseong-${sn}`,
      type: "hwaseong",
      source: "화성특례시",
      sourceLabel: "화성특례시 보도자료",
      sourceUrl: href,
      listedTitle: normalizeInline(link.text()),
      listedDate: date,
    });
  });
  return { items, latest: latestDateFromText($.root().text()) };
}

async function scanYongin(date: string): Promise<{ items: SourceItem[]; latest?: string }> {
  const url =
    "https://www.yongin.go.kr/user/bbs/BD_selectBbsList.do?q_bbsCode=1020&q_rowPerPage=50&q_currPage=1";
  const html = await fetchText(url);
  const $ = cheerio.load(html);
  const items: SourceItem[] = [];
  $("a[href*='BD_selectBbs.do']").each((_, el) => {
    const link = $(el);
    const rowText = normalizeInline(link.closest("tr,li,div").text());
    if (!rowText.includes(date)) return;
    const href = absoluteUrl(link.attr("href"), url);
    const sn = href.match(/q_bbscttSn=([^&]+)/)?.[1] || slug(link.text());
    if (items.some((item) => item.key === `yongin-${sn}`)) return;
    items.push({
      key: `yongin-${sn}`,
      type: "yongin",
      source: "용인특례시",
      sourceLabel: "용인특례시 보도자료",
      sourceUrl: href,
      listedTitle: normalizeInline(link.text()),
      listedDate: date,
    });
  });
  return { items, latest: latestDateFromText($.root().text()) };
}

async function scanGgc(date: string): Promise<{ items: SourceItem[]; latest?: string }> {
  const url =
    "https://www.ggc.go.kr/site/main/xb/lwmkr/lawmakerpressrelease?cp=1&listType=list&bcId=lawmakerpressrelease&baNotice=false&baCommSelec=false&baOpenDay=false&baUse=true";
  const html = await fetchText(url);
  const $ = cheerio.load(html);
  const items: SourceItem[] = [];
  $("a[href*='lawmakerpressrelease']").each((_, el) => {
    const link = $(el);
    const rowText = normalizeInline(link.closest("tr,li,div").text());
    if (!rowText.includes(date)) return;
    const href = absoluteUrl(link.attr("href"), url);
    const id = href.match(/lawmakerpressrelease\/(\d+)/)?.[1] || slug(link.text());
    if (items.some((item) => item.key === `ggc-${id}`)) return;
    items.push({
      key: `ggc-${id}`,
      type: "ggc",
      source: "경기도의회",
      sourceLabel: "경기도의회 보도자료",
      sourceUrl: href,
      listedTitle: normalizeInline(link.text()),
      listedDate: date,
    });
  });
  return { items, latest: latestDateFromText($.root().text()) };
}

async function scanSuwonCouncil(date: string): Promise<{ items: SourceItem[]; latest?: string }> {
  const url = "https://council.suwon.go.kr/kr/newsBBS.do?flag=all&list_style=&page=1&schwrd=";
  const html = await fetchText(url);
  const $ = cheerio.load(html);
  const items: SourceItem[] = [];
  $("tr").each((_, el) => {
    const row = $(el);
    const rowText = normalizeInline(row.text());
    if (!dateMatches(rowText, date)) return;
    const link = row.find("a[href*='newsBBSview.do']").first();
    const href = absoluteUrl(link.attr("href"), url);
    const uid = href.match(/[?&]uid=([^&]+)/)?.[1];
    if (!uid || items.some((item) => item.key === `suwon-council-${uid}`)) return;
    items.push({
      key: `suwon-council-${uid}`,
      type: "suwon_council",
      source: "수원특례시의회",
      sourceLabel: "수원특례시의회 보도자료",
      sourceUrl: href,
      listedTitle: stripLeadingDateTag(link.text()),
      listedDate: normalizeDateToken(rowText) || date,
    });
  });
  return { items, latest: latestDateFromText($.root().text()) };
}

async function scanYonginCouncil(date: string): Promise<{ items: SourceItem[]; latest?: string }> {
  const url =
    "https://council.yongin.go.kr/kr/pressBBS.do?begin_dt=&end_dt=&flag=all&list_style=&page=1&schwrd=&year=";
  const html = await fetchText(url);
  const $ = cheerio.load(html);
  const items: SourceItem[] = [];
  $("tr").each((_, el) => {
    const row = $(el);
    const rowText = normalizeInline(row.text());
    if (!dateMatches(rowText, date)) return;
    const link = row.find("a[href*='pressBBSview.do']").first();
    const href = absoluteUrl(link.attr("href"), url);
    const uid = href.match(/[?&]uid=([^&]+)/)?.[1];
    if (!uid || items.some((item) => item.key === `yongin-council-${uid}`)) return;
    items.push({
      key: `yongin-council-${uid}`,
      type: "yongin_council",
      source: "용인특례시의회",
      sourceLabel: "용인특례시의회 보도자료",
      sourceUrl: href,
      listedTitle: stripLeadingDateTag(link.text()),
      listedDate: normalizeDateToken(rowText) || date,
    });
  });
  return { items, latest: latestDateFromText($.root().text()) };
}

async function scanSeongnamCouncil(date: string): Promise<{ items: SourceItem[]; latest?: string }> {
  const url = "https://www.sncouncil.go.kr/kr/activity/bbsPress.do";
  const html = await fetchText(url);
  const $ = cheerio.load(html);
  const items: SourceItem[] = [];
  $("a[href*='reform=view'][href*='key=']").each((_, el) => {
    const link = $(el);
    const rowText = normalizeInline(link.closest("tr,li,div").text() || link.text());
    if (!dateMatches(rowText, date)) return;
    const href = absoluteUrl(link.attr("href"), url);
    const key = href.match(/[?&]key=([^&]+)/)?.[1];
    if (!key || items.some((item) => item.key === `seongnam-council-${key}`)) return;
    items.push({
      key: `seongnam-council-${key}`,
      type: "seongnam_council",
      source: "성남시의회",
      sourceLabel: "성남시의회 보도자료",
      sourceUrl: href,
      listedTitle: stripLeadingDateTag(link.text()).replace(/\s*20\d{2}[./-]\d{1,2}[./-]\d{1,2}\.?\s*$/, ""),
      listedDate: normalizeDateToken(rowText) || date,
    });
  });
  return { items, latest: latestDateFromText($.root().text()) };
}

async function scanHwaseongCouncil(date: string): Promise<{ items: SourceItem[]; latest?: string }> {
  const url = "https://council.hscity.go.kr/cnts/bbs/boardList.php?bbsCd=cns&bbsSubCd=cns03&pageNo=1";
  const html = await fetchText(url);
  const $ = cheerio.load(html);
  const items: SourceItem[] = [];
  $("tr").each((_, el) => {
    const row = $(el);
    const rowText = normalizeInline(row.text());
    if (!dateMatches(rowText, date)) return;
    const link = row.find("a[href*='goViewPage']").first();
    const sn = link.attr("href")?.match(/goViewPage\(['"]([^'"]+)['"]\)/)?.[1];
    if (!sn || items.some((item) => item.key === `hwaseong-council-${sn}`)) return;
    items.push({
      key: `hwaseong-council-${sn}`,
      type: "hwaseong_council",
      source: "화성특례시의회",
      sourceLabel: "화성특례시의회 보도자료",
      sourceUrl: `https://council.hscity.go.kr/cnts/bbs/boardView.php?bbsCd=cns&bbsSn=${encodeURIComponent(
        sn,
      )}&bbsSubCd=cns03&pageNo=1`,
      listedTitle: normalizeInline(link.text()),
      listedDate: normalizeDateToken(rowText) || date,
    });
  });
  return { items, latest: latestDateFromText($.root().text()) };
}

async function scanSources(date: string): Promise<{
  items: SourceItem[];
  exclusions: Array<{ source: string; reason: string; latest?: string }>;
}> {
  const scanners: Array<[string, () => Promise<{ items: SourceItem[]; latest?: string }>]> = [
    ["경기도뉴스포털", () => scanGnews(date)],
    ["인천광역시", () => scanIncheon(date)],
    ["인천광역시의회", () => scanIncheonCouncil(date)],
    ["성남시", () => scanSeongnam(date)],
    ["수원특례시", () => scanSuwon(date)],
    ["화성특례시", () => scanHwaseong(date)],
    ["용인특례시", () => scanYongin(date)],
    ["경기도의회", () => scanGgc(date)],
    ["수원특례시의회", () => scanSuwonCouncil(date)],
    ["용인특례시의회", () => scanYonginCouncil(date)],
    ["성남시의회", () => scanSeongnamCouncil(date)],
    ["화성특례시의회", () => scanHwaseongCouncil(date)],
  ];
  const items: SourceItem[] = [];
  const exclusions: Array<{ source: string; reason: string; latest?: string }> = [];
  for (const [name, scan] of scanners) {
    try {
      const result = await scan();
      items.push(...result.items);
      if (!result.items.length) {
        exclusions.push({ source: name, reason: `${date} 당일 공개자료 없음`, latest: result.latest });
      }
    } catch (error) {
      exclusions.push({
        source: name,
        reason: `스캔 실패: ${(error as Error).message}`,
      });
    }
  }
  return { items, exclusions };
}

function pickImage($: cheerio.CheerioAPI, base: string, includes: string[]): string | null {
  for (const el of $("img").toArray()) {
    const src = absoluteUrl($(el).attr("src"), base);
    if (src && includes.some((needle) => src.includes(needle))) return src;
  }
  return null;
}

function pickAttachmentImage($: cheerio.CheerioAPI, base: string): string | null {
  for (const el of $("a[href]").toArray()) {
    const link = $(el);
    const text = normalizeInline(link.text());
    const href = absoluteUrl(link.attr("href"), base);
    if ((/\.(jpe?g|png|webp|gif)\b/i.test(text) || /\.(jpe?g|png|webp|gif)(\?|$)/i.test(href)) && href) {
      return href;
    }
  }
  return null;
}

function pickHwaseongCouncilDownload($: cheerio.CheerioAPI, base: string): string | null {
  for (const el of $(".addfile a[href*='fileDownLoad']").toArray()) {
    const link = $(el);
    if (!/\.(jpe?g|png|webp|gif)\b/i.test(normalizeInline(link.text()))) continue;
    const match = link.attr("href")?.match(/fileDownLoad\(['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\)/);
    if (!match) continue;
    return absoluteUrl(`/cms/utl/FileDownLoad.php?flSn=${encodeURIComponent(match[1])}&flCd=${encodeURIComponent(match[2])}`, base);
  }
  return null;
}

export async function extractArticle(
  item: SourceItem,
  date: string,
  options: { mirrorAssets: boolean },
): Promise<ExtractedArticle> {
  const html = await fetchText(item.sourceUrl);
  const $ = cheerio.load(html);
  // 인라인 <script>/<style> 텍스트가 본문(pageText)에 섞여 들어오는 것을 차단.
  // (용인·경기 등 일부 소스는 본문 영역에 jQuery onready 스크립트가 포함됨)
  $("script, style, noscript").remove();
  const pageText = cleanText($.root().text());
  const titleFromMeta =
    normalizeInline($("meta[property='og:title']").attr("content")) ||
    normalizeInline($("title").text()).split("|")[0].trim();

  let title = item.listedTitle || titleFromMeta;
  let sourceDate = "";
  let body = "";
  let imageUrl: string | null = null;
  let summary = "";

  if (item.type === "gnews") {
    title = normalizeInline($(".brief_detail h3").first().text()) || titleFromMeta || title;
    sourceDate = normalizeInline($(".postinfo").text()).match(/\d{4}\.\d{2}\.\d{2}/)?.[0] || "";
    summary = normalizeInline($(".brief_detail .wrap > ul li").first().text().replace(/^○\s*/, ""));
    body = normalizeInline($(".postBody").last().text());
    imageUrl = pickImage($, item.sourceUrl, ["/OP_UPDATA/"]) || null;
  } else if (item.type === "incheon") {
    title =
      normalizeInline($(".board-view-title-wrap:not(.board-view-title-small) .board-view-title").first().text()) ||
      titleFromMeta ||
      title;
    sourceDate = normalizeDateToken($(".board-view-meta").text());
    summary = normalizeInline($(".board-view-title-small .board-view-title").first().text()).replace(/^-+\s*|\s*-+$/g, "");
    body = elementTextWithBreaks($, ".board-view-contents", pageText);
    imageUrl = pickImage($, item.sourceUrl, ["/comm/getImage?srvcId=ReportData"]) || null;
  } else if (item.type === "incheon_council") {
    title = normalizeInline($(".board_view .title h5").first().text()) || titleFromMeta || title;
    sourceDate = normalizeDateToken($(".board_view .data_list").first().text()) || item.listedDate;
    imageUrl =
      pickImage($, item.sourceUrl, ["/images/bbs/report/"]) ||
      pickAttachmentImage($, item.sourceUrl);
    body = elementTextWithBreaks($, ".board_view .detail", pageText);
  } else if (item.type === "seongnam") {
    title = normalizeInline(pageText.match(/제목\s+(.+?)\s+등록일/)?.[1]) || titleFromMeta || title;
    sourceDate = pageText.match(/등록일\s+(20\d{2}-\d{2}-\d{2})/)?.[1] || "";
    imageUrl = pickImage($, item.sourceUrl, ["/namoeditor/"]);
    const beforeLicense = pageText.split(/성남시청이 창작한/)[0] || pageText;
    const firstTitle = beforeLicense.indexOf(title);
    const secondTitle = firstTitle >= 0 ? beforeLicense.indexOf(title, firstTitle + title.length) : -1;
    body =
      secondTitle >= 0
        ? beforeLicense.slice(secondTitle + title.length)
        : beforeLicense.split(/첨부파일/).pop() || beforeLicense;
  } else if (item.type === "suwon") {
    title = normalizeInline($(".p-table__subject_text").first().text()) || titleFromMeta || title;
    sourceDate = normalizeDateToken($(".p-table__subject").first().text()) || normalizeDateToken($(".p-table").first().text());
    imageUrl = pickAttachmentImage($, item.sourceUrl);
    body = elementTextWithBreaks($, ".p-table__content.fulltext", pageText)
      .replace(/보도일시\s+20\d{2}[./-]\d{1,2}[./-]\d{1,2}\.?\([^)]+\)/, "")
      .replace(/담당부서\s+.+?담당공무원\s+[^\\n]+/, "");
  } else if (item.type === "hwaseong") {
    title = normalizeInline(pageText.match(/제목\s+(.+?)\s+담당부서/)?.[1]) || titleFromMeta || title;
    sourceDate = pageText.match(/등록일시\s+(20\d{2}-\d{2}-\d{2})/)?.[1] || "";
    body = pageText.match(/내용\s+([\s\S]+?)\s+첨부파일/)?.[1] || pageText;
    const imageLink = $("a[href*='ND_fileDownload.do']")
      .toArray()
      .map((el) => ({ text: normalizeInline($(el).text()), href: absoluteUrl($(el).attr("href"), item.sourceUrl) }))
      .find((link) => /\.(jpe?g|png|webp)/i.test(link.text) || /\.(jpe?g|png|webp)(\?|$)/i.test(link.href));
    imageUrl = imageLink?.href ?? pickImage($, item.sourceUrl, ["/webcontent/upload/"]);
  } else if (item.type === "yongin") {
    title = normalizeInline(pageText.match(/제목\s+(.+?)\s+부서명/)?.[1]) || titleFromMeta || title;
    sourceDate = pageText.match(/등록일자\s+(20\d{2}-\d{2}-\d{2})/)?.[1] || "";
    imageUrl = pickImage($, item.sourceUrl, ["/webcontent/upload/bbs/"]);
    body = pageText.split(/등록일자\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/).pop() || pageText;
    body = body.split(/본 저작물은|이전글|다음글|목록/)[0].trim().replace(/시\?도의원/g, "시·도의원");
  } else if (item.type === "ggc") {
    const viewText = cleanText($(".board_view").first().text()) || pageText;
    title = normalizeInline($(".board_view h4").first().text()) || normalizeInline(viewText.split(/\n/)[0]) || title;
    sourceDate = viewText.match(/등록일\s*:\s*(20\d{2}-\d{2}-\d{2})/)?.[1] || "";
    imageUrl = pickImage($, item.sourceUrl, ["/site/lwmkr/file/image/"]);
    body = (viewText.split(/바로듣기/).pop() || viewText).split(/목록/)[0].trim();
  } else if (
    item.type === "suwon_council" ||
    item.type === "yongin_council" ||
    item.type === "seongnam_council"
  ) {
    const viewText = cleanText($(".board_view").first().text()) || pageText;
    title = item.listedTitle || titleFromMeta || title;
    sourceDate = normalizeDateToken(viewText);
    imageUrl = pickImage($, item.sourceUrl, ["/attach/bbs/"]) || pickAttachmentImage($, item.sourceUrl);
    body = elementTextWithBreaks($, ".board_contents", viewText);
  } else if (item.type === "hwaseong_council") {
    title = normalizeInline($(".board_view .subject").first().text()) || titleFromMeta || title;
    sourceDate = normalizeDateToken($(".board_view .date").first().text());
    imageUrl = pickImage($, item.sourceUrl, ["/upload/board/cns03/"]) || pickHwaseongCouncilDownload($, item.sourceUrl);
    body = elementTextWithBreaks($, ".contentview", pageText);
  }

  if (!dateMatches(sourceDate, date)) {
    throw new Error(`당일 자료 아님: expected=${date}, actual=${sourceDate || "unknown"}`);
  }

  const sourceImage = imageUrl || item.fallbackImageUrl || null;
  if (!sourceImage) {
    throw new SkipArticleError("skip_no_image", "이미지 없는 자료 제외");
  }

  const effectiveImage = options.mirrorAssets
    ? await mirrorImage(sourceImage, `${date}/${item.key}`)
    : sourceImage;
  const paragraphs = splitParagraphs(body)
    .filter((paragraph) => !title.includes(paragraph) && !paragraph.includes(title))
    .slice(0, 7);
  const minParagraphs = item.type === "incheon_council" ? 1 : 3;
  if (paragraphs.length < minParagraphs) {
    throw new Error(`본문 추출 부족: ${paragraphs.length} paragraphs`);
  }
  if (summary && !paragraphs[0]?.includes(summary.slice(0, 18))) {
    paragraphs.unshift(summary);
  }

  const tags = tagsFor(item, title);
  const bodyText = paragraphs.join(" ").slice(0, 400);
  return {
    ...item,
    title,
    subtitle: (summary || paragraphs[0] || title).slice(0, 120),
    bodyHtml: buildBody({
      title,
      paragraphs,
      source: item.source,
      sourceLabel: item.sourceLabel,
      sourceUrl: item.sourceUrl,
      imageUrl: effectiveImage,
    }),
    bodyText,
    imageUrl: effectiveImage,
    sourceDate,
    tags,
  };
}

function mediaExt(contentType: string, url: string): string {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("gif")) return "gif";
  if (contentType.includes("webp")) return "webp";
  return url.match(/\.(png|gif|webp|jpe?g)(?:\?|$)/i)?.[1]?.replace("jpeg", "jpg") || "jpg";
}

async function mirrorImage(imageUrl: string | null, keyBase: string): Promise<string | null> {
  if (!imageUrl) return null;
  const {
    R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
    R2_BUCKET,
    R2_PUBLIC_BASE,
    NEXT_PUBLIC_MEDIA_BASE,
  } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
    return imageUrl;
  }
  try {
    const res = await fetch(imageUrl, { headers: { "User-Agent": UA }, cache: "no-store" });
    if (!res.ok) return imageUrl;
    const contentType = res.headers.get("content-type") || "image/jpeg";
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1000 || !contentType.startsWith("image/")) return imageUrl;
    const key = `data/external/gyeonggi-news/${slug(keyBase)}.${mediaExt(contentType, imageUrl)}`;
    const s3 = new S3Client({
      region: "auto",
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });
    await s3.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: buf,
        ContentType: contentType,
      }),
    );
    const base = (R2_PUBLIC_BASE || NEXT_PUBLIC_MEDIA_BASE || "").replace(/\/$/, "");
    return base ? `${base}/${key}` : imageUrl;
  } catch {
    return imageUrl;
  }
}

async function findExisting(article: ExtractedArticle, date: string): Promise<number | null> {
  const { start, end } = kstDateToRange(date);
  const [row] = await getDb()
    .select({ id: articles.id })
    .from(articles)
    .where(
      or(
        eq(articles.sourceUrl, article.sourceUrl),
        and(eq(articles.title, article.title), gte(articles.publishedAt, start), lt(articles.publishedAt, end)),
      ),
    )
    .limit(1);
  return row?.id ?? null;
}

function toNewArticle(article: ExtractedArticle, publishedAt: Date): Omit<NewArticle, "id"> {
  return {
    board: "news",
    title: article.title,
    subtitle: article.subtitle,
    reporterName: "경인블루저널",
    reporterEmail: null,
    section: "뉴스",
    region: regionFor(article),
    displaySlot: null,
    thumbnailUrl: article.imageUrl,
    bodyHtml: article.bodyHtml,
    bodyText: article.bodyText,
    source: article.source,
    sourceUrl: article.sourceUrl,
    tags: article.tags,
    viewCount: 0,
    status: "published",
    publishedAt,
    deletedAt: null,
    authorId: null,
  };
}

export async function runDailyGyeonggiNews(
  options: DailyGyeonggiNewsOptions = {},
): Promise<DailyGyeonggiNewsResult> {
  const date = options.date ?? todayKst();
  const dryRun = options.dryRun ?? false;
  const scannedAt = kstNowIso();
  const publishedAtTime = normalizePublishTime(options.publishedAtTime);
  const { items, exclusions } = await scanSources(date);
  const selected = typeof options.limit === "number" ? items.slice(0, options.limit) : items;
  const result: DailyGyeonggiNewsResult = {
    date,
    dryRun,
    scannedAt,
    publishedAtTime,
    scanned: selected.length,
    published: 0,
    skipped: 0,
    failed: 0,
    results: [],
    exclusions,
  };
  const publishedAt = new Date(`${date}T${publishedAtTime}:00+09:00`);

  for (const item of selected) {
    try {
      const article = await extractArticle(item, date, { mirrorAssets: !dryRun });
      const existingId = await findExisting(article, date);
      if (existingId) {
        result.skipped++;
        result.results.push({
          key: item.key,
          source: item.source,
          title: article.title,
          sourceUrl: item.sourceUrl,
          status: "skip_existing",
          id: existingId,
          url: `/news/${existingId}`,
        });
        continue;
      }
      if (dryRun) {
        result.results.push({
          key: item.key,
          source: item.source,
          title: article.title,
          sourceUrl: item.sourceUrl,
          status: "dry_run",
        });
        continue;
      }
      const id = await adminCreateArticle(toNewArticle(article, publishedAt));
      result.published++;
      result.results.push({
        key: item.key,
        source: item.source,
        title: article.title,
        sourceUrl: item.sourceUrl,
        status: "published",
        id,
        url: `/news/${id}`,
      });
    } catch (error) {
      if (error instanceof SkipArticleError) {
        result.skipped++;
        result.results.push({
          key: item.key,
          source: item.source,
          title: item.listedTitle,
          sourceUrl: item.sourceUrl,
          status: error.status,
          reason: error.message,
        });
        continue;
      }
      result.failed++;
      result.results.push({
        key: item.key,
        source: item.source,
        title: item.listedTitle,
        sourceUrl: item.sourceUrl,
        status: "failed",
        reason: (error as Error).message,
      });
    }
  }
  return result;
}
