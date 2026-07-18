import { getArticle, type SeedArticle } from "@/lib/articles";

type BbsRouteContext = {
  params: Promise<{ path: string[] }>;
};

const LEGACY_ARTICLE_FILES = new Set(["board.php", "print.php"]);

function legacyArticleId(searchParams: URLSearchParams): number | null {
  const values = searchParams.getAll("wr_id");
  if (values.length !== 1 || !/^\d+$/.test(values[0])) return null;

  const id = Number(values[0]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function hasValidNewsBoard(searchParams: URLSearchParams): boolean {
  const boards = searchParams.getAll("bo_table");
  return boards.length === 0 || (boards.length === 1 && boards[0] === "news");
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    return true;
  }

  const ipv4 = host.split(".").map(Number);
  if (ipv4.length === 4 && ipv4.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
    const [a, b] = ipv4;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }

  return (
    host === "::" ||
    host === "::1" ||
    host.startsWith("fc") ||
    host.startsWith("fd") ||
    /^fe[89ab]/.test(host)
  );
}

function safeExternalUrl(candidate: string): string | null {
  try {
    const parsed = new URL(candidate.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (parsed.username || parsed.password) return null;

    const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
    if (
      hostname === "bluejournal.co.kr" ||
      hostname.endsWith(".bluejournal.co.kr") ||
      isPrivateHost(hostname)
    ) {
      return null;
    }
    const genericHomePaths = new Set(["/", "/index.do", "/index.html", "/index.php"]);
    if (genericHomePaths.has(parsed.pathname.toLowerCase()) && !parsed.search && !parsed.hash) {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

function decodeHref(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&#0*38;/gi, "&")
    .replace(/&#x0*26;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*34;/gi, '"')
    .replace(/&#x0*22;/gi, '"')
    .replace(/&#0*39;/gi, "'")
    .replace(/&#x0*27;/gi, "'");
}

function textUrls(value: string | null): string[] {
  if (!value) return [];
  return (value.match(/https?:\/\/[^\s<>"']+/gi) ?? []).map((url) =>
    url.replace(/[),.;!?\]}]+$/g, ""),
  );
}

function htmlHrefs(value: string): string[] {
  const hrefs: string[] = [];
  const pattern = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value)) !== null) {
    hrefs.push(decodeHref(match[1] ?? match[2] ?? match[3] ?? ""));
  }
  return hrefs;
}

function articleSourceUrl(article: SeedArticle): string | null {
  const candidates = [
    ...htmlHrefs(article.bodyHtml),
    ...textUrls(article.source),
    ...(article.sourceUrl ? [article.sourceUrl] : []),
  ];

  for (const candidate of candidates) {
    const url = safeExternalUrl(candidate);
    if (url) return url;
  }
  return null;
}

function redirect(location: string): Response {
  return new Response(null, { status: 301, headers: { Location: location } });
}

function gone(headOnly: boolean): Response {
  return new Response(headOnly ? null : "Gone", {
    status: 410,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Robots-Tag": "noindex",
    },
  });
}

async function handleBbsRequest(
  request: Request,
  context: BbsRouteContext,
  headOnly: boolean,
): Promise<Response> {
  const { path } = await context.params;
  const file = path.length === 1 ? path[0].toLowerCase() : "";
  const requestUrl = new URL(request.url);
  const articleId = legacyArticleId(requestUrl.searchParams);
  const validNewsBoard = hasValidNewsBoard(requestUrl.searchParams);

  if (LEGACY_ARTICLE_FILES.has(file) && articleId !== null && validNewsBoard) {
    return redirect(new URL(`/news/${articleId}`, requestUrl.origin).toString());
  }

  if (file === "link.php" && articleId !== null && validNewsBoard) {
    const article = await getArticle(articleId);
    const sourceUrl = article ? articleSourceUrl(article) : null;
    return sourceUrl ? redirect(sourceUrl) : gone(headOnly);
  }

  return gone(headOnly);
}

export function GET(request: Request, context: BbsRouteContext) {
  return handleBbsRequest(request, context, false);
}

export function HEAD(request: Request, context: BbsRouteContext) {
  return handleBbsRequest(request, context, true);
}
