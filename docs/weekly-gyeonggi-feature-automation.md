# 경기 현안 심층특집 주간 자동화 운영서

## 운영 결과

이 자동화는 매주 토요일 오전에 경기도 공식자료를 수집해 주제를 선정하고 심층기사를 작성한 뒤, 독립 RSI 검수와 대표 이미지 공개 검증을 모두 통과한 기사만 `scheduled` 상태로 저장한다. 07:00 준비 실행이 실패하면 08:00과 08:30에 같은 재시도 경로를 한 번씩 더 호출하며, 실제 공개는 기존 `publish-scheduled` 작업이 담당한다.

| 단계 | 한국 시각(KST) | Vercel Cron(UTC) | 경로 |
| --- | --- | --- | --- |
| 준비 실행 | 토요일 07:00 | 금요일 `0 22 * * 5` | `/api/cron/weekly-gyeonggi-feature/prepare` |
| 재시도 | 토요일 08:00·08:30 | 금요일 `0,30 23 * * 5` | `/api/cron/weekly-gyeonggi-feature/retry` |
| 공개 | 토요일 09:00 예약 | 기존 매시 정각 작업 | `/api/cron/publish-scheduled` |

기사의 `published_at`은 해당 토요일 `09:00:00+09:00`로 고정된다. 08:00 실행이 일시적인 AI Gateway 무료 티어 제한 등으로 실패하면 08:30 실행이 마지막 무과금 복구 기회를 제공한다. Vercel Cron 전달이 중복되거나 준비·두 차례 재시도 실행이 겹쳐도 주차별 실행 키와 기사 자동화 키가 중복 생성을 막는다.

각 호출은 시작과 함께 245초 전역 실행시간 예산을 만든다. 이는 경로의 `maxDuration=300`보다 55초 짧아, 공식자료 요청·AI 호출·R2 업로드·공개 이미지 검증이 중단된 뒤에도 `catch`에서 실행 상태와 실패 로그를 정리할 시간을 남긴다. 각 I/O의 개별 제한시간은 `AbortSignal.any`로 전역 신호와 결합하며, 새 단계 시작 시 남은 시간이 5초 미만이면 시작하지 않는다. 이 정책은 실제 실행과 dry-run에 동일하게 적용된다.

## 처리 흐름과 발행 조건

1. `Asia/Seoul` 기준 월요일부터 토요일까지의 주차와 `gyeonggi-feature:YYYY-MM-DD` 실행 키를 계산한다.
2. 경기도뉴스포털의 도청 보도자료(`s017`, `/briefing/brief_gongbo.do`)와 시군 보도자료(`s003`, `/briefing/brief_sigun.do`)를 각각 페이지 순회한다. 사이트의 날짜 검색 파라미터가 404를 반환할 수 있어, 목록의 `td.date`를 읽어 주차 범위를 서버에서 직접 제한한다.
3. AI Gateway 구조화 출력으로 같은 현안을 직접 다루는 이번 주 공식자료 seed를 최소 2개 선택하고, 선택한 제목에 실제로 등장하는 고유 지명·기관명·사업명 구성어인 `archiveTerms`를 2~4개 만든다. `경기도`, `정책`, `사업`, `지원`, `추진` 같은 일반어는 검색 핵심어로 인정하지 않는다. 주 모델이 한도 초과·일시 장애 등으로 실패하면 설정된 폴백 모델을 순서대로 시도한다.
4. 선택된 이번 주 상세 원문을 다시 가져와 정확한 `BS_CODE`와 문서 번호, 제목, 날짜, 본문을 확인한다. 모든 `archiveTerms`가 각 제목에 직접 나타나는 자료만 seed로 인정하므로, 모델이 관련 없는 세 번째 자료를 섞어도 근거 건수에 포함되지 않는다.
5. seed가 3건 미만이면 경기도뉴스포털 공식 아카이브를 제목 검색한다. 도청 `s017`은 `search=8`, 시군 `s003`은 `search=1`을 사용하고, 불안정한 날짜 query는 보내지 않은 채 서버에서 최근 5년 범위를 제한한다. 모든 `archiveTerms`가 제목에 나타나는 결과만 상세 확인한다. 예타·타당성·도로·철도 등 SOC 현안이면 KDI 공공투자관리센터(PIMAC)의 재정사업 조사현황도 제한 검색한다. 보강은 전체 20초, 상세 최대 4건, 최종 근거 최대 6건으로 제한한다.
6. 이번 주 seed와 과거·관계기관 공식자료를 합쳐 같은 현안의 상세 근거가 최소 3건일 때만 다음 단계로 간다. 검색 실패나 근거 부족을 일반 키워드 자료로 채우지 않는다.
7. 기사를 정확히 `현황 → 원인 → 데이터·사례 → 반론 → 대안·전망`의 5단으로 작성한다. 제목·소제목을 제외한 리드, 본문, 결론은 공백 포함 2,500~3,500자를 목표로 하며 2,500~5,000자만 허용한다.
8. 작성 호출과 별도의 AI Gateway 구조화 호출로 RSI 검수를 수행한다. 결과는 `RSI_PASS`, `REVISE`, `HOLD` 중 하나다. `REVISE`는 최대 두 번까지 전체 수정하고, 매번 이전 판정 대화와 분리된 새로운 독립 호출로 재검수한다.
9. 최종 `RSI_PASS`이고 로컬 구조 검사까지 통과한 경우에만 대표 이미지를 만든다. AI 이미지 생성 또는 업로드·공개 검증이 실패하면 자체 제작 SVG를 R2에 올린다.
10. R2 공개 URL을 `HEAD`로 확인하고, 헤더가 불충분하거나 `HEAD`가 허용되지 않으면 Range `GET`으로 다시 확인한다. HTTP 성공, `image/*`, 최소 800바이트를 모두 충족하지 않으면 기사를 저장하지 않는다.
11. 통과 기사를 `section=특집`, `region=경기`, `display_slot=헤드라인`, `reporter_name=경인블루저널 박용환`, `status=scheduled`로 저장한다. 본문에는 섹션별 공식 근거 링크와 최종 출처 목록을 넣는다. AI 이미지는 캡션에 `AI 생성 이미지`를, SVG 폴백은 자체 제작 자료 이미지임을 명시한다.

