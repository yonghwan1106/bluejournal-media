# 기사자동화 재타깃 가이드 (Playwright/adm → JSON API)

기존 `기사자동화/publish_*.js` 는 Playwright로 넷프로 `/adm/write.php` 폼을 채워 발행했다.
신규 사이트는 **JSON 발행 API** 한 번으로 끝난다(브라우저 자동화 불필요 → 빠르고 안정적).

## 엔드포인트
```
POST https://bluejournal.co.kr/api/admin/articles
Authorization: Bearer <NEWS_API_KEY>
Content-Type: application/json
```
바디(필수 title, bodyHtml):
```json
{
  "title": "제목",
  "subtitle": "부제목",
  "bodyHtml": "<p>본문 HTML…</p>",
  "section": "뉴스",            // 뉴스 | 특집 | 지역뉴스
  "region": "경기",            // 경기 | 서울 | 인천 | null
  "reporterName": "경인블루저널",
  "thumbnailUrl": "https://media.bluejournal.co.kr/data/...",
  "tags": ["성남시", "물놀이장"],
  "source": "성남시",
  "sourceUrl": "https://www.seongnam.go.kr/...",
  "status": "published",        // published | draft | hidden
  "publishedAt": "2026-06-16T08:55:00+09:00"
}
```
응답: `201 { "id": 872, "url": "https://bluejournal.co.kr/news/872" }`

## 이미지 처리
출처 이미지는 먼저 R2로 업로드 후 그 URL을 thumbnailUrl/bodyHtml에 사용:
```
POST /api/admin/upload  (multipart: file)  → { url }
```
(또는 관리자 세션 쿠키로 업로드. 자동화는 NEWS_API_KEY + 별도 업로드 스크립트 권장)

## 최소 예제 (Node 18+)
```js
const res = await fetch("https://bluejournal.co.kr/api/admin/articles", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${process.env.NEWS_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    title: article.title,
    bodyHtml: article.bodyHtml,
    section: "뉴스",
    region: article.region,
    thumbnailUrl: article.thumbUrl,
    source: article.source,
    sourceUrl: article.sourceUrl,
    tags: article.tags,
  }),
});
const { id, url } = await res.json();
console.log("PUBLISH", id, url);
```

## 마이그레이션 메모
- 기존 publish_*.js 의 기사 생성 로직(소스 스캔·본문 정제·이미지 다운로드)은 그대로 두고,
  마지막 "Playwright로 /adm 등록" 부분만 위 API 호출로 교체하면 된다.
- 컷오버 후 실제 신규 사이트로 1건 테스트 발행 → 검증 후 전체 전환 권장.
