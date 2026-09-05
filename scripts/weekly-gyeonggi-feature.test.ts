import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { authorizeCronRequest } from "../src/lib/cron-auth";
import {
  DEFAULT_WEEKLY_FEATURE_RSI_FALLBACK_MODELS,
  DEFAULT_WEEKLY_FEATURE_RSI_MODEL,
  DEFAULT_WEEKLY_FEATURE_TEXT_FALLBACK_MODELS,
  DEFAULT_WEEKLY_FEATURE_TEXT_MODEL,
  MAX_WEEKLY_FEATURE_SOURCES,
  MAX_WEEKLY_FEATURE_TOPIC_REVISION_CYCLES,
  MIN_WEEKLY_FEATURE_CURRENT_SOURCES,
  MAX_WEEKLY_FEATURE_RSI_REVISION_CYCLES,
  WEEKLY_FEATURE_INVOCATION_BUDGET_MS,
  WEEKLY_FEATURE_MIN_STAGE_REMAINING_MS,
  WEEKLY_FEATURE_SECTION_ROLES,
  assertWeeklyFeatureInvocationBudget,
  assertWeeklyFeatureOfficialUrl,
  buildWeeklyFeatureBodyHtml,
  buildWeeklyFeatureFallbackSvg,
  buildWeeklyFeatureSchedule,
  canonicalizeWeeklyFeatureSections,
  createWeeklyFeatureInvocationBudget,
  createWeeklyFeatureStageSignal,
  isBeforeWeeklyFeaturePublishDeadline,
  matchesWeeklyFeatureIssueTitle,
  mergeWeeklyFeatureEvidence,
  normalizeWeeklyFeatureIssueText,
  remainingWeeklyFeatureInvocationMs,
  resolveWeeklyFeatureGatewayFallbackModels,
  sanitizeWeeklyFeatureArchiveTerms,
  selectWeeklyFeatureArchiveTermsForTitles,
  selectWeeklyFeatureCurrentCandidates,
  selectWeeklyFeatureSupplementalCandidates,
  shouldSearchWeeklyFeaturePimac,
  validateDraftForSources,
  validateTopicSelection,
  weeklyFeatureDraftText,
  type WeeklyFeatureDraft,
  type WeeklyFeatureEvidence,
} from "../src/lib/weekly-gyeonggi-feature-core";
import {
  WEEKLY_FEATURE_BOARDS,
  buildPimacProjectSearchUrl,
  buildWeeklyFeatureArchiveSearchUrl,
  buildWeeklyFeatureListUrl,
  parsePimacProjectDetailHtml,
  parsePimacProjectSearchHtml,
  parseWeeklyFeatureArchiveListHtml,
  parseWeeklyFeatureDetailHtml,
  parseWeeklyFeatureListHtml,
} from "../src/lib/weekly-gyeonggi-feature-sources";

const weeklyFeatureAutomationSource = readFileSync(
  new URL("../src/lib/weekly-gyeonggi-feature.ts", import.meta.url),
  "utf8",
);

