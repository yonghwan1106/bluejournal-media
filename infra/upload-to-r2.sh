#!/usr/bin/env bash
# 로컬 이미지 미러(out/media/data) → Cloudflare R2 (구 /data 경로 보존)
# 사전: rclone 설치 + 'r2' 리모트 구성 (backup-to-r2.sh 주석 참고)
#   결과 URL 예: https://media.bluejournal.co.kr/data/file/news/xxx.jpg
set -euo pipefail
SRC="${1:-C:/Users/user/bluejournal-migration/out/media}"
BUCKET="${R2_BUCKET:-bluejournal-media}"

if [ ! -d "$SRC/data" ]; then
  echo "ERROR: $SRC/data 가 없습니다. download_images.mjs 를 먼저 실행하세요." >&2
  exit 1
fi

rclone copy "$SRC/data" "r2:${BUCKET}/data" \
  --progress --transfers 16 --checkers 16 --exclude "_*.json"

echo "이미지 업로드 완료 → r2:${BUCKET}/data (약 907MB, 1,054파일)"
