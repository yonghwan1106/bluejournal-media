import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { authorizeCronRequest } from "../src/lib/cron-auth";
import {
  WEEKLY_FEATURE_SECTION_ROLES,
  buildWeeklyFeatureBodyHtml,
  buildWeeklyFeatureFallbackSvg,
  buildWeeklyFeatureSchedule,
  isBeforeWeeklyFeaturePublishDeadline,
  validateDraftForSources,
  validateTopicSelection,
  weeklyFeatureDraftText,
  type WeeklyFeatureDraft,
  type WeeklyFeatureEvidence,
} from "../src/lib/weekly-gyeonggi-feature-core";
import {
  WEEKLY_FEATURE_BOARDS,
  buildWeeklyFeatureListUrl,
  parseWeeklyFeatureDetailHtml,
  parseWeeklyFeatureListHtml,
} from "../src/lib/weekly-gyeonggi-feature-sources";

const evidence: WeeklyFeatureEvidence[] = [1, 2, 3].map((number) => ({
  id: `s017-${number}`,
  title: `경기도 공식자료 ${number}`,
  date: "2026-09-04",
  url: `https://gnews.gg.go.kr/briefing/brief_gongbo_view.do?BS_CODE=s017&number=${number}`,
  sourceName: "경기도청 보도자료",
  summary: `공식자료 ${number} 요약`,
  bodyText: `공식자료 ${number}의 검증 가능한 상세 본문입니다.`.repeat(20),
}));

const draft: WeeklyFeatureDraft = {
  title: "도민의 일상을 바꾸는 경기 정책의 연결고리를 짚다",
  subtitle: "세 건의 경기도 공식자료로 현황과 주민 영향, 남은 과제를 교차 점검했다",
  lead:
    "이번 주 경기도 공식자료는 서로 다른 현장과 정책을 다루지만 도민이 체감하는 변화가 행정의 실행력과 어떻게 연결되는지를 공통으로 보여준다.",
  sections: WEEKLY_FEATURE_SECTION_ROLES.map((role, index) => ({
    role,
    heading: `${role}을 짚는 핵심 쟁점 ${index + 1}`,
    paragraphs: [
      `공식자료 ${index + 1}에서 확인되는 정책의 ${role}과 적용 범위를 과장 없이 설명하고, 발표 시점과 담당 기관을 구분해 독자가 사실관계를 확인할 수 있도록 정리한다. 자료에 적힌 범위와 아직 확인되지 않은 범위를 나누고, 행정 발표를 곧바로 성과로 해석하지 않도록 집행 조건과 확인 시점을 함께 살핀다. 주민의 일상에 닿는 경로도 공식자료에 드러난 내용까지만 연결하며 수치와 대상, 시행 지역이 서로 다른 경우에는 이를 한데 뭉뚱그리지 않는다.`,
      `이 자료가 주민 생활에 미칠 수 있는 영향은 발표 내용으로 확인되는 범위에서 살피고, 추가 확인이 필요한 대목은 단정하지 않은 채 과제로 남긴다. 서로 다른 기관의 발표가 같은 정책축을 가리키더라도 예산과 일정, 적용 대상이 일치하는지 구분하고 현장에서 확인할 후속 지표를 제시한다. 독자는 연결된 흐름과 자료별 한계를 동시에 볼 수 있어야 하므로 긍정적 기대와 실행 위험을 균형 있게 설명한다.`,
      `정책의 효과를 판단하려면 발표 건수보다 실제 집행 뒤 공개되는 자료가 중요하다. 따라서 해당 주간 자료가 제시한 계획과 근거를 출발점으로 삼되, 이후 확인할 일정과 책임 주체, 주민이 이용할 수 있는 절차를 나눠 설명한다. 공식 문서에 없는 전망은 사실처럼 단정하지 않고 가능한 시나리오로만 제시하며, 추가 취재가 필요한 쟁점은 독자가 구분할 수 있도록 명시한다.`,
    ],
    sourceIds: [evidence[index % evidence.length].id],
  })),
  conclusion:
    "세 자료를 함께 보면 발표 자체보다 후속 집행과 공개 검증이 중요하다는 점이 드러난다. 향후 일정과 성과 지표를 지속적으로 확인해야 정책 효과를 정확히 평가할 수 있다.",
  tags: ["경기도", "정책", "주민영향"],
  imagePrompt:
    "경기도의 도시와 농촌, 교통과 생활 현장을 균형 있게 상징하는 차분한 신문 기획 일러스트",
};

