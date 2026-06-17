// 로컬 이미지 미러(out/media/data) → Cloudflare R2 (구 /data 경로 보존)
// rclone 불필요 — @aws-sdk/client-s3(S3 호환)로 직접 업로드. 재실행 시 이미 올라간 파일은 건너뜀.
// 사전(env): R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
// 실행: node --env-file=.env infra/upload-to-r2.mjs   (또는 SRC 인자로 경로 지정)
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join, relative, sep, posix } from "node:path";

const SRC =
  process.argv[2] || "C:/Users/user/bluejournal-migration/out/media";
const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
const BUCKET = process.env.R2_BUCKET || "bluejournal-media";

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
  console.error(
    "ERROR: R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY 환경변수가 필요합니다.",
  );
  process.exit(1);
}

const dataDir = join(SRC, "data");
try {
  statSync(dataDir);
} catch {
  console.error(`ERROR: ${dataDir} 가 없습니다.`);
  process.exit(1);
}

const CT = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  webp: "image/webp", svg: "image/svg+xml", bmp: "image/bmp", ico: "image/x-icon",
  avif: "image/avif", mp4: "video/mp4", pdf: "application/pdf",
};
const ctOf = (f) =>
  CT[(f.split(".").pop() || "").toLowerCase()] || "application/octet-stream";

// out/media/data 하위 전체 파일 수집, _*.json(메타) 제외
function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (!name.startsWith("_") || !name.endsWith(".json"))
      acc.push({ path: p, size: st.size });
  }
  return acc;
}

const files = walk(dataDir);
const totalBytes = files.reduce((s, f) => s + f.size, 0);
console.log(
  `대상: ${files.length}파일, ${(totalBytes / 1048576).toFixed(0)}MB → r2:${BUCKET}/data`,
);

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

// key = SRC 기준 상대경로(POSIX 슬래시). 예: data/file/news/xxx.jpg
const keyOf = (abs) => relative(SRC, abs).split(sep).join(posix.sep);

let done = 0, uploaded = 0, skipped = 0, failed = 0;
const failures = [];

async function headExists(key, size) {
  try {
    const h = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return Number(h.ContentLength) === size; // 동일 크기면 이미 업로드된 것으로 간주
  } catch {
    return false;
  }
}

async function uploadOne(f) {
  const key = keyOf(f.path);
  if (await headExists(key, f.size)) {
    skipped++;
  } else {
    try {
      await s3.send(
        new PutObjectCommand({
          Bucket: BUCKET,
          Key: key,
          Body: readFileSync(f.path),
          ContentType: ctOf(f.path),
        }),
      );
      uploaded++;
    } catch (e) {
      failed++;
      failures.push(`${key}: ${e?.message ?? e}`);
    }
  }
  done++;
  if (done % 50 === 0 || done === files.length) {
    process.stdout.write(
      `\r진행 ${done}/${files.length} (업로드 ${uploaded}, 건너뜀 ${skipped}, 실패 ${failed})`,
    );
  }
}

// 동시성 풀
const CONCURRENCY = 16;
let idx = 0;
async function worker() {
  while (idx < files.length) {
    const f = files[idx++];
    await uploadOne(f);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

console.log(
  `\n완료: 업로드 ${uploaded} / 건너뜀 ${skipped} / 실패 ${failed} (총 ${files.length}).`,
);
if (failures.length) {
  console.log("실패 목록(최대 20):");
  failures.slice(0, 20).forEach((x) => console.log("  " + x));
  process.exit(1);
}
