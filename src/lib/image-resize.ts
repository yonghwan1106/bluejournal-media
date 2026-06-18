/**
 * 업로드 전 이미지 축소(브라우저 전용).
 *
 * Vercel 서버리스 함수는 요청 본문이 4.5MB 를 넘으면 함수 실행 전에 413
 * (FUNCTION_PAYLOAD_TOO_LARGE)으로 차단한다. 스마트폰 원본 사진(5~12MB)이 그대로
 * 올라가면 업로드가 실패하므로, 한도(여유분 포함 4MB) 초과 이미지는 캔버스로
 * 긴 변 2000px·JPEG 품질 0.85 기준 재인코딩해 4MB 이하로 만든다.
 *
 * - 4MB 이하 이미지는 재인코딩 없이 원본 그대로(화질 보존, Vercel 한도는 용량 기준).
 * - GIF(애니메이션)·SVG 는 캔버스로 처리하면 손상되므로 건드리지 않는다.
 * - createImageBitmap({imageOrientation:"from-image"}) 로 EXIF 회전을 반영한다.
 */
const MAX_BYTES = 4 * 1024 * 1024; // 4MB (Vercel 4.5MB 한도 아래로 여유)
const MAX_DIM = 2000; // 긴 변 최대 픽셀

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function renameForType(name: string, type: string): string {
  const ext = type === "image/png" ? "png" : "jpg";
  const base = name.replace(/\.[^.]+$/, "") || "image";
  return `${base}.${ext}`;
}

export async function resizeImageForUpload(file: File): Promise<File> {
  if (typeof document === "undefined") return file;
  if (!file.type.startsWith("image/")) return file;
  if (file.size <= MAX_BYTES) return file; // 이미 한도 이하 → 원본 보존
  if (file.type === "image/gif" || file.type === "image/svg+xml") return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file; // 디코딩 실패 → 원본(서버가 거부하면 호출측이 메시지 표시)
  }

  let scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
  let outType: "image/jpeg" | "image/png" =
    file.type === "image/png" ? "image/png" : "image/jpeg";
  let quality = 0.85;
  let best: Blob | null = null;
  let bestType = outType;

  // 치수→품질→치수 순으로 단계적으로 낮추며 MAX_BYTES 이하를 노린다.
  for (let attempt = 0; attempt < 8; attempt++) {
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) break;
    if (outType === "image/jpeg") {
      ctx.fillStyle = "#ffffff"; // JPEG 는 알파가 없으므로 투명 배경을 흰색으로
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(bitmap, 0, 0, w, h);

    const blob = await canvasToBlob(
      canvas,
      outType,
      outType === "image/jpeg" ? quality : undefined,
    );
    if (blob) {
      best = blob;
      bestType = outType;
      if (blob.size <= MAX_BYTES) break;
    }
    if (outType === "image/png") {
      outType = "image/jpeg"; // 투명 PNG 가 너무 크면 압축률 높은 JPEG 로 전환
      quality = 0.85;
    } else if (quality > 0.5) {
      quality -= 0.15;
    } else {
      scale *= 0.8; // 품질 한계 도달 → 치수를 더 줄인다
    }
  }
  bitmap.close();

  if (!best) return file;
  if (best.size >= file.size) return file; // 재인코딩이 더 커지면(드뭄) 원본 사용
  return new File([best], renameForType(file.name, bestType), { type: bestType });
}
