// 업로드 이미지 목록(미디어 라이브러리) — R2 data/uploads/ 의 관리자 업로드 이미지.
import { getSession } from "@/lib/auth";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

export const runtime = "nodejs";

export async function GET() {
  if (!(await getSession())) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const {
    R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
    R2_BUCKET,
    R2_PUBLIC_BASE,
  } = process.env;

  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
    return Response.json({ error: "R2 미설정" }, { status: 503 });
  }

  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
  const base = (R2_PUBLIC_BASE || "").replace(/\/$/, "");

  try {
    const out = await s3.send(
      new ListObjectsV2Command({
        Bucket: R2_BUCKET,
        Prefix: "data/uploads/",
        MaxKeys: 200,
      }),
    );
    const items = (out.Contents ?? [])
      .filter((o) => o.Key && (o.Size ?? 0) > 0)
      .sort(
        (a, b) =>
          (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0),
      )
      .map((o) => ({
        key: o.Key!,
        url: `${base}/${o.Key}`,
        size: o.Size ?? 0,
      }));
    return Response.json({ items });
  } catch (e) {
    return Response.json(
      { error: `목록 조회 실패: ${(e as Error).message}` },
      { status: 502 },
    );
  }
}