test("cron 인증은 secret 미설정과 query key를 거부하고 Bearer만 허용한다", () => {
  const missingSecret = authorizeCronRequest(new Request("https://example.com/api/cron"), "");
  assert.deepEqual(missingSecret, {
    ok: false,
    status: 503,
    error: "cron secret not configured",
  });
  const queryOnly = authorizeCronRequest(
    new Request("https://example.com/api/cron?key=test-secret"),
    "test-secret",
  );
  assert.deepEqual(queryOnly, { ok: false, status: 401, error: "unauthorized" });
  const bearer = authorizeCronRequest(
    new Request("https://example.com/api/cron", {
      headers: { Authorization: "Bearer test-secret" },
    }),
    "test-secret",
  );
  assert.deepEqual(bearer, { ok: true });
});

test("KST 토요일 prepare와 retry가 같은 주차키와 09:00 예약시각을 만든다", () => {
  const prepare = buildWeeklyFeatureSchedule(new Date("2026-09-04T22:00:00.000Z"));
  const retry = buildWeeklyFeatureSchedule(new Date("2026-09-04T23:00:00.000Z"));

  assert.equal(prepare.runKey, "gyeonggi-feature:2026-09-05");
  assert.equal(retry.runKey, prepare.runKey);
  assert.equal(prepare.weekStart, "2026-08-31");
  assert.equal(prepare.sourceEnd, "2026-09-05");
  assert.equal(prepare.publishAt.toISOString(), "2026-09-05T00:00:00.000Z");
  assert.equal(prepare.publishAtKst, "2026-09-05T09:00:00+09:00");
  assert.equal(
    isBeforeWeeklyFeaturePublishDeadline(new Date("2026-09-05T08:59:59+09:00"), prepare),
    true,
  );
  assert.equal(
    isBeforeWeeklyFeaturePublishDeadline(new Date("2026-09-05T09:00:00+09:00"), prepare),
    false,
  );
});

test("Asia/Seoul 월요일 자정에 새 주차키로 전환한다", () => {
  const before = buildWeeklyFeatureSchedule(new Date("2026-09-06T14:59:59.000Z"));
  const after = buildWeeklyFeatureSchedule(new Date("2026-09-06T15:00:00.000Z"));

  assert.equal(before.runKey, "gyeonggi-feature:2026-09-05");
  assert.equal(after.runKey, "gyeonggi-feature:2026-09-12");
  assert.equal(after.weekStart, "2026-09-07");
});

test("주제와 기사 검사는 서로 다른 공식 근거 세 건을 강제한다", () => {
  assert.deepEqual(
    validateTopicSelection(
      {
        headline: "경기도 정책의 연결된 쟁점",
        angle: "세 공식자료를 통해 주민 영향과 실행 과제를 함께 살핀다.",
        rationale: "동일 주간에 공개된 자료가 하나의 정책 실행 흐름을 보여준다.",
        sourceIds: evidence.map((source) => source.id),
      },
      evidence,
    ),
    [],
  );
  assert.deepEqual(validateDraftForSources(draft, evidence), []);
  assert.equal(weeklyFeatureDraftText(draft).length >= 2_500, true);

  const invalid = structuredClone(draft);
  invalid.sections.forEach((section) => {
    section.sourceIds = [evidence[0].id];
  });
  assert.match(validateDraftForSources(invalid, evidence).join(" "), /3개 미만/);

  const wrongOrder = structuredClone(draft);
  [wrongOrder.sections[0].role, wrongOrder.sections[1].role] = [
    wrongOrder.sections[1].role,
    wrongOrder.sections[0].role,
  ];
  assert.match(validateDraftForSources(wrongOrder, evidence).join(" "), /섹션 역할/);

  const tooShort = structuredClone(draft);
  tooShort.sections.forEach((section) => {
    section.paragraphs = ["공식자료로 확인된 내용을 설명하는 짧은 검증 문단입니다.".repeat(2), "후속 확인이 필요합니다.".repeat(4)];
  });
  assert.match(validateDraftForSources(tooShort, evidence).join(" "), /2500자 미만/);
});

