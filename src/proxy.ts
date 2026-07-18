import { NextResponse, type NextRequest } from "next/server";

const LEGACY_ROOT_KEYS = new Set([
  "bo_table",
  "me_id",
  "me_code",
  "device",
  "no",
  "fn",
  "url",
  "type",
]);

function cleanRedirect(request: NextRequest, pathname: string) {
  const destination = request.nextUrl.clone();
  destination.pathname = pathname;
  destination.search = "";
  return NextResponse.redirect(destination, 301);
}

function hasOnlyLegacyRootQuery(searchParams: URLSearchParams): boolean {
  const entries = [...searchParams.entries()];
  return (
    entries.length > 0 &&
    entries.every(([rawKey, value]) => {
      const key = rawKey.toLowerCase();
      return LEGACY_ROOT_KEYS.has(key) || (key === "page" && value === "1");
    })
  );
}

function hasValidNewsBoard(searchParams: URLSearchParams): boolean {
  const boards = searchParams.getAll("bo_table");
  return boards.length === 0 || (boards.length === 1 && boards[0] === "news");
}

export function proxy(request: NextRequest) {
  const { pathname, search, searchParams } = request.nextUrl;
  const newsMatch = pathname.match(/^\/news\/(\d+)$/);

  if (newsMatch && search) {
    return cleanRedirect(request, `/news/${newsMatch[1]}`);
  }

  if (pathname === "/") {
    const articleIds = searchParams.getAll("wr_id");
    if (
      articleIds.length === 1 &&
      /^\d+$/.test(articleIds[0]) &&
      hasValidNewsBoard(searchParams)
    ) {
      const articleId = Number(articleIds[0]);
      if (Number.isSafeInteger(articleId) && articleId > 0) {
        return cleanRedirect(request, `/news/${articleId}`);
      }
    }

    if (hasOnlyLegacyRootQuery(searchParams)) {
      return cleanRedirect(request, "/");
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/news/:path*"],
};
