// 인천광역시 공식 보도자료(공공누리) → 경인블루저널 인천 섹션 인제스트.
// 소스: https://www.incheon.go.kr/IC010205 (서버렌더). 사진 있는 최신 N건만, 출처 표기.
// id = repSeq 숫자(≈1500만대) → 넷프로 wr_id(<1000)·관리자 시퀀스와 비충돌.
// 실행: node --env-file=.env infra/ingest-incheon-news.mjs
import * as cheerio from "cheerio";
import { readFileSync, writeFileSync } from "node:fs";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { neon } from "@neondatabase/serverless";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const BASE = "https://www.incheon.go.kr";
const LIST = `${BASE}/IC010205`;
const SEED = "C:/Users/user/bluejournal-web/seed/articles.json";
const RAW = "http://www.bluejournal.co.kr"; // 썸네일 raw 규약 → media.ts 가 R2 로 변환
const WANT = Number(process.env.WANT || 10);

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
const sql = neon(process.env.DATABASE_URL);

async function fetchList() {
  const items = [];
  for (let page = 1; page <= 3 && items.length < 25; page++) {
    const html = await (
      await fetch(`${LIST}?curPage=${page}`, { headers: { "User-Agent": UA } })
    ).text();
    const $ = cheerio.load(html);
    $("a[href*='repSeq']").each((i, el) => {
      const m = ($(el).attr("href") || "").match(/repSeq=(DOM_\d+)/);
      if (!m || items.find((x) => x.repSeq === m[1])) return;
      const dateM = $(el).closest("li,tr,div").text().match(/20\d{2}[-.]\d{1,2}[-.]\d{1,2}/);
      items.push({ repSeq: m[1], date: dateM ? dateM[0].replace(/\./g, "-") : null });
    });
  }
  return items;
}

async function fetchDetail(repSeq, listDate) {
  const url = `${LIST}/view?repSeq=${repSeq}&curPage=1`;
  const html = await (await fetch(url, { headers: { "User-Agent": UA } })).text();
  const $ = cheerio.load(html);
  const title = ($("title").text() || "").split("|")[0].trim();
  const body = $(".cms_content, .board-view-contents").first();
  // 이미지(getImage ReportData)는 본문 안에 있으므로 정리 '전'에 먼저 추출
  let img = null;
  $("img").each((i, el) => {
    const sCss = $(el).attr("src") || "";
    if (/getImage\?srvcId=ReportData/i.test(sCss) && !img)
      img = sCss.startsWith("/") ? BASE + sCss : sCss;
  });
  // 본문 내 incheon 이미지/스크립트 제거(깨짐·핫링크 방지). 텍스트/문단 유지.
  body.find("img, script, style").remove();
  const bodyInner = (body.html() || "").trim();
  const bodyText = body.text().replace(/\s+/g, " ").trim();
  const dm =
    $("body").text().match(/(?:등록일|작성일|배포일)[^0-9]*(20\d{2}[-.]\d{1,2}[-.]\d{1,2})/);
  const date = (dm ? dm[1] : listDate || "").replace(/\./g, "-");
  return { url, title, bodyInner, bodyText, img, date };
}

async function uploadImage(getImageUrl) {
  const r = await fetch(getImageUrl, { headers: { "User-Agent": UA } });
  if (!r.ok) return null;
  const ct = r.headers.get("content-type") || "image/jpeg";
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 1000) return null; // 깨진/빈 이미지 방지
  const fileNo = (getImageUrl.match(/fileNo=([A-Za-z0-9_]+)/) || [])[1] || `img${Date.now()}`;
  const ext = ct.includes("png") ? "png" : ct.includes("gif") ? "gif" : "jpg";
  const key = `data/external/incheon/${fileNo}.${ext}`;
  await s3.send(
    new PutObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key, Body: buf, ContentType: ct }),
  );
  return key;
}

function toArticle(d, key) {
  const id = Number((d.repSeqNum));
  const attribution =
    `<p style="margin-top:1.5rem;color:#888;font-size:0.9em">※ 본 기사는 인천광역시 보도자료를 바탕으로 작성되었습니다. ` +
    `출처: <a href="${d.url}" target="_blank" rel="noopener">인천광역시</a></p>`;
  const photo = `<p><img src="${RAW}/${key}" alt="${d.title.replace(/"/g, "")}" /></p>`;
  return {
    id,
    board: "news",
    title: d.title,
    subtitle: null,
    reporterName: "경인블루저널",
    reporterEmail: null,
    section: "뉴스",
    region: "인천",
    displaySlot: null,
    thumbnailUrl: `${RAW}/${key}`,
    bodyHtml: photo + d.bodyInner + attribution,
    bodyText: d.bodyText.slice(0, 400) || null,
    source: "인천광역시",
    sourceUrl: d.url,
    tags: ["인천", "인천광역시", "보도자료"],
    viewCount: 0,
    status: "published",
    publishedAt: `${d.date}T09:00:00+09:00`,
  };
}

// ───── main ─────
const list = await fetchList();
console.log(`목록 ${list.length}건. 사진 있는 최신 ${WANT}건 수집...`);
const picked = [];
for (const it of list) {
  if (picked.length >= WANT) break;
  const d = await fetchDetail(it.repSeq, it.date);
  if (!d.img || !d.bodyText || d.bodyText.length < 60) continue; // 사진+본문 필수
  const key = await uploadImage(d.img);
  if (!key) continue; // 사진 업로드 실패 시 제외(사진 필수)
  d.repSeqNum = (it.repSeq.match(/DOM_0*(\d+)/) || [])[1];
  picked.push(toArticle(d, key));
  console.log(`  ✓ #${picked.length} [${d.date}] ${d.title.slice(0, 40)}`);
}

if (!picked.length) {
  console.error("수집된 기사 없음.");
  process.exit(1);
}

// seed 갱신(동일 id 제거 후 추가)
const seed = JSON.parse(readFileSync(SEED, "utf8"));
const ids = new Set(picked.map((a) => a.id));
const merged = seed.filter((a) => !ids.has(a.id)).concat(picked);
writeFileSync(SEED, JSON.stringify(merged, null, 2));

// Neon insert (ON CONFLICT, setval 안 함 — 외부 고id가 관리자 시퀀스에 영향 X)
const cols = [
  "id", "board", "title", "subtitle", "reporter_name", "reporter_email",
  "section", "region", "display_slot", "thumbnail_url", "body_html",
  "body_text", "source", "source_url", "tags", "view_count", "status", "published_at",
];
for (const a of picked) {
  const ph = cols.map((c, i) =>
    c === "tags" ? `$${i + 1}::jsonb` : c === "published_at" ? `$${i + 1}::timestamptz` : `$${i + 1}`,
  );
  await sql.query(
    `INSERT INTO articles (${cols.join(",")}) VALUES (${ph.join(",")}) ` +
      `ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, body_html=EXCLUDED.body_html, ` +
      `thumbnail_url=EXCLUDED.thumbnail_url, section=EXCLUDED.section, region=EXCLUDED.region, ` +
      `source=EXCLUDED.source, source_url=EXCLUDED.source_url, published_at=EXCLUDED.published_at`,
    [a.id, a.board, a.title, a.subtitle, a.reporterName, a.reporterEmail, a.section, a.region,
     a.displaySlot, a.thumbnailUrl, a.bodyHtml, a.bodyText, a.source, a.sourceUrl,
     JSON.stringify(a.tags), a.viewCount, a.status, a.publishedAt],
  );
}
console.log(`\n완료: ${picked.length}건 인천 보도자료 인제스트(seed + Neon).`);
