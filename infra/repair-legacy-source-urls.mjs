// 레거시 /bbs/link.php source_url을 기사 본문의 실제 외부 원문 URL로 복구한다.
// 기본은 dry-run: node --env-file=.env infra/repair-legacy-source-urls.mjs
// 실제 반영:      node --env-file=.env infra/repair-legacy-source-urls.mjs --apply
import { neon } from "@neondatabase/serverless";

const args = process.argv.slice(2);
const unknownArgs = args.filter((arg) => arg !== "--apply");
if (unknownArgs.length) {
  console.error(`알 수 없는 인자: ${unknownArgs.join(", ")}`);
  process.exit(1);
}

const apply = args.includes("--apply");
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("ERROR: DATABASE_URL 환경변수가 필요합니다.");
  process.exit(1);
}

// 운영 감사에서 실제 외부 상세 URL을 하나로 확정할 수 없었던 기사.
const KNOWN_AMBIGUOUS_IDS = new Set([278, 434]);

function normalizedHostname(hostname) {
  return hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
}

function isBluejournalHost(hostname) {
  const host = normalizedHostname(hostname);
  return host === "bluejournal.co.kr" || host.endsWith(".bluejournal.co.kr");
}

function isPrivateHost(hostname) {
  const host = normalizedHostname(hostname);
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

function parsedHttpUrl(candidate) {
  try {
    const parsed = new URL(candidate.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (parsed.username || parsed.password) return null;
    if (isBluejournalHost(parsed.hostname) || isPrivateHost(parsed.hostname)) return null;
    // 기관·뉴스 포털의 일반 홈페이지는 해당 기사의 원문 근거가 아니므로 자동 복구하지 않는다.
    if (parsed.pathname === "/" || parsed.pathname === "") return null;

    const url = parsed.toString();
    return url.length <= 1000 ? url : null;
  } catch {
    return null;
  }
}

function isLegacyBluejournalLink(candidate) {
  try {
    const parsed = new URL(candidate);
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      isBluejournalHost(parsed.hostname) &&
      parsed.pathname.toLowerCase() === "/bbs/link.php"
    );
  } catch {
    return false;
  }
}

function decodeHref(value) {
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

function htmlHrefs(html) {
  const hrefs = [];
  const pattern = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi;
  let match;
  while ((match = pattern.exec(html ?? "")) !== null) {
    hrefs.push(decodeHref(match[1] ?? match[2] ?? match[3] ?? ""));
  }
  return hrefs;
}

function textUrls(text) {
  return (text?.match(/https?:\/\/[^\s<>"']+/gi) ?? []).map((url) =>
    url.replace(/[),.;!?\]}]+$/g, ""),
  );
}

function firstExternalSource(row) {
  // 본문 원문 링크가 가장 구체적이므로 source 텍스트보다 우선한다.
  for (const [origin, candidates] of [
    ["bodyHtml", htmlHrefs(row.body_html)],
    ["source", textUrls(row.source)],
  ]) {
    for (const candidate of candidates) {
      const url = parsedHttpUrl(candidate);
      if (url) return { url, origin };
    }
  }
  return null;
}

const sql = neon(databaseUrl);
const candidates = await sql`
  SELECT id, source_url, source, body_html
  FROM articles
  WHERE status = 'published'
    AND deleted_at IS NULL
    AND source_url IS NOT NULL
    AND lower(source_url) LIKE '%bluejournal.co.kr/bbs/link.php%'
  ORDER BY id
`;
const targets = candidates.filter((row) => isLegacyBluejournalLink(row.source_url));

console.log(`${apply ? "APPLY" : "DRY-RUN"}: 대상 ${targets.length}건`);

let planned = 0;
let updated = 0;
let skipped = 0;
let conflicts = 0;

for (const row of targets) {
  if (KNOWN_AMBIGUOUS_IDS.has(row.id)) {
    skipped++;
    console.log(`SKIP id=${row.id} reason=known-ambiguous before=${row.source_url}`);
    continue;
  }

  const replacement = firstExternalSource(row);
  if (!replacement) {
    skipped++;
    console.log(`SKIP id=${row.id} reason=no-safe-detail-url before=${row.source_url}`);
    continue;
  }

  planned++;
  console.log(
    `${apply ? "UPDATE" : "PLAN"} id=${row.id} origin=${replacement.origin}\n` +
      `  before=${row.source_url}\n` +
      `  after=${replacement.url}`,
  );

  if (!apply) continue;

  // 변경 전 상태를 revision으로 남기고, 감사 이후 값이 바뀐 행은 덮어쓰지 않는
  // 행 단위 원자적(CTE) optimistic UPDATE.
  const result = await sql`
    WITH current_article AS (
      SELECT *
      FROM articles
      WHERE id = ${row.id}
        AND status = 'published'
        AND deleted_at IS NULL
        AND source_url = ${row.source_url}
      FOR UPDATE
    ), saved_revision AS (
      INSERT INTO article_revisions (article_id, title, snapshot)
      SELECT
        id,
        title,
        jsonb_build_object(
          'title', title,
          'subtitle', subtitle,
          'reporterName', reporter_name,
          'section', section,
          'region', region,
          'displaySlot', display_slot,
          'thumbnailUrl', thumbnail_url,
          'bodyHtml', body_html,
          'bodyText', body_text,
          'source', source,
          'sourceUrl', source_url,
          'tags', tags,
          'status', status
        )
      FROM current_article
      RETURNING article_id
    ), updated_article AS (
      UPDATE articles AS article
      SET source_url = ${replacement.url}, updated_at = now()
      FROM saved_revision
      WHERE article.id = saved_revision.article_id
        AND article.status = 'published'
        AND article.deleted_at IS NULL
        AND article.source_url = ${row.source_url}
      RETURNING article.id
    )
    SELECT id FROM updated_article
  `;
  if (result.length === 1) {
    updated++;
  } else {
    conflicts++;
    console.warn(`CONFLICT id=${row.id} reason=source-url-changed-or-row-ineligible`);
  }
}

console.log(
  `SUMMARY mode=${apply ? "apply" : "dry-run"} target=${targets.length} planned=${planned} ` +
    `updated=${updated} skipped=${skipped} conflicts=${conflicts}`,
);
