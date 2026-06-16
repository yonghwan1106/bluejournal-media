#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────
# ⚠️ DEPRECATED (2026-06): 사용하지 마세요.
#   Neon(서버리스 Postgres)으로 전환하여 DB 백업은 Neon 이 자동 처리(PITR)합니다.
#   별도 mysqldump cron 이 불필요해졌습니다. 이 스크립트는 기록용으로만 남겨둠.
# ──────────────────────────────────────────────────────────────────────────
# (구) VPS 일일 DB 백업 → Cloudflare R2 (vultr-setup.sh 가 /usr/local/bin 에 설치)
echo "DEPRECATED: Neon 자동 백업(PITR)으로 대체됨." >&2
exit 1
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
