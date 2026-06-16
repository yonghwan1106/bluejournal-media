#!/usr/bin/env bash
# VPS 일일 DB 백업 → Cloudflare R2 (vultr-setup.sh 가 /usr/local/bin 에 설치)
# 사전: VPS에 rclone 설치 + 'r2' 리모트 구성
#   rclone config → n → name=r2 → storage=s3 → provider=Cloudflare
#   endpoint=https://<ACCOUNT_ID>.r2.cloudflarestorage.com, access_key/secret 입력
set -euo pipefail
DB_NAME="${DB_NAME:-bluejournal}"
STAMP=$(date +%Y%m%d_%H%M%S)
TMP="/tmp/bj_${STAMP}.sql.gz"

mysqldump --single-transaction --routines --triggers "$DB_NAME" | gzip > "$TMP"
rclone copy "$TMP" r2:bluejournal-backups/db/
rm -f "$TMP"

# R2의 30일 이상 백업 정리
rclone delete r2:bluejournal-backups/db/ --min-age 30d 2>/dev/null || true
echo "backup done: ${STAMP}"
