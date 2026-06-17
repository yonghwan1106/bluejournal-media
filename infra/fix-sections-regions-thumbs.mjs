// 일회성 데이터 보정 (seed/articles.json) → 이후 load-seed.mjs 로 Neon 동기화.
//   1) 특집(me_id=8)·탐사문학(me_id=41) 분류 복원 (넷프로 카테고리 목록 크롤 결과)
//   2) '서울' 지역 제거 → 제목 기반 재분류(인천/경기/없음, 서울 규칙 삭제)
//   3) R2 에 없는(원본 404) 썸네일 → null (깨진 이미지 표시 방지, 특히 인천)
// 실행: node --env-file=.env infra/fix-sections-regions-thumbs.mjs
import { readFileSync, writeFileSync } from "node:fs";

const SEED = "C:/Users/user/bluejournal-web/seed/articles.json";
const seed = JSON.parse(readFileSync(SEED, "utf8"));

// 넷프로 .art_list_all 카테고리 목록에서 추출 (겹침 3건 508/516/521 → 더 구체적인 탐사문학)
const TAMSA = new Set([262, 279, 283, 361, 374, 411, 435, 451, 473, 508, 516, 521, 635]);
const TEUKJIP = new Set([
  205, 206, 210, 211, 226, 227, 481, 519, 520, 656, 686, 703, 732, 743, 766,
]);

// 지역 재추론 (서울 규칙 제거: 인천 → 경기도시 → 없음)
const GG =
  "수원 용인 성남 화성 평택 안산 안양 부천 남양주 의정부 파주 김포 광명 군포 오산 이천 양주 구리 안성 포천 의왕 여주 동두천 과천 고양 시흥 하남 양평 가평 연천 경기".split(
    " ",
  );
function regionNoSeoul(title) {
  if (/인천/.test(title)) return "인천";
  if (GG.some((c) => title.includes(c))) return "경기";
  return null;
}

const R2 = "https://pub-7291d19762d244e6b24f70df8a74bcd5.r2.dev";
const RE = /bluejournal\.co\.kr(\/data\/.*)/i;
async function thumbAlive(url) {
  const m = url && url.match(RE);
  if (!m) return true; // 외부/없음 → 유지
  try {
    const r = await fetch(R2 + m[1], { method: "HEAD" });
    return r.status === 200;
  } catch {
    return true; // 네트워크 오류 시 보수적으로 유지
  }
}

let sec = 0,
  reg = 0,
  thumb = 0;

// 1·2) 섹션 + 지역 (동기)
for (const a of seed) {
  if (TAMSA.has(a.id)) {
    if (a.section !== "탐사문학") (a.section = "탐사문학"), sec++;
  } else if (TEUKJIP.has(a.id)) {
    if (a.section !== "특집") (a.section = "특집"), sec++;
  }
  if (a.region === "서울") {
    a.region = regionNoSeoul(a.title || "");
    reg++;
  }
}

// 3) 깨진 로컬 썸네일 → null (R2 HEAD 동시검사)
const local = seed.filter((a) => a.thumbnailUrl && RE.test(a.thumbnailUrl));
let idx = 0;
async function worker() {
  while (idx < local.length) {
    const a = local[idx++];
    if (!(await thumbAlive(a.thumbnailUrl))) {
      a.thumbnailUrl = null;
      thumb++;
    }
  }
}
await Promise.all(Array.from({ length: 24 }, worker));

writeFileSync(SEED, JSON.stringify(seed, null, 2));
console.log(
  `완료: 섹션변경 ${sec} (특집 ${[...TEUKJIP].length}+탐사 ${[...TAMSA].length}), ` +
    `서울→재분류 ${reg}, 깨진썸네일 null ${thumb} (로컬썸네일 ${local.length}건 검사).`,
);
