import { readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";

const RSI_FINAL = "RSI_PASS";
const RUN_KEY = "gyeonggi-feature:2026-09-05";
const DRAFT_PATH =
  "docs/20260905_포천철원고속도로_경기현안심층특집_요약.txt";
const IMAGE_URL =
  "https://media.bluejournal.co.kr/data/features/2026/09/pocheon-cheorwon-expressway-feature-20260905.png";
const PRIMARY_SOURCE =
  "https://gnews.gg.go.kr/briefing/brief_gongbo_view.do?BS_CODE=s017&number=71407";

if (RSI_FINAL !== "RSI_PASS") {
  throw new Error("RSI_PASS 판정 전에는 발행할 수 없습니다.");
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
if (!process.env.CRON_SECRET) throw new Error("CRON_SECRET is required");

const raw = await readFile(DRAFT_PATH, "utf8");
const readField = (label) =>
  raw.match(new RegExp(`^${label}:\\s*(.+)$`, "m"))?.[1]?.trim() || "";
const title = readField("제목");
const subtitle = readField("부제");
const metaDescription = readField("메타 설명");
const bodyTextSource = raw
  .split("[본문]")[1]
  ?.split("[사진]")[0]
  ?.trim();
if (!title || !subtitle || !metaDescription || !bodyTextSource) {
  throw new Error("기사 필수 항목을 초안 파일에서 읽지 못했습니다.");
}

const escapeHtml = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const blocks = bodyTextSource.split(/\r?\n\s*\r?\n/).filter(Boolean);
const articleParts = [];
for (let index = 0; index < blocks.length; index += 1) {
  const block = blocks[index].trim();
  if (block.startsWith("■ ")) {
    articleParts.push(`<h2>${escapeHtml(block.slice(2))}</h2>`);
  } else {
    articleParts.push(`<p>${escapeHtml(block.replace(/\s*\r?\n\s*/g, " "))}</p>`);
  }
  if (index === 0) {
    articleParts.push(`
<figure>
  <img src="${IMAGE_URL}" alt="경기북부 산악 지역을 잇는 고속도로 구상을 표현한 항공 사진 형식의 자료 이미지">
  <figcaption>경기북부와 강원 접경권을 잇는 고속도로 구상을 상징해 제작한 자료 이미지. 실제 포천~철원 고속도로의 노선도나 공사 현장이 아닌 <strong>AI 생성 이미지</strong>다. 제작=경인블루저널</figcaption>
</figure>`);
  }
}

articleParts.push(`
<hr>
<h2>확인한 공식 원문</h2>
<ul>
  <li><a href="${PRIMARY_SOURCE}">경기도, 포천~철원 고속도로 예타 통과 관계기관 업무협약 발표(2026-09-04)</a></li>
  <li><a href="https://pimac.kdi.re.kr/study/fina_view.jsp?exmn_no=312">KDI 공공투자관리센터, 포천-철원 고속도로 재정사업 조사현황</a></li>
  <li><a href="https://www.law.go.kr/LSW/lsSideInfoP.do?docCls=jo&amp;joBrNo=00&amp;joNo=0002&amp;lsiSeq=269703&amp;urlMode=lsScJoRltInfoR">국가법령정보센터, 접경지역 지원 특별법 시행령 제2조</a></li>
  <li><a href="https://mois.go.kr/frt/sub/a06/b06/borderDev/screen.do">행정안전부, 접경권 발전 지원</a></li>
  <li><a href="https://gnews.gg.go.kr/briefing/brief_gongbo_view.do?BS_CODE=s003&amp;number=111136">포천시, 포천-철원 고속도로 예비타당성조사 대상 사업 선정(2025-04-30)</a></li>
  <li><a href="https://pimac.kdi.re.kr/study/study_view.jsp?classcd=F7&amp;pageNo=2&amp;pub_no=17181">KDI 공공투자관리센터, 예비타당성조사 수행을 위한 세부지침 일반부문 연구</a></li>
</ul>
<p><strong>경인블루저널 박용환 기자</strong></p>`);

const bodyHtml = articleParts.join("\n");
const bodyText = bodyTextSource.replace(/\s+/g, " ").trim();
const tags = [
  "경기현안심층특집",
  "주간특집",
  "경기도",
  "포천시",
  "철원군",
  "포천철원고속도로",
  "예비타당성조사",
  "접경지역",
  "균형발전",
  `feature-key:${RUN_KEY}`,
];

const imageCheck = await fetch(IMAGE_URL, { method: "HEAD" });
const imageType = imageCheck.headers.get("content-type") || "";
const imageBytes = Number(imageCheck.headers.get("content-length") || 0);
if (!imageCheck.ok || !imageType.startsWith("image/") || imageBytes < 1000) {
  throw new Error(
    `대표 이미지 검증 실패: ${imageCheck.status} ${imageType} ${imageBytes}`,
  );
}

const sql = neon(process.env.DATABASE_URL);
const duplicate = await sql`
  select id, status, title
  from articles
  where deleted_at is null
    and tags @> ${JSON.stringify([`feature-key:${RUN_KEY}`])}::jsonb
  limit 1
`;
if (duplicate.length) {
  console.log(
    JSON.stringify({
      duplicate: true,
      articleId: duplicate[0].id,
      status: duplicate[0].status,
      title: duplicate[0].title,
    }),
  );
  process.exit(0);
}

const inserted = await sql`
  insert into articles (
    board, title, subtitle, reporter_name, section, region, display_slot,
    thumbnail_url, body_html, body_text, source, source_url, tags, status,
    published_at, meta_description, og_image, created_at, updated_at
  )
  select
    'news', ${title}, ${subtitle}, '경인블루저널 박용환', '특집', '경기',
    '헤드라인', ${IMAGE_URL}, ${bodyHtml}, ${bodyText},
    '경기도·KDI·행정안전부·국가법령정보센터·포천시 공식자료',
    ${PRIMARY_SOURCE}, ${JSON.stringify(tags)}::jsonb, 'scheduled', now(),
    ${metaDescription}, ${IMAGE_URL}, now(), now()
  where not exists (
    select 1 from articles
    where deleted_at is null
      and tags @> ${JSON.stringify([`feature-key:${RUN_KEY}`])}::jsonb
  )
  returning id
`;
if (!inserted.length) throw new Error("동시 실행 중 중복 방지로 삽입되지 않았습니다.");

const articleId = Number(inserted[0].id);
const siteBase = (process.env.NEXT_PUBLIC_SITE_URL || "https://bluejournal.co.kr").replace(
  /\/$/,
  "",
);
const publish = await fetch(`${siteBase}/api/cron/publish-scheduled`, {
  headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  cache: "no-store",
});
const publishBody = await publish.json().catch(() => ({}));
if (!publish.ok || !publishBody.ids?.includes(articleId)) {
  throw new Error(
    `예약발행 승격 실패: ${publish.status} ${JSON.stringify(publishBody)}`,
  );
}

console.log(
  JSON.stringify({
    duplicate: false,
    articleId,
    articleUrl: `${siteBase}/news/${articleId}`,
    imageUrl: IMAGE_URL,
    rsi: RSI_FINAL,
    cronPublished: publishBody,
  }),
);
