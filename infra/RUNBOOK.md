# 경인블루저널 이전 운영 런북 (넷프로 → Vercel + Neon + R2)

전체 순서. 각 단계는 독립적으로 진행 가능하며, ✅는 자동화 완료, 🙋는 대표님 액션 필요.

> 💡 **DB 경로 변경(2026-06):** 기존 Vultr VPS + MySQL 계획을 **Neon(서버리스 Postgres)** 로 교체했습니다.
> 서버 생성·SSH·방화벽·백업 운영이 사라지고, Vercel 버튼 연결 + 월 고정비 ≈₩0 입니다.
> (구 `infra/vultr-setup.sh`, `infra/backup-to-r2.sh` 는 더 이상 사용하지 않음 — 파일 상단에 폐기 표시.)

---

## 0. 현재 상태
- ✅ 데이터 추출: 663개 기사 + 이미지 1,054개(`bluejournal-migration/out/`)
- ✅ ETL: `bluejournal-web/seed/articles.json` (663건)
- ✅ 공개 사이트: `bluejournal-web` (Next.js 16, `npm run build` 통과, 679페이지)
- ✅ 코드 DB 레이어: **Neon(Postgres) + Drizzle neon-http 로 전환 완료**
- 데이터 소스: 현재 JSON 시드(읽기전용) → 아래 4~5단계에서 Neon Postgres로 적재

---

## 1. 🙋 Vercel 프리뷰 배포 (인증 후 즉시 가능)
현재 `VERCEL_TOKEN` 환경변수가 무효라 CLI가 막혀 있음. 둘 중 하나:

```bash
# 방법A) 대화형 로그인 (세션에서 ! 접두사로 실행)
!vercel login
# 그 후 어시스턴트가 실행:
cd C:/Users/user/bluejournal-web && vercel link --yes && vercel deploy --yes
```
```bash
# 방법B) 유효 토큰 발급(vercel.com → Settings → Tokens) 후 제공
#   → 어시스턴트가 VERCEL_TOKEN=<토큰> vercel deploy 로 배포
```
- 프리뷰는 DB 없이도 동작(시드 내장, 이미지는 라이브 넷프로). 결과 = `https://<프로젝트>.vercel.app`
- 이미 라이브: `https://bluejournal-media.vercel.app` (git push → 자동배포).

---

## 2. 🙋 Cloudflare R2 버킷 + 토큰 (이미지)
1. Cloudflare 대시보드 → R2 → 버킷 생성: `bluejournal-media`
2. R2 → Manage API Tokens → **Account API Token** 발급(Object Read & Write) → Access Key / Secret 보관
3. 버킷 → Settings → **커스텀 도메인** 연결: `media.bluejournal.co.kr` (Cloudflare DNS에 자동 추가)
4. (선택) 공개 액세스 또는 커스텀 도메인 공개 허용
→ 발급한 값(account id, access key, secret, 버킷명)을 어시스턴트에게 전달하거나 `.env`에 기입.

## 3. ✅ 이미지 R2 업로드 — **완료(2026-06-17)**
```bash
# (A) rclone 불필요 — Node(@aws-sdk/client-s3)로 업로드. 재실행 시 기존 파일 건너뜀.
#   .env 에 R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/R2_BUCKET 설정 후
node --env-file=.env infra/upload-to-r2.mjs
# (B) rclone 사용 시: bash infra/upload-to-r2.sh
```
→ `out/media/data/...` 가 R2의 동일 경로(`data/...`)로 업로드됨(구 URL 경로 보존).
- ✅실적재: 1,052개(~908MB) 업로드 성공(실패 0). 공개 r2.dev URL 로드 검증 완료.

---

## 4. 🙋 Neon Postgres 프로젝트 생성 (Vercel 통합, 무료)
서버 생성·SSH 없이 Vercel 대시보드에서 버튼으로 연결합니다.

1. Vercel 프로젝트 → **Storage** 탭 → **Create Database** → **Neon (Serverless Postgres)** 선택
2. 리전: **Singapore(ap-southeast-1)** 등 한국과 가까운 곳 권장, 플랜: **Free**
3. 생성하면 Vercel 환경변수에 `DATABASE_URL`(및 `DATABASE_URL_UNPOOLED` 등)이 **자동 주입**됨
   - 앱/시드는 **pooled** `DATABASE_URL`(호스트에 `-pooler` 포함, `?sslmode=require`)을 사용