test("도청 s017과 시군 s003 목록은 서로 다른 실제 경로와 행 selector로 파싱한다", () => {
  const [provincial, municipal] = WEEKLY_FEATURE_BOARDS;
  const provincialUrl = new URL(buildWeeklyFeatureListUrl(provincial, 2));
  const municipalUrl = new URL(buildWeeklyFeatureListUrl(municipal, 2));
  assert.equal(provincialUrl.pathname, "/briefing/brief_gongbo.do");
  assert.equal(municipalUrl.pathname, "/briefing/brief_sigun.do");
  assert.equal(municipalUrl.searchParams.get("BS_CODE"), "s003");

  const range = { weekStart: "2026-08-31", sourceEnd: "2026-09-05" };
  const provincialHtml = readFileSync(
    new URL("./fixtures/weekly-feature-s017-list.html", import.meta.url),
    "utf8",
  );
  const municipalHtml = readFileSync(
    new URL("./fixtures/weekly-feature-s003-list.html", import.meta.url),
    "utf8",
  );
  const provincialRows = parseWeeklyFeatureListHtml({
    html: provincialHtml,
    board: provincial,
    ...range,
  });
  const municipalRows = parseWeeklyFeatureListHtml({
    html: municipalHtml,
    board: municipal,
    ...range,
  });

  assert.deepEqual(provincialRows.map((row) => row.id), ["s017-71410"]);
  assert.deepEqual(municipalRows.map((row) => row.id), ["s003-114684"]);
  assert.equal(municipalRows[0].url.includes("brief_gongbo_view.do"), true);
  assert.deepEqual(
    parseWeeklyFeatureListHtml({ html: provincialHtml, board: municipal, ...range }),
    [],
    "도청 목록을 시군 자료로 오표기하면 안 된다",
  );
});

test("도청·시군 상세 fixture에서 정확한 제목, 날짜, 본문과 요약을 추출한다", () => {
  const provincialCandidate = evidence[0];
  const municipalCandidate: WeeklyFeatureEvidence = {
    ...evidence[1],
    id: "s003-114684",
    title: "시군 후보 제목",
    url: "https://gnews.gg.go.kr/briefing/brief_gongbo_view.do?BS_CODE=s003&number=114684",
    sourceName: "경기도 시군 보도자료",
  };
  const provincial = parseWeeklyFeatureDetailHtml(
    readFileSync(new URL("./fixtures/weekly-feature-s017-detail.html", import.meta.url), "utf8"),
    provincialCandidate,
  );
  const municipal = parseWeeklyFeatureDetailHtml(
    readFileSync(new URL("./fixtures/weekly-feature-s003-detail.html", import.meta.url), "utf8"),
    municipalCandidate,
  );

  assert.equal(provincial.title, "경기도 공식자료 상세 제목");
  assert.equal(provincial.date, "2026-09-04");
  assert.equal(provincial.summary, "검증 가능한 도청 공식 요약");
  assert.equal(provincial.bodyText.match(/첫 문단 고유 문구/g)?.length, 1);
  assert.doesNotMatch(provincial.bodyText, /첨부파일\.hwp/);
  assert.equal(municipal.title, "포천시 공식자료 상세 제목");
  assert.equal(municipal.date, "2026-09-05");
  assert.equal(municipal.summary, "시군 자료는 메타 설명을 요약으로 사용한다.");
  assert.throws(
    () =>
      parseWeeklyFeatureDetailHtml(
        readFileSync(new URL("./fixtures/weekly-feature-s003-detail.html", import.meta.url), "utf8"),
        provincialCandidate,
      ),
    /식별자가 후보와 다릅니다/,
  );
});

test("본문은 공식 URL 목록과 이미지 제작 고지를 포함하고 모델 텍스트를 escape한다", () => {
  const unsafe = structuredClone(draft);
  unsafe.sections[0].paragraphs[0] = "<script>alert('x')</script> 공식 근거를 설명하는 충분히 긴 문장입니다.";
  const html = buildWeeklyFeatureBodyHtml({
    draft: unsafe,
    evidence,
    imageUrl: "https://media.bluejournal.co.kr/data/generated/feature.png",
    imageKind: "ai",
  });

  assert.match(html, /AI 생성 이미지/);
  assert.equal(html.split("https://").length - 1 >= 4, true);
  assert.doesNotMatch(html, /<script>/i);
  assert.match(html, /&lt;script&gt;/);
});

test("SVG 폴백은 실행 가능한 태그 없이 안전하게 escape된다", () => {
  const svg = buildWeeklyFeatureFallbackSvg("<script>alert(1)</script>", "2026-08-31");
  assert.match(svg, /^<svg /);
  assert.doesNotMatch(svg, /<script>/i);
  assert.match(svg, /&lt;script&gt;/);
  assert.match(svg, /자체 제작 자료 이미지/);
});