`RSI_PASS`가 아니거나 같은 현안을 직접 다루는 최종 공식자료가 3건 미만이거나 분량·구조·이미지 검증이 실패하면 새 기사 행은 만들어지지 않는다. 일반 법령·정책 문서는 정확한 법률명이나 제도가 seed에 직접 나타나는 별도 검증 없이 근거 수를 채우는 용도로 사용하지 않는다.

## 중복 방지

- `weekly_feature_runs.run_key` 기본 키를 먼저 선점해 동일 주차 동시 실행을 막는다.
- `articles.automation_key`의 고유 제약이 기사 삽입 단계의 두 번째 방어선이다.
- 자동화 키가 없던 기존 기사도 같은 주차의 `feature-key:gyeonggi-feature:YYYY-MM-DD` 태그 또는 `특집`·`경기`·예약/발행 시각으로 찾아 재생성을 건너뛴다.
- `scheduled` 실행은 준비 완료로 간주해 재시도가 건너뛴다. `failed`·`hold` 또는 20분 넘게 갱신되지 않은 `running` 실행은 다음 시도가 다시 선점할 수 있다.

## 필수 환경 변수

### Cron 인증

- `CRON_SECRET`: 필수. Vercel Cron은 `Authorization: Bearer <CRON_SECRET>` 헤더로 호출한다. 값이 없으면 경로는 503, 값이 다르면 401로 닫힌다. 쿼리 문자열로 비밀값을 받지 않는다.

준비·재시도 경로뿐 아니라 09:00 공개를 맡는 `/api/cron/publish-scheduled`와 같은 비밀값을 공유하는 `gyeonggi-news`, `scan`, `newsletter`, `digest`도 같은 정책을 사용한다. 과거의 `?key=<CRON_SECRET>` 호출 방식은 이 경로들에서 제거됐고 개발 환경의 secret 미설정 우회도 닫혔으므로, 모든 로컬·수동 호출과 외부 모니터는 Bearer 헤더를 사용해야 한다.

### AI Gateway

- Vercel 배포 환경의 OIDC 인증을 사용한다. 프로젝트에서 OIDC/AI Gateway 사용이 가능해야 하며, 런타임에 제공되는 `VERCEL_OIDC_TOKEN`으로 AI SDK가 Gateway를 인증한다.
- `WEEKLY_FEATURE_TEXT_MODEL`: 선택, 기본 `openai/gpt-5.4-nano`
- `WEEKLY_FEATURE_TEXT_FALLBACK_MODELS`: 선택, 쉼표로 구분. 기본 `openai/gpt-5-nano,google/gemini-2.5-flash-lite`
- `WEEKLY_FEATURE_RSI_MODEL`: 선택, 기본 `google/gemini-2.5-flash`
- `WEEKLY_FEATURE_RSI_FALLBACK_MODELS`: 선택, 쉼표로 구분. 기본 `google/gemini-2.5-flash-lite,openai/gpt-4.1-mini,openai/gpt-5.4-nano`
- `WEEKLY_FEATURE_IMAGE_MODEL`: 선택, 기본 `openai/gpt-image-2`

모델 값은 반드시 `provider/model` 문자열이어야 한다. 폴백 목록은 빈 항목을 제외하고 중복과 주 모델을 제거하며, 그 결과 주 모델과 다른 유효 모델이 하나도 없으면 실행을 중단한다. 기본 모델은 실시간 Gateway 카탈로그에 존재하고 tool-use를 지원하며, 현재 구조화 출력 비호환이 알려지지 않은 후보로 구성한다. 다만 계정의 무료 한도나 공급자 상태에 따라 모든 후보가 rate limit에 걸릴 수 있다.