const evidence: WeeklyFeatureEvidence[] = [1, 2, 3].map((number) => ({
  id: `s017-${number}`,
  title: `포천-철원 고속도로 공식자료 ${number}`,
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

test("245초 전역 예산은 단계별 신호와 결합되고 강제 종료 전에 새 단계를 차단한다", () => {
  assert.equal(WEEKLY_FEATURE_INVOCATION_BUDGET_MS, 245_000);
  assert.equal(WEEKLY_FEATURE_MIN_STAGE_REMAINING_MS, 5_000);
  assert.equal(WEEKLY_FEATURE_INVOCATION_BUDGET_MS <= 250_000, true);

  const budget = createWeeklyFeatureInvocationBudget(1_000, 10_000);
  assert.equal(budget.deadlineAtMs, 11_000);
  assert.equal(remainingWeeklyFeatureInvocationMs(budget, 5_000), 6_000);
  assert.equal(assertWeeklyFeatureInvocationBudget(budget, "테스트 단계", 5_000), 6_000);
  assert.throws(
    () => assertWeeklyFeatureInvocationBudget(budget, "마감 직전 단계", 6_001),
    /전역 실행시간 예산 소진/,
  );

  const globalController = new AbortController();
  const localController = new AbortController();
  const combined = createWeeklyFeatureStageSignal({
    budget: { deadlineAtMs: Date.now() + 20_000, signal: globalController.signal },
    stage: "결합 신호 테스트",
    timeoutMs: 10_000,
    signals: [localController.signal],
  });
  assert.equal(combined.aborted, false);
  localController.abort(new Error("개별 단계 중단"));
  assert.equal(combined.aborted, true);

  globalController.abort(new Error("전역 중단"));
  assert.throws(
    () =>
      createWeeklyFeatureStageSignal({
        budget: { deadlineAtMs: Date.now() + 20_000, signal: globalController.signal },
        stage: "중단 후 단계",
        timeoutMs: 10_000,
      }),
    /전역 실행시간 예산 소진/,
  );
});

test("공식자료 URL은 gnews와 PIMAC의 비표준 포트를 거부한다", () => {
  assert.equal(
    assertWeeklyFeatureOfficialUrl(
      "https://gnews.gg.go.kr/briefing/brief_gongbo_view.do?BS_CODE=s017&number=71407",
    ).hostname,
    "gnews.gg.go.kr",
  );
  assert.throws(
    () =>
      assertWeeklyFeatureOfficialUrl(
        "https://gnews.gg.go.kr:444/briefing/brief_gongbo_view.do?BS_CODE=s017&number=71407",
      ),
    /허용되지 않은 공식자료 URL/,
  );
  assert.throws(
    () =>
      assertWeeklyFeatureOfficialUrl(
        "https://pimac.kdi.re.kr:8443/study/fina_view.jsp?exmn_no=312",
      ),
    /허용되지 않은 공식자료 URL/,
  );
});

test("실행기는 전역 예산을 외부 I/O 전 단계에 전파한다", () => {
  assert.match(
    weeklyFeatureAutomationSource,
    /const invocationBudget = createWeeklyFeatureInvocationBudget\(\)/,
  );
  assert.match(
    weeklyFeatureAutomationSource,
    /collectWeeklyGyeonggiCandidates\(schedule, invocationBudget\)/,
  );
  assert.equal(
    (weeklyFeatureAutomationSource.match(/createWeeklyFeatureStageSignal\(/g) ?? []).length >= 9,
    true,
    "공식 fetch, AI, 이미지 검증, R2 업로드에 결합 신호가 있어야 한다",
  );
  assert.match(weeklyFeatureAutomationSource, /\{ abortSignal \},\s*\);/);
  assert.doesNotMatch(
    weeklyFeatureAutomationSource,
    /AbortSignal\.timeout\((TEXT_TIMEOUT_MS|IMAGE_TIMEOUT_MS|PUBLIC_IMAGE_TIMEOUT_MS)\)/,
  );
});

test("주제와 기사 검사는 서로 다른 공식 근거 세 건을 강제한다", () => {
  assert.deepEqual(
    validateTopicSelection(
      {
        headline: "경기도 정책의 연결된 쟁점",
        angle: "세 공식자료를 통해 주민 영향과 실행 과제를 함께 살핀다.",
        rationale: "동일 주간에 공개된 자료가 하나의 정책 실행 흐름을 보여준다.",
        sourceIds: evidence.map((source) => source.id),
        archiveTerms: ["포천", "철원", "고속도로"],
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

test("공식자료가 촉구·평가 단계이면 예타 통과 완료 표현을 로컬에서 차단한다", () => {
  const pendingEvidence = evidence.map((source) => ({
    ...source,
    bodyText: `${source.bodyText} 예비타당성조사 통과를 촉구했으며 평가를 앞두고 있다.`,
  }));
  for (const title of [
    "포천~철원 고속도로 예타 통과 이후의 후속 과제를 점검한다",
    "포천~철원 고속도로 예타 최종 통과, 후속 사업 본격화",
    "포천~철원 고속도로 예타 통과로 사업 추진 본궤도",
    "포천~철원 고속도로 예타는 통과했다",
  ]) {
    assert.match(
      validateDraftForSources({ ...draft, title }, pendingEvidence).join(" "),
      /통과를 확정하지 않았는데 기사에서 통과 완료/,
      title,
    );
  }

  const prematurePassage = {
    ...draft,
    title: "포천~철원 고속도로 예타 통과 이후의 후속 과제를 점검한다",
  };
  for (const denial of [
    "예비타당성조사를 통과했다는 주장은 사실이 아니며 현재 평가 중이다",
    "예비타당성조사를 통과했다고 발표하지 않았다고 밝혔다",
    "예비타당성조사를 통과했다고 발표한 바 없다고 밝혔다",
    "예비타당성조사가 통과됐다고 확인할 수 없다고 밝혔다",
    "예비타당성조사를 통과했다고 발표했다는 보도는 허위다",
    "예비타당성조사를 통과했다고 발표했으나 해당 내용은 오류다",
    "예비타당성조사를 통과했다는 보도는 사실무근이다",
    "예비타당성조사를 통과했다는 보도는 잘못된 내용이다",
    "예비타당성조사를 통과했다고 발표했다는 내용은 사실과 다르다",
    "예비타당성조사를 통과했다고 발표했다는 보도는 부정확하다",
  ]) {
    const deniedEvidence = pendingEvidence.map((source, index) => ({
      ...source,
      bodyText: index === 0 ? `${source.bodyText} ${denial}.` : source.bodyText,
    }));
    assert.match(
      validateDraftForSources(prematurePassage, deniedEvidence).join(" "),
      /통과를 확정하지 않았는데 기사에서 통과 완료/,
      denial,
    );
  }

  const confirmedEvidence = pendingEvidence.map((source, index) => ({
    ...source,
    bodyText:
      index === 0
        ? `${source.bodyText} 관계기관은 해당 사업이 예비타당성조사를 통과했다고 발표했다.`
        : source.bodyText,
  }));
  assert.doesNotMatch(
    validateDraftForSources(prematurePassage, confirmedEvidence).join(" "),
    /통과를 확정하지 않았는데 기사에서 통과 완료/,
  );
});

test("이번 주 주제 seed는 직접 관련 2건부터 허용하되 최종 3건 기준은 낮추지 않는다", () => {
  const seedTopic = {
    headline: "포천-철원 고속도로 예비타당성조사의 현재 단계",
    angle: "접경지역 교통망 사업의 조사 단계와 비용·수요 검증 쟁점을 살핀다.",
    rationale: "경기도와 포천시가 같은 고속도로 사업의 예비타당성조사를 직접 다뤘다.",
    sourceIds: evidence.slice(0, MIN_WEEKLY_FEATURE_CURRENT_SOURCES).map((source) => source.id),
    archiveTerms: ["포천", "철원", "고속도로"],
  };

  assert.deepEqual(
    validateTopicSelection(seedTopic, evidence, {
      minimumSources: MIN_WEEKLY_FEATURE_CURRENT_SOURCES,
    }),
    [],
  );
  assert.match(validateTopicSelection(seedTopic, evidence).join(" "), /3개 미만/);
  const mixedTerms = sanitizeWeeklyFeatureArchiveTerms(["포천", "철원", "사업"]);
  assert.deepEqual(mixedTerms, ["포천", "철원"]);
  assert.deepEqual(
    validateTopicSelection(
      { ...seedTopic, archiveTerms: mixedTerms },
      evidence,
      { minimumSources: MIN_WEEKLY_FEATURE_CURRENT_SOURCES },
    ),
    [],
  );

  const genericOnlyTerms = sanitizeWeeklyFeatureArchiveTerms(["경기도", "사업"]);
  assert.deepEqual(genericOnlyTerms, []);
  assert.match(
    validateTopicSelection(
      { ...seedTopic, archiveTerms: genericOnlyTerms },
      evidence,
      { minimumSources: MIN_WEEKLY_FEATURE_CURRENT_SOURCES },
    ).join(" "),
    /2~4개/,
  );
  assert.match(
    validateTopicSelection(
      { ...seedTopic, archiveTerms: ["포천", "광역버스"] },
      evidence,
      { minimumSources: MIN_WEEKLY_FEATURE_CURRENT_SOURCES },
    ).join(" "),
    /자료 제목/,
  );
});

test("선택 자료 제목에 공통인 가장 큰 고유 핵심어 조합만 결정적으로 남긴다", () => {
  const selectedTitles = [
    "포천-철원 고속도로 예비타당성조사 대응",
    "포천·철원 고속도로 조기 추진 공동건의",
  ];
  assert.deepEqual(
    selectWeeklyFeatureArchiveTermsForTitles(
      ["포천", "철원", "접경지역"],
      selectedTitles,
    ),
    ["포천", "철원"],
  );

  const splitEvidence: WeeklyFeatureEvidence[] = [
    { ...evidence[0], title: "포천 고속도로 추진계획" },
    { ...evidence[1], title: "철원 접경지역 교통대책" },
  ];
  const noCommonTerms = selectWeeklyFeatureArchiveTermsForTitles(
    ["포천", "철원", "고속도로", "접경지역"],
    splitEvidence.map((source) => source.title),
  );
  assert.deepEqual(noCommonTerms, []);
  assert.match(
    validateTopicSelection(
      {
        headline: "포천과 철원 접경 교통 현안을 함께 살핀다",
        angle: "서로 다른 공식자료가 실제로 같은 사업을 다루는지 엄격하게 검증한다.",
        rationale: "두 자료 제목에 공통으로 나타나는 특정 고유어 조합이 있는지 확인한다.",
        sourceIds: splitEvidence.map((source) => source.id),
        archiveTerms: noCommonTerms,
      },
      splitEvidence,
      { minimumSources: MIN_WEEKLY_FEATURE_CURRENT_SOURCES },
    ).join(" "),
    /2~4개/,
  );
});

test("모델 검색어가 무효여도 선택 제목의 공통 고유어를 결정적으로 파생한다", () => {
  const selectedTitles = [
    "추미애, 포천~철원 고속도로 조기 추진 공동건의",
    "경기도·강원도, 포천-철원 고속도로 예비타당성조사 대응",
  ];
  const forward = selectWeeklyFeatureArchiveTermsForTitles(
    ["경기도", "사업"],
    selectedTitles,
  );
  const reversed = selectWeeklyFeatureArchiveTermsForTitles(
    ["사업", "경기도"],
    [...selectedTitles].reverse(),
  );

  assert.equal(forward.length, 2);
  assert.deepEqual(reversed, forward);
  assert.equal(
    selectedTitles.every((title) => matchesWeeklyFeatureIssueTitle(title, forward)),
    true,
  );

  const duplicatedTitle = "포천 철원 고속도로 공동 대응";
  assert.equal(
    selectWeeklyFeatureArchiveTermsForTitles(
      ["경기도", "사업"],
      [duplicatedTitle, duplicatedTitle],
    ).length,
    2,
    "서로 다른 공식 URL이 같은 제목을 써도 두 건으로 인정해야 한다",
  );
});

test("상투적인 모집 문구만 겹치는 서로 다른 현안은 결정형 파생에서도 거부한다", () => {
  const unrelatedTitles = [
    "청년 대상 온라인 서비스 이용 신청 안내",
    "노인 대상 온라인 서비스 이용 신청 안내",
  ];
  assert.deepEqual(selectWeeklyFeatureArchiveTermsForTitles(["온라인", "서비스"], unrelatedTitles), []);
  assert.deepEqual(selectWeeklyFeatureArchiveTermsForTitles(["지원", "사업"], unrelatedTitles), []);
  assert.deepEqual(
    selectWeeklyFeatureArchiveTermsForTitles(
      ["2026년", "지원사업"],
      [
        "수원시 2026년 청년 주거 지원사업 모집",
        "용인시 2026년 청년 창업 지원사업 모집",
      ],
    ),
    [],
    "연도와 범용 사업 유형은 고유 현안 식별자가 아니다",
  );

  const unrelatedCandidates = unrelatedTitles.map((title, index) => ({
    ...evidence[index],
    title,
  }));
  assert.match(
    validateTopicSelection(
      {
        headline: "서로 다른 온라인 서비스 두 건을 동일 현안으로 오인하지 않는다",
        angle: "대상과 목적이 다른 공고가 상투적인 표현만 겹칠 때 자동 묶음을 차단한다.",
        rationale: "온라인과 서비스 같은 일반적인 표현은 고유 사업이나 기관을 식별하지 못한다.",
        sourceIds: unrelatedCandidates.map((candidate) => candidate.id),
        archiveTerms: ["온라인", "서비스"],
      },
      unrelatedCandidates,
      { minimumSources: MIN_WEEKLY_FEATURE_CURRENT_SOURCES },
    ).join(" "),
    /고유 사업·기관 식별자/,
  );
});

test("핵심어가 선택 제목 전체에 흩어져 있으면 같은 현안 근거로 인정하지 않는다", () => {
  const splitCandidates = [
    { ...evidence[0], title: "포천 고속도로 추진계획" },
    { ...evidence[1], title: "철원 접경지역 교통대책" },
  ];
  const errors = validateTopicSelection(
    {
      headline: "포천과 철원 접경 교통 현안을 함께 점검한다",
      angle: "두 공식자료가 실제로 동일한 사업을 다루는지 제목 기준으로 엄격하게 검증한다.",
      rationale: "모델이 고른 핵심어가 서로 다른 제목에 나뉘어 있을 때 오탐을 막기 위한 검사다.",
      sourceIds: splitCandidates.map((source) => source.id),
      archiveTerms: ["포천", "철원"],
    },
    splitCandidates,
    { minimumSources: MIN_WEEKLY_FEATURE_CURRENT_SOURCES },
  );

  assert.match(errors.join(" "), /함께 나타나는 공식자료가 2개 미만/);
});

test("모든 핵심어가 각 제목에 있는 이번 주 자료만 seed로 인정한다", () => {
  const unrelated = {
    ...evidence[2],
    id: "s017-99",
    title: "경기도, 다른 지역 고속도로 지원계획 발표",
    url: "https://gnews.gg.go.kr/briefing/brief_gongbo_view.do?BS_CODE=s017&number=99",
  };
  const topic = {
    headline: "포천-철원 고속도로 예비타당성조사의 현재 단계",
    angle: "접경지역 교통망 사업의 조사 단계와 비용·수요 검증 쟁점을 살핀다.",
    rationale: "같은 고속도로 현안을 직접 다루는 이번 주 자료만 출발점으로 삼는다.",
    sourceIds: [evidence[0].id, unrelated.id, evidence[1].id],
    archiveTerms: ["포천", "철원", "고속도로"],
  };

  assert.equal(normalizeWeeklyFeatureIssueText("포천~철원  고속도로"), "포천 철원 고속도로");
  assert.equal(matchesWeeklyFeatureIssueTitle("포천-철원 고속도로 추진", topic.archiveTerms), true);
  assert.equal(matchesWeeklyFeatureIssueTitle(unrelated.title, topic.archiveTerms), false);
  assert.deepEqual(
    selectWeeklyFeatureCurrentCandidates(topic, [...evidence, unrelated]).map((source) => source.id),
    [evidence[0].id, evidence[1].id],
    "모델이 unrelated 세 번째 ID를 섞어도 보강 early-return 근거가 되면 안 된다",
  );
});

test("생성 섹션을 편집 규격 순서로 고정하고 RSI 수정은 최대 두 회 허용한다", () => {
  const shuffled = [
    draft.sections[3],
    draft.sections[0],
    draft.sections[4],
    draft.sections[2],
    draft.sections[1],
  ];
  const canonical = canonicalizeWeeklyFeatureSections(shuffled);

  assert.deepEqual(
    canonical.map((section) => section.role),
    WEEKLY_FEATURE_SECTION_ROLES,
  );
  assert.deepEqual(
    shuffled.map((section) => section.role),
    ["반론", "현황", "대안·전망", "데이터·사례", "원인"],
    "입력 배열 자체는 변경하지 않아야 한다",
  );
  assert.deepEqual(validateDraftForSources({ ...draft, sections: canonical }, evidence), []);

  const duplicateRole = structuredClone(draft);
  duplicateRole.sections[4].role = "현황";
  const canonicalDuplicate = canonicalizeWeeklyFeatureSections(duplicateRole.sections);
  assert.match(
    validateDraftForSources({ ...duplicateRole, sections: canonicalDuplicate }, evidence).join(" "),
    /섹션 역할/,
    "정렬이 중복 역할이나 누락 역할을 정상 구조로 위장하면 안 된다",
  );
  assert.equal(MAX_WEEKLY_FEATURE_RSI_REVISION_CYCLES, 2);
});

test("주제 선정은 로컬 오류와 동일 현안 규칙으로 최대 두 번만 재선정한다", () => {
  assert.equal(MAX_WEEKLY_FEATURE_TOPIC_REVISION_CYCLES, 2);
  assert.match(
    weeklyFeatureAutomationSource,
    /correctionCycle <= MAX_WEEKLY_FEATURE_TOPIC_REVISION_CYCLES/,
  );
  assert.match(weeklyFeatureAutomationSource, /직전 정규화 주제 JSON/);
  assert.match(weeklyFeatureAutomationSource, /직전 로컬 검증 오류\(문구 그대로\)/);
  assert.match(weeklyFeatureAutomationSource, /선택 자료 제목 각각에 모두 등장하는 비일반 핵심어 2~4개/);
  assert.match(weeklyFeatureAutomationSource, /후보 JSON\(모든 시도에서 동일\)/);
  assert.match(weeklyFeatureAutomationSource, /previousTopic = topic/);
  assert.doesNotMatch(weeklyFeatureAutomationSource, /previousTopic = normalizedTopic/);
});

test("기사 생성과 RSI 판정 프롬프트가 절차 상태·출처 매핑·판정 경계를 고정한다", () => {
  assert.match(weeklyFeatureAutomationSource, /통과 건의·촉구·기대·추진·검토/);
  assert.match(weeklyFeatureAutomationSource, /사업 절차 상태를 원문 표현대로 정확히 구분/);
  assert.match(weeklyFeatureAutomationSource, /section\.sourceIds는 공식자료 JSON의 id에 매핑/);
  assert.match(weeklyFeatureAutomationSource, /기사 JSON에 URL 문자열이 직접 없다는 이유만으로/);
  assert.match(weeklyFeatureAutomationSource, /반드시 REVISE로 판정/);
  assert.match(weeklyFeatureAutomationSource, /기사 전체를 다시 써도 안전한 발행이 불가능/);
  assert.match(weeklyFeatureAutomationSource, /누락·부정확·단정 표현은 HOLD 사유가 아니다/);
});

test("AI Gateway 텍스트·RSI 라우팅은 공급자 다변화 폴백과 설정 검증을 강제한다", () => {
  assert.deepEqual(DEFAULT_WEEKLY_FEATURE_TEXT_FALLBACK_MODELS, [
    "openai/gpt-5-nano",
    "google/gemini-2.5-flash-lite",
  ]);
  assert.equal(DEFAULT_WEEKLY_FEATURE_RSI_MODEL, "google/gemini-2.5-flash");
  assert.deepEqual(DEFAULT_WEEKLY_FEATURE_RSI_FALLBACK_MODELS, [
    "openai/gpt-4.1-mini",
    "openai/gpt-5.4-nano",
  ]);
  assert.equal(
    new Set(
      [DEFAULT_WEEKLY_FEATURE_TEXT_MODEL, ...DEFAULT_WEEKLY_FEATURE_TEXT_FALLBACK_MODELS].map(
        (model) => model.split("/")[0],
      ),
    ).size,
    2,
  );
  assert.equal(
    new Set(
      [DEFAULT_WEEKLY_FEATURE_RSI_MODEL, ...DEFAULT_WEEKLY_FEATURE_RSI_FALLBACK_MODELS].map(
        (model) => model.split("/")[0],
      ),
    ).size,
    2,
  );

  assert.deepEqual(
    resolveWeeklyFeatureGatewayFallbackModels({
      primaryModel: "openai/gpt-5.4-nano",
      configuredModels:
        " openai/gpt-5-nano, openai/gpt-5.4-nano, openai/gpt-5-nano, google/gemini-2.5-flash-lite ",
      defaultModels: DEFAULT_WEEKLY_FEATURE_TEXT_FALLBACK_MODELS,
      envName: "TEST_FALLBACK_MODELS",
    }),
    ["openai/gpt-5-nano", "google/gemini-2.5-flash-lite"],
  );
  assert.throws(
    () =>
      resolveWeeklyFeatureGatewayFallbackModels({
        primaryModel: "openai/gpt-5.4-nano",
        configuredModels: "invalid-model",
        defaultModels: DEFAULT_WEEKLY_FEATURE_TEXT_FALLBACK_MODELS,
        envName: "TEST_FALLBACK_MODELS",
      }),
    /provider\/model/,
  );
  assert.throws(
    () =>
      resolveWeeklyFeatureGatewayFallbackModels({
        primaryModel: "openai/gpt-5.4-nano",
        configuredModels: "openai/gpt-5.4-nano, openai/gpt-5.4-nano",
        defaultModels: DEFAULT_WEEKLY_FEATURE_TEXT_FALLBACK_MODELS,
        envName: "TEST_FALLBACK_MODELS",
      }),
    /폴백 모델이 하나 이상/,
  );

  assert.match(weeklyFeatureAutomationSource, /WEEKLY_FEATURE_TEXT_FALLBACK_MODELS/);
  assert.match(weeklyFeatureAutomationSource, /WEEKLY_FEATURE_RSI_FALLBACK_MODELS/);
  assert.equal(
    weeklyFeatureAutomationSource.match(
      /providerOptions:\s*\{\s*gateway:\s*routing\.gatewayOptions\s*\}/g,
    )?.length,
    3,
    "주제·기사·수정 생성 호출은 Gateway 모델 폴백을 사용해야 한다",
  );
  assert.match(weeklyFeatureAutomationSource, /gateway:\s*gatewayOptions/);
  assert.match(weeklyFeatureAutomationSource, /NoObjectGeneratedError\.isInstance\(error\)/);
  assert.match(weeklyFeatureAutomationSource, /thinkingBudget:\s*RSI_GOOGLE_THINKING_BUDGET/);
  assert.match(weeklyFeatureAutomationSource, /maxOutputTokens:\s*RSI_MAX_OUTPUT_TOKENS/);
  assert.match(weeklyFeatureAutomationSource, /RSI_STRUCTURED_OUTPUT_ATTEMPTS/);
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

test("공식 아카이브 제목 검색은 보드별 search 코드를 쓰고 날짜 query를 보내지 않는다", () => {
  const [provincial, municipal] = WEEKLY_FEATURE_BOARDS;
  const provincialUrl = new URL(buildWeeklyFeatureArchiveSearchUrl(provincial, "철원", 1));
  const municipalUrl = new URL(buildWeeklyFeatureArchiveSearchUrl(municipal, "철원~", 1));

  assert.equal(provincialUrl.searchParams.get("search"), "8");
  assert.equal(municipalUrl.searchParams.get("search"), "1");
  assert.equal(municipalUrl.searchParams.get("keyword"), "철원");
  for (const url of [provincialUrl, municipalUrl]) {
    assert.equal(url.searchParams.has("period_1"), false);
    assert.equal(url.searchParams.has("period_2"), false);
  }
  assert.throws(() => buildWeeklyFeatureArchiveSearchUrl(municipal, "정책", 0), /1 이상의 정수/);
});

test("5년 공식 아카이브에서 모든 핵심어가 있는 과거 제목만 보강 후보로 고른다", () => {
  const municipal = WEEKLY_FEATURE_BOARDS[1];
  const archiveRows = parseWeeklyFeatureArchiveListHtml({
    html: readFileSync(
      new URL("./fixtures/weekly-feature-s003-archive-list.html", import.meta.url),
      "utf8",
    ),
    board: municipal,
    weekStart: "2021-09-05",
    sourceEnd: "2026-09-05",
  });
  assert.deepEqual(
    archiveRows.map((source) => source.id),
    ["s003-114684", "s003-105000", "s003-104000", "s003-103000"],
    "5년보다 오래된 결과는 파싱 단계에서 제외해야 한다",
  );
  assert.equal(
    archiveRows.find((source) => source.id === "s003-105000")?.url,
    "https://gnews.gg.go.kr/briefing/brief_gongbo_view.do?BS_CODE=s003&number=105000",
    "검색 query가 상세 근거 URL에 남으면 안 된다",
  );

  const selected = selectWeeklyFeatureSupplementalCandidates({
    candidates: archiveRows,
    currentEvidence: evidence.slice(0, 2),
    archiveTerms: ["포천", "철원", "고속도로"],
    weekStart: "2026-08-31",
    maximum: 4,
  });
  assert.deepEqual(selected.map((source) => source.id), ["s003-105000"]);
});

test("SOC 현안일 때만 PIMAC을 검색하고 숫자 조사 ID와 상세 본문을 안전하게 파싱한다", () => {
  const topic = {
    headline: "포천-철원 고속도로 예비타당성조사의 현재 단계",
    angle: "접경지역 교통망 사업의 조사 단계와 비용·수요 검증 쟁점을 살핀다.",
    rationale: "같은 고속도로 현안을 직접 다루는 공식자료를 교차 확인한다.",
    sourceIds: evidence.slice(0, 2).map((source) => source.id),
    archiveTerms: ["포천", "철원", "고속도로"],
  };
  assert.equal(shouldSearchWeeklyFeaturePimac(topic, evidence.slice(0, 2)), true);
  assert.equal(
    shouldSearchWeeklyFeaturePimac(
      {
        ...topic,
        headline: "포천시 돌봄 서비스 운영 점검",
        angle: "지역 돌봄 서비스의 이용 대상과 운영 현황을 확인한다.",
        archiveTerms: ["포천", "돌봄"],
      },
      [{ ...evidence[0], title: "포천시 돌봄 서비스 운영 점검" }],
    ),
    false,
  );

  const pimacSearchUrl = new URL(buildPimacProjectSearchUrl("포천"));
  assert.equal(pimacSearchUrl.hostname, "pimac.kdi.re.kr");
  assert.equal(pimacSearchUrl.pathname, "/study/fina_list.jsp");
  assert.equal(pimacSearchUrl.searchParams.get("pp"), "10");

  const pimacCandidates = parsePimacProjectSearchHtml({
    html: readFileSync(
      new URL("./fixtures/weekly-feature-pimac-list.html", import.meta.url),
      "utf8",
    ),
    archiveStart: "2021-09-05",
    sourceEnd: "2026-09-05",
  });
  assert.deepEqual(pimacCandidates.map((source) => source.id), ["pimac-fina-372", "pimac-fina-312"]);
  const direct = pimacCandidates.find((source) => source.id === "pimac-fina-312");
  assert.ok(direct);
  assert.equal(
    direct.url,
    "https://pimac.kdi.re.kr/study/fina_view.jsp?exmn_no=312",
  );

  const parsed = parsePimacProjectDetailHtml(
    readFileSync(new URL("./fixtures/weekly-feature-pimac-detail.html", import.meta.url), "utf8"),
    direct,
  );
  assert.equal(parsed.title, "포천-철원 고속도로 건설사업");
  assert.match(parsed.bodyText, /최종 조사 결과와 상이할 수 있다/);
  assert.throws(
    () =>
      parsePimacProjectDetailHtml(
        readFileSync(
          new URL("./fixtures/weekly-feature-pimac-detail.html", import.meta.url),
          "utf8",
        ),
        { ...direct, id: "pimac-fina-999" },
      ),
    /식별자가 후보와 다릅니다/,
  );
});

test("이번 주 seed와 아카이브·PIMAC 근거는 중복 없이 최대 6건으로 합친다", () => {
  const historicEvidence: WeeklyFeatureEvidence = {
    id: "s003-105000",
    title: "포천시, 포천-철원 고속도로 예비타당성조사 대상 사업 선정",
    date: "2025-04-30",
    url: "https://gnews.gg.go.kr/briefing/brief_gongbo_view.do?BS_CODE=s003&number=105000",
    sourceName: "경기도 시군 보도자료",
    summary: "과거 추진단계 공식 요약",
    bodyText: "과거 추진단계를 확인하는 공식 본문입니다.".repeat(20),
  };
  const pimacEvidence: WeeklyFeatureEvidence = {
    id: "pimac-fina-312",
    title: "포천-철원 고속도로 건설사업",
    date: "2025-06-05",
    url: "https://pimac.kdi.re.kr/study/fina_view.jsp?exmn_no=312",
    sourceName: "KDI 공공투자관리센터",
    summary: "예비타당성조사 현황",
    bodyText: "공식 사업규모와 조사단계를 확인하는 본문입니다.".repeat(20),
  };
  const merged = mergeWeeklyFeatureEvidence(
    evidence.slice(0, 2),
    [historicEvidence, pimacEvidence, historicEvidence, ...evidence],
  );

  assert.deepEqual(
    merged.map((source) => source.id),
    [evidence[0].id, evidence[1].id, historicEvidence.id, pimacEvidence.id, evidence[2].id],
  );
  assert.equal(merged.length <= MAX_WEEKLY_FEATURE_SOURCES, true);
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
  assert.match(html, /경기도 및 관계기관 공식 공개자료/);
  assert.doesNotMatch(html, /위 경기도 공식 공개자료/);
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