4. 로컬 작업용으로 같은 pooled 연결문자열을 `bluejournal-web/.env` 의 `DATABASE_URL` 에 복사
   - Vercel CLI 사용 시: `vercel env pull .env` 로 한 번에 받을 수 있음

> Neon 무료 플랜: 자동 백업(PITR)·보안패치·풀링 내장 → 별도 백업 스크립트/VPS 운영 불필요.

## 5. ✅ 스키마 생성 + 시드 적재 (Neon) — **완료(2026-06-17)**
```bash
cd C:/Users/user/bluejournal-web
# .env 에 DATABASE_URL(pooled) + DATABASE_URL_UNPOOLED(직결) 설정 후

# (A) 비대화형 경로 — CI/어시스턴트/스크립트 환경 권장 (drizzle-kit push 는 TTY 필요)
npx drizzle-kit generate                                   # drizzle/*.sql DDL 생성
DATABASE_URL="$DATABASE_URL_UNPOOLED" node infra/apply-schema.mjs   # neon http 로 DDL 적용(직결)
node --env-file=.env infra/load-seed.mjs                   # 663건 적재 + 시퀀스 동기화

# (B) 대화형 터미널이면 (A)의 generate+apply 대신 push 한 줄로도 가능:
#   DATABASE_URL="$DATABASE_URL_UNPOOLED" npx drizzle-kit push
```
- ✅실적재 완료: 663건(id 188~871), 시퀀스 last_value=871 동기화(신규 발행 id=872~), 타임스탬프 instant 무드리프트, status/tags 정상.
- 663건 모두 적재됨(그중 publishedAt 보유 658건, 나머지 5건은 등록일시 없이 적재).
- `load-seed.mjs` 는 `ON CONFLICT(id) DO UPDATE` 라 **여러 번 실행해도 안전**(델타 재적재 가능).
- 과도하게 긴 varchar 값(예: 잘못 유입된 출처)은 컬럼 길이에 맞춰 자동 절단(경고 출력).
- 마지막에 `setval` 로 identity 시퀀스를 MAX(id)로 전진시켜 신규 발행 PK 충돌을 방지함(자동).

---

## 6. 🙋 Vercel 환경변수 + 재배포
Vercel 프로젝트 Settings → Environment Variables (Neon 연결 시 `DATABASE_URL` 은 이미 주입됨):
```
DATABASE_URL          = (Neon 통합이 자동 주입한 pooled 값 — 직접 입력 불필요)
NEXT_PUBLIC_SITE_URL   = https://bluejournal.co.kr   # 발행 API 가 반환 URL 생성에 사용
NEXT_PUBLIC_MEDIA_BASE = https://media.bluejournal.co.kr
R2_PUBLIC_BASE         = https://media.bluejournal.co.kr
R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET = (R2 발급값)
AUTH_SECRET            = <랜덤 32바이트>
ADMIN_USERNAME / ADMIN_PASSWORD = <관리자 자격증명>
NEWS_API_KEY           = <기사자동화 발행 키>
NEXT_PUBLIC_ALLOW_INDEX = true   # 본 도메인 컷오버 후에만
```
→ 재배포하면 데이터는 Neon, 이미지는 R2에서 서빙.

## 7. 🙋 무중단 컷오버 (가비아 도메인 + Cloudflare)
1. Cloudflare DNS에서 `bluejournal.co.kr`, `www` 레코드 **TTL을 60초로 낮춰** 24시간 대기
2. 컷오버 시점: 자동화 봇 일시정지 → 최종 기사 델타 재크롤/적재(`load-seed.mjs` 재실행)
3. Cloudflare DNS A/CNAME을 **넷프로 IP → Vercel** 로 변경 (Vercel 도메인 추가 후 안내되는 값)
4. Vercel에서 `bluejournal.co.kr` 커스텀 도메인 추가 + SSL 발급 확인
5. 레거시 `board.php?wr_id=N` → `/news/N` 301 동작 확인(이미 next.config에 구현)
6. 네이버 서치어드바이저·구글 서치콘솔 사이트 재등록 + sitemap 제출

## 8. 컷오버 후
- 넷프로 해지 **전** 최소 1~2주 병행 운영하며 색인·제휴 모니터링
- 301은 최소 1년 유지
- 기사자동화(publish_*.js) 신규 관리자/API(`POST /api/admin/articles`)로 재타깃
- DB 백업은 Neon이 자동 처리(별도 cron 불필요).