텍스트 작성과 RSI는 서로 다른 호출·프롬프트이며 기본 주 모델도 각각 OpenAI와 Google로 분리한다. 그러나 어느 한쪽이 폴백을 사용하면 최종 성공 모델이 다른 단계와 같아질 수 있으므로, 항상 서로 다른 모델이 검수한다고 보장하지는 않는다. 폴백 여부와 관계없이 RSI 프롬프트·구조화 판정·최종 `RSI_PASS` 발행 조건은 동일해 검수 기준을 낮추지 않는다.

AI Gateway의 `providerOptions.gateway.models`는 Gateway가 인식한 모델·공급자 실패 때 주 모델 다음의 폴백 모델을 순서대로 시도한다. HTTP 성공 뒤 잘못된 구조가 반환돼 클라이언트에서 `AI_NoObjectGeneratedError`가 발생하면 Gateway 자체 폴백은 이미 끝난 것으로 보므로, 자동화가 다음 독립 모델로 최대 세 번 새 RSI 호출을 한다. Google 구조화 출력 호환성을 위해 issue의 `sourceId`는 문자열로만 받고 연결 출처가 없으면 빈 문자열을 반환하게 한 뒤 내부에서 `null`로 정규화한다. Gemini RSI 호출은 구조화 응답 공간과 지연을 안정화하려고 thinking을 비활성화한다. 모든 모델이 실패해도 HTTP 500으로 끝나고 dry-run에서는 기사·실행 행을 생성하지 않는다. 로컬에서 Vercel OIDC를 사용할 때는 최신 프로젝트 환경을 다시 받아 토큰을 갱신한다. OIDC를 쓰지 않는 로컬 검증은 별도의 AI Gateway API 키 설정이 필요할 수 있다.

### Cloudflare R2

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`
- `R2_PUBLIC_BASE` 권장. 없으면 기존 `NEXT_PUBLIC_MEDIA_BASE`를 사용한다. 반드시 HTTPS 공개 도메인이어야 한다.

### 데이터베이스

- `DATABASE_URL`

## 배포 전 순서

1. `drizzle/0004_weekly_feature_runs.sql`과 Drizzle 메타데이터를 최종 검토한다.
2. 애플리케이션 배포보다 먼저 운영 데이터베이스에 마이그레이션을 적용한다. 새 코드가 먼저 실행되면 `weekly_feature_runs` 또는 `articles.automation_key` 부재로 실패한다.
3. 위 환경 변수와 Vercel OIDC 연결 상태를 확인한다.
4. 아래 검사 명령을 실행한다.

```powershell
npm run test:weekly-feature
npm run lint
npm run build
```

5. 인증된 dry-run으로 공식자료 수집, 구조화 생성, RSI까지 확인한다. dry-run은 데이터베이스 선점·조회·로그, R2 업로드, 기사 삽입을 모두 생략한다.

```powershell
$headers = @{ Authorization = "Bearer $env:CRON_SECRET" }
Invoke-RestMethod `
  -Uri "http://localhost:3000/api/cron/weekly-gyeonggi-feature/prepare?dryRun=1" `
  -Headers $headers
```

실제 수동 실행은 `dryRun=1`만 제거한다. 실제 실행은 R2 업로드와 DB 저장을 수행하므로 운영 환경에서는 해당 주차 기사 존재 여부를 먼저 확인한다.

## 응답과 모니터링

- `scheduled`: RSI와 이미지 검증을 통과해 토요일 09:00 기사로 예약됨
- `skip_existing`: 같은 주차 기사 또는 완료 실행이 이미 존재함
- `skip_in_progress`: 같은 주차 실행이 진행 중임
- `dry_run`: DB/R2 변경 없이 생성·검수를 통과함
- `hold`와 HTTP 422: 근거, 구조, 분량, RSI 또는 마감 시각 조건 때문에 기사 저장을 보류함
- HTTP 500: 외부 요청, AI, R2, DB 등 실행 오류

운영 상태는 다음 두 곳을 함께 본다.

```sql
select run_key, state, attempt_label, attempt_count, article_id,
       rsi_decision, image_kind, error_text, updated_at
from weekly_feature_runs
order by updated_at desc
limit 20;

select run_at, source_agency, fetched, published, skipped, failed, error_text
from cron_runs
where job = 'weekly-gyeonggi-feature'
order by run_at desc
limit 20;
```

`weekly_feature_runs`는 멱등 상태의 기준이고, `cron_runs`는 각 호출의 운영 이력이다. 08:00·08:30 두 차례 재시도 후에도 `scheduled`가 아니면 `error_text`, Vercel 함수 로그, AI Gateway 사용 기록, R2 공개 URL 순서로 확인한다. 09:00가 지나면 자동화는 새 기사를 만들지 않으며, 편집자가 근거와 이미지를 직접 확인해 수동 발행 여부를 결정해야 한다.
