// 깨진(null) 썸네일을 같은 기사 본문의 살아있는(R2 200) 이미지로 복구.
// 원인: ogImage 가 삭제된 /data/file/news/... 경로를 가리켰으나 실제 사진은
//       /data/file/pedian/... 에 존재(이미 R2 업로드됨). 본문 이미지 중 200 인 것을 썸네일로.
// 실행: node --env-file=.env infra/recover-thumbnails.mjs
import { readFileSync, writeFileSync } from "node:fs";

const SEED = "C:/Users/user/bluejournal-web/seed/articles.json";
const ARTDIR = "C:/Users/user/bluejournal-migration/out/news/articles";
const SITE = "http://www.bluejournal.co.kr";
const R2 = "https://pub-7291d19762d244e6b24f70df8a74bcd5.r2.dev";

const seed = JSON.parse(readFileSync(SEED, "utf8"));

async function r2ok(path) {
  try {
    return (await fetch(R2 + path, { method: "HEAD" })).status === 200;
  } catch {
    return false;
  }
}
function pathOf(src) {
  if (!src) return null;
  if (src.startsWith("/")) return src.match(/\/data\/.*/)?.[0] || null;
  const m = src.match(/bluejournal\.co\.kr(\/data\/.*)/i);
  return m ? m[1] : null;
}

const targets = seed.filter((a) => !a.thumbnailUrl);
let idx = 0,
  recovered = 0;

async function worker() {
  while (idx < targets.length) {
    const a = targets[idx++];
    let images = [];
    try {
      const j = JSON.parse(readFileSync(`${ARTDIR}/${a.id}.json`, "utf8"));
      images = (j.images || []).filter((im) => im.local).map((im) => im.src);
    } catch {}
    // 작은 thumb- 변형 우선(썸네일에 적합)
    images.sort(
      (x, y) => (/thumb-/.test(y) ? 1 : 0) - (/thumb-/.test(x) ? 1 : 0),
    );
    for (const src of images) {
      const p = pathOf(src);
      if (!p) continue;
      if (await r2ok(p)) {
        a.thumbnailUrl = SITE + p; // raw URL → media.ts 가 런타임에 R2 로 변환
        recovered++;
        break;
      }
    }
  }
}

await Promise.all(Array.from({ length: 20 }, worker));
writeFileSync(SEED, JSON.stringify(seed, null, 2));
console.log(
  `썸네일 복구: ${recovered}/${targets.length} (null 썸네일 기사 중). ` +
    `나머지 ${targets.length - recovered}건은 살아있는 본문 이미지 없음.`,
);
