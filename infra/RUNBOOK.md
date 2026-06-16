# 경인블루저널 이전 운영 런북 (넷프로 → Vercel + Vultr + R2)

전체 순서. 각 단계는 독립적으로 진행 가능하며, ✅는 자동화 완료, 🙋는 대표님 액션 필요.

---

## 0. 현재 상태
- ✅ 데이터 추출: 663개 기사 + 이미지 1,054개(`bluejournal-migration/out/`)
- ✅ ETL: `bluejournal-web/seed/articles.json` (663건)
- ✅ 공개 사이트: `bluejournal-web` (Next.js 16, `npm run build` 통과, 679페이지)
- 데이터 소스: 현재 JSON 시드(읽기전용) → 아래 5단계에서 Vultr MySQL로 전환

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

---

## 2. 🙋 Cloudflare R2 버킷 + 토큰 (이미지)
1. Cloudflare 대시보드 → R2 → 버킷 생성: `bluejournal-media`
2. R2 → Manage API Tokens → **Account API Token** 발급(Object Read & Write) → Access Key / Secret 보관
3. 버킷 → Settings → **커스텀 도메인** 연결: `media.bluejournal.co.kr` (Cloudflare DNS에 자동 추가)
4. (선택) 공개 액세스 또는 커스텀 도메인 공개 허용
→ 발급한 값(account id, access key, secret, 버킷명)을 어시스턴트에게 전달하거나 `.env`에 기입.

## 3. ✅→🙋 이미지 R2 업로드
```bash
# rclone 설치 후 (https://rclone.org)
#   bluejournal-web/infra/upload-to-r2.sh 참고 — 환경변수 채우고 실행
bash bluejournal-web/infra/upload-to-r2.sh
```
→ `out/media/data/...` 가 R2의 동일 경로로 업로드됨(구 URL 경로 보존).

---

## 4. 🙋 Vultr VPS 생성 + DB 셋업
1. Vultr → Deploy New Server → **Cloud Compute, Ubuntu 24.04, 서울(Seoul) 리전**, 최소 2GB RAM(권장 4GB), SSH 키 등록
2. SSH 접속 후:
```bash
# 로컬에서 스크립트 전송
scp bluejournal-web/infra/vultr-setup.sh root@<VPS_IP>:/root/
ssh root@<VPS_IP> 'bash /root/vultr-setup.sh'
```
- 스크립트가 MySQL 8 + ProxySQL(6033) + UFW + 일일백업(→R2) 구성. 실행 중 생성된 **DB 비밀번호**를 안전히 보관.
- 보안: DB는 TLS + 강한 비밀번호로 보호. 가능하면 Vercel 고정출구가 없으므로 `0.0.0.0/0`+TLS 운용(스크립트 기본) 또는 Cloudflare Tunnel 고려.

## 5. ✅→🙋 스키마 생성 + 시드 적재
```bash
cd C:/Users/user/bluejournal-web
# .env 에 DATABASE_URL=mysql://bluejournal:<PW>@<VPS_IP>:6033/bluejournal 설정 후
npx drizzle-kit push          # 스키마(articles 등) 생성
node infra/load-seed.mjs      # seed/articles.json → MySQL 663건 적재
```

---

## 6. 🙋 Vercel 환경변수 + 재배포
Vercel 프로젝트 Settings → Environment Variables:
```
DATABASE_URL = mysql://bluejournal:<PW>@<VPS_IP>:6033/bluejournal
NEXT_PUBLIC_MEDIA_BASE = https://media.bluejournal.co.kr
AUTH_SECRET = <랜덤 32바이트>
```
→ 재배포하면 데이터는 MySQL, 이미지는 R2에서 서빙.

## 7. 🙋 무중단 컷오버 (가비아 도메인 + Cloudflare)
1. Cloudflare DNS에서 `bluejournal.co.kr`, `www` 레코드 **TTL을 60초로 낮춰** 24시간 대기
2. 컷오버 시점: 자동화 봇 일시정지 → 최종 기사 델타 재크롤/적재
3. Cloudflare DNS A/CNAME을 **넷프로 IP → Vercel** 로 변경 (Vercel 도메인 추가 후 안내되는 값)
4. Vercel에서 `bluejournal.co.kr` 커스텀 도메인 추가 + SSL 발급 확인
5. 레거시 `board.php?wr_id=N` → `/news/N` 301 동작 확인(이미 next.config에 구현)
6. 네이버 서치어드바이저·구글 서치콘솔 사이트 재등록 + sitemap 제출

## 8. 컷오버 후
- 넷프로 해지 **전** 최소 1~2주 병행 운영하며 색인·제휴 모니터링
- 301은 최소 1년 유지
- 기사자동화(publish_*.js) 신규 관리자/API로 재타깃
