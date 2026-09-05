const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const MIN_WEEKLY_FEATURE_SOURCES = 3;
export const MIN_WEEKLY_FEATURE_CURRENT_SOURCES = 2;
export const MAX_WEEKLY_FEATURE_SOURCES = 6;
export const MIN_WEEKLY_FEATURE_BODY_CHARS = 2_500;
export const MAX_WEEKLY_FEATURE_BODY_CHARS = 5_000;
export const MAX_WEEKLY_FEATURE_RSI_REVISION_CYCLES = 2;
export const WEEKLY_FEATURE_INVOCATION_BUDGET_MS = 245_000;
export const WEEKLY_FEATURE_MIN_STAGE_REMAINING_MS = 5_000;
export const DEFAULT_WEEKLY_FEATURE_TEXT_MODEL = "openai/gpt-5.4-nano";
export const DEFAULT_WEEKLY_FEATURE_TEXT_FALLBACK_MODELS = [
  "openai/gpt-5-nano",
  "google/gemini-2.5-flash-lite",
] as const;
export const DEFAULT_WEEKLY_FEATURE_RSI_MODEL = "google/gemini-2.5-flash";
export const DEFAULT_WEEKLY_FEATURE_RSI_FALLBACK_MODELS = [
  "openai/gpt-4.1-mini",
  "openai/gpt-5.4-nano",
] as const;
export const WEEKLY_FEATURE_SECTION_ROLES = [
  "현황",
  "원인",
  "데이터·사례",
  "반론",
  "대안·전망",
] as const;

export type WeeklyFeatureSectionRole = (typeof WEEKLY_FEATURE_SECTION_ROLES)[number];

export type WeeklyFeatureSchedule = {
  runKey: string;
  weekStart: string;
  sourceEnd: string;
  publishDate: string;
  publishAt: Date;
  publishAtKst: string;
};

export type WeeklyFeatureCandidate = {
  id: string;
  title: string;
  date: string;
  url: string;
  sourceName: string;
};

export type WeeklyFeatureEvidence = WeeklyFeatureCandidate & {
  summary: string;
  bodyText: string;
};

export type WeeklyFeatureTopic = {
  headline: string;
  angle: string;
  rationale: string;
  sourceIds: string[];
  archiveTerms: string[];
};

export type WeeklyFeatureSection = {
  role: WeeklyFeatureSectionRole;
  heading: string;
  paragraphs: string[];
  sourceIds: string[];
};

export type WeeklyFeatureDraft = {
  title: string;
  subtitle: string;
  lead: string;
  sections: WeeklyFeatureSection[];
  conclusion: string;
  tags: string[];
  imagePrompt: string;
};

export type WeeklyFeatureImageKind = "ai" | "fallback-svg";

export type WeeklyFeatureInvocationBudget = {
  deadlineAtMs: number;
  signal: AbortSignal;
};

export function createWeeklyFeatureInvocationBudget(
  nowMs = Date.now(),
  budgetMs = WEEKLY_FEATURE_INVOCATION_BUDGET_MS,
): WeeklyFeatureInvocationBudget {
  if (!Number.isFinite(nowMs) || !Number.isFinite(budgetMs) || budgetMs <= 0) {
    throw new Error("주간 특집 전역 실행시간 예산이 올바르지 않습니다.");
  }
  const durationMs = Math.ceil(budgetMs);
  return {
    deadlineAtMs: nowMs + durationMs,
    signal: AbortSignal.timeout(durationMs),
  };
}

export function remainingWeeklyFeatureInvocationMs(
  budget: WeeklyFeatureInvocationBudget,
  nowMs = Date.now(),
): number {
  return Math.max(0, budget.deadlineAtMs - nowMs);
}

export function assertWeeklyFeatureInvocationBudget(
  budget: WeeklyFeatureInvocationBudget,
  stage: string,
  nowMs = Date.now(),
  minimumRemainingMs = WEEKLY_FEATURE_MIN_STAGE_REMAINING_MS,
): number {
  const remainingMs = remainingWeeklyFeatureInvocationMs(budget, nowMs);
  if (budget.signal.aborted || remainingMs < minimumRemainingMs) {
    throw new Error(
      `주간 특집 전역 실행시간 예산 소진: ${stage} (남은 시간 ${Math.floor(remainingMs)}ms)`,
    );
  }
  return remainingMs;
}

export function createWeeklyFeatureStageSignal(params: {
  budget: WeeklyFeatureInvocationBudget;
  stage: string;
  timeoutMs: number;
  signals?: AbortSignal[];
}): AbortSignal {
  const { budget, stage, timeoutMs, signals = [] } = params;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`주간 특집 단계 제한시간이 올바르지 않습니다: ${stage}`);
  }
  for (const signal of signals) {
    if (signal.aborted) {
      throw new Error(`주간 특집 단계 시작 전에 중단됨: ${stage}`);
    }
  }
  const remainingMs = assertWeeklyFeatureInvocationBudget(budget, stage);
  const stageTimeoutMs = Math.max(1, Math.min(Math.ceil(timeoutMs), Math.floor(remainingMs)));
  return AbortSignal.any([
    budget.signal,
    ...signals,
    AbortSignal.timeout(stageTimeoutMs),
  ]);
}

function hasOnlyWeeklyFeatureSearchParams(url: URL, allowed: ReadonlySet<string>): boolean {
  return [...url.searchParams.keys()].every((key) => allowed.has(key));
}

export function assertWeeklyFeatureOfficialUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash) {
    throw new Error(`허용되지 않은 공식자료 URL: ${value}`);
  }

  const pathname = url.pathname.replace(/;jsessionid=[^/]+$/i, "");
  if (url.hostname === "gnews.gg.go.kr") {
    if (pathname === "/briefing/brief_gongbo_view.do") {
      const boardCode = url.searchParams.get("BS_CODE");
      const number = url.searchParams.get("number");
      if (
        hasOnlyWeeklyFeatureSearchParams(url, new Set(["BS_CODE", "number"])) &&
        (boardCode === "s017" || boardCode === "s003") &&
        Boolean(number && /^\d+$/.test(number))
      ) {
        return url;
      }
    }

    const expectedBoard =
      pathname === "/briefing/brief_gongbo.do"
        ? { code: "s017", search: "8" }
        : pathname === "/briefing/brief_sigun.do"
          ? { code: "s003", search: "1" }
          : null;
    if (expectedBoard) {
      const page = url.searchParams.get("page");
      const search = url.searchParams.get("search");
      const keyword = url.searchParams.get("keyword");
      const searchPairValid =
        search === null && keyword === null
          ? true
          : search === expectedBoard.search && Boolean(keyword && keyword.length <= 30);
      if (
        hasOnlyWeeklyFeatureSearchParams(
          url,
          new Set(["page", "BS_CODE", "search", "keyword"]),
        ) &&
        url.searchParams.get("BS_CODE") === expectedBoard.code &&
        Boolean(page && /^\d+$/.test(page) && Number(page) >= 1) &&
        searchPairValid
      ) {
        return url;
      }
    }
  }

  if (url.hostname === "pimac.kdi.re.kr") {
    if (
      pathname === "/study/fina_list.jsp" &&
      hasOnlyWeeklyFeatureSearchParams(url, new Set(["pp", "bizNm"])) &&
      url.searchParams.get("pp") === "10" &&
      Boolean(url.searchParams.get("bizNm"))
    ) {
      return url;
    }
    if (
      pathname === "/study/fina_view.jsp" &&
      hasOnlyWeeklyFeatureSearchParams(url, new Set(["exmn_no"])) &&
      /^\d+$/.test(url.searchParams.get("exmn_no") ?? "")
    ) {
      return url;
    }
  }

  throw new Error(`허용되지 않은 공식자료 URL: ${value}`);
}

const GENERIC_WEEKLY_FEATURE_ARCHIVE_TERMS = new Set([
  "경기",
  "경기도",
  "공식자료",
  "관리",
  "관련",
  "개선",
  "계획",
  "공동",
  "대책",
  "도민",
  "발표",
  "보도자료",
  "사업",
  "시민",
  "운영",
  "예정",
  "예타",
  "정책",
  "주민",
  "지원",
  "지역",
  "추진",
  "통과",
  "촉구",
  "현안",
  "확대",
  "확정",
]);

/** 검색 결과의 구두점 차이를 없애 동일 사업명 여부를 보수적으로 비교한다. */
export function normalizeWeeklyFeatureIssueText(value: string): string {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .replace(/[^0-9a-z\p{Script=Hangul}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isGenericWeeklyFeatureArchiveTerm(value: string): boolean {
  const normalized = normalizeWeeklyFeatureIssueText(value);
  return (
    !normalized ||
    normalized.split(" ").every((term) => GENERIC_WEEKLY_FEATURE_ARCHIVE_TERMS.has(term))
  );
}

/** 모델 응답에서 일반어와 중복을 제거해 실제 과거 자료 검색에 쓸 핵심어만 남긴다. */
export function sanitizeWeeklyFeatureArchiveTerms(values: readonly string[]): string[] {
  const sanitized: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const normalized = normalizeWeeklyFeatureIssueText(value);
    if (!normalized || seen.has(normalized) || isGenericWeeklyFeatureArchiveTerm(normalized)) {
      continue;
    }

    seen.add(normalized);
    sanitized.push(normalized);
    if (sanitized.length === 4) break;
  }

  return sanitized;
}

function weeklyFeatureArchiveTermCombinations(values: string[], size: number): string[][] {
  const combinations: string[][] = [];

  function collect(start: number, current: string[]): void {
    if (current.length === size) {
      combinations.push([...current]);
      return;
    }

    const remaining = size - current.length;
    for (let index = start; index <= values.length - remaining; index += 1) {
      current.push(values[index]);
      collect(index + 1, current);
      current.pop();
    }
  }

  collect(0, []);
  return combinations;
}

/** 선택 자료 중 최소 두 제목에 함께 나타나는 가장 큰 핵심어 조합을 고정 순서로 고른다. */
export function selectWeeklyFeatureArchiveTermsForTitles(
  values: readonly string[],
  selectedTitles: readonly string[],
): string[] {
  const sanitized = sanitizeWeeklyFeatureArchiveTerms(values);

  for (let size = sanitized.length; size >= 2; size -= 1) {
    for (const combination of weeklyFeatureArchiveTermCombinations(sanitized, size)) {
      const matchingTitleCount = selectedTitles.filter((title) =>
        matchesWeeklyFeatureIssueTitle(title, combination),
      ).length;
      if (matchingTitleCount >= MIN_WEEKLY_FEATURE_CURRENT_SOURCES) return combination;
    }
  }

  return [];
}

/** 모든 핵심어가 제목에 직접 나타날 때만 같은 현안의 보강 자료로 인정한다. */
export function matchesWeeklyFeatureIssueTitle(title: string, archiveTerms: string[]): boolean {
  const normalizedTitle = normalizeWeeklyFeatureIssueText(title);
  const normalizedTerms = [
    ...new Set(archiveTerms.map(normalizeWeeklyFeatureIssueText).filter(Boolean)),
  ];
  return (
    normalizedTerms.length >= 2 &&
    normalizedTerms.length <= 4 &&
    normalizedTerms.every(
      (term) => !isGenericWeeklyFeatureArchiveTerm(term) && normalizedTitle.includes(term),
    )
  );
}

export function selectWeeklyFeatureCurrentCandidates(
  topic: WeeklyFeatureTopic,
  candidates: WeeklyFeatureCandidate[],
): WeeklyFeatureCandidate[] {
  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const selected: WeeklyFeatureCandidate[] = [];
  const seen = new Set<string>();
  for (const id of topic.sourceIds) {
    const candidate = candidateById.get(id);
    if (
      !candidate ||
      seen.has(candidate.id) ||
      !matchesWeeklyFeatureIssueTitle(candidate.title, topic.archiveTerms)
    ) {
      continue;
    }
    seen.add(candidate.id);
    selected.push(candidate);
  }
  return selected;
}

export function shouldSearchWeeklyFeaturePimac(
  topic: WeeklyFeatureTopic,
  currentSources: WeeklyFeatureCandidate[],
): boolean {
  const subject = normalizeWeeklyFeatureIssueText(
    [
      topic.headline,
      topic.angle,
      ...topic.archiveTerms,
      ...currentSources.map((source) => source.title),
    ].join(" "),
  );
  return /(?:예타|예비타당성|타당성|고속도로|철도|도로|교량|터널|공항|항만|soc|건설)/i.test(
    subject,
  );
}

export function mergeWeeklyFeatureEvidence(
  currentEvidence: WeeklyFeatureEvidence[],
  supplementalEvidence: WeeklyFeatureEvidence[],
  maximum = MAX_WEEKLY_FEATURE_SOURCES,
): WeeklyFeatureEvidence[] {
  const merged: WeeklyFeatureEvidence[] = [];
  const ids = new Set<string>();
  const urls = new Set<string>();

  for (const source of [...currentEvidence, ...supplementalEvidence]) {
    if (ids.has(source.id) || urls.has(source.url)) continue;
    ids.add(source.id);
    urls.add(source.url);
    merged.push(source);
    if (merged.length >= maximum) break;
  }

  return merged;
}

export function selectWeeklyFeatureSupplementalCandidates(params: {
  candidates: WeeklyFeatureCandidate[];
  currentEvidence: WeeklyFeatureEvidence[];
  archiveTerms: string[];
  weekStart: string;
  maximum: number;
}): WeeklyFeatureCandidate[] {
  const currentIds = new Set(params.currentEvidence.map((source) => source.id));
  const currentUrls = new Set(params.currentEvidence.map((source) => source.url));
  const byUrl = new Map<string, WeeklyFeatureCandidate>();

  for (const candidate of params.candidates) {
    if (
      candidate.date >= params.weekStart ||
      currentIds.has(candidate.id) ||
      currentUrls.has(candidate.url) ||
      !matchesWeeklyFeatureIssueTitle(candidate.title, params.archiveTerms)
    ) {
      continue;
    }
    const existing = byUrl.get(candidate.url);
    if (!existing || candidate.date > existing.date) byUrl.set(candidate.url, candidate);
  }

  return [...byUrl.values()]
    .sort((left, right) => right.date.localeCompare(left.date) || left.id.localeCompare(right.id))
    .slice(0, params.maximum);
}

const GATEWAY_MODEL_SLUG_PATTERN =
  /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i;

export function validateWeeklyFeatureGatewayModelSlug(value: string, label: string): string {
  const model = value.trim();
  if (!GATEWAY_MODEL_SLUG_PATTERN.test(model)) {
    throw new Error(`${label}은 provider/model 형식이어야 합니다: ${model || "(빈 값)"}`);
  }
  return model;
}

export function resolveWeeklyFeatureGatewayFallbackModels(params: {
  primaryModel: string;
  configuredModels?: string;
  defaultModels: readonly string[];
  envName: string;
}): string[] {
  const { primaryModel, configuredModels, defaultModels, envName } = params;
  const validatedPrimary = validateWeeklyFeatureGatewayModelSlug(primaryModel, "주 모델");
  const hasConfiguredModels = Boolean(configuredModels?.trim());
  const rawModels = hasConfiguredModels ? configuredModels!.split(",") : [...defaultModels];
  const seen = new Set([validatedPrimary]);
  const fallbacks: string[] = [];

  for (const rawModel of rawModels) {
    const candidate = rawModel.trim();
    if (!candidate) continue;
    const model = validateWeeklyFeatureGatewayModelSlug(candidate, envName);
    if (seen.has(model)) continue;
    seen.add(model);
    fallbacks.push(model);
  }

  if (fallbacks.length === 0) {
    throw new Error(`${envName}에는 주 모델과 다른 유효한 폴백 모델이 하나 이상 필요합니다.`);
  }
  return fallbacks;
}

/**
 * 구조화 출력 모델이 섹션을 다른 순서로 반환해도 편집 규격의 순서로 고정한다.
 * 중복·누락 역할은 그대로 남겨 후속 구조 검사가 발행을 차단하도록 한다.
 */
export function canonicalizeWeeklyFeatureSections(
  sections: WeeklyFeatureSection[],
): WeeklyFeatureSection[] {
  const roleOrder = new Map<WeeklyFeatureSectionRole, number>(
    WEEKLY_FEATURE_SECTION_ROLES.map((role, index) => [role, index]),
  );

  return sections
    .map((section, originalIndex) => ({ section, originalIndex }))
    .sort((left, right) => {
      const roleDifference =
        (roleOrder.get(left.section.role) ?? Number.MAX_SAFE_INTEGER) -
        (roleOrder.get(right.section.role) ?? Number.MAX_SAFE_INTEGER);
      return roleDifference || left.originalIndex - right.originalIndex;
    })
    .map(({ section }) => section);
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function utcDateToken(value: Date): string {
  return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
}

/**
 * 주어진 instant를 Asia/Seoul 달력으로 투영해 그 주 월요일과 토요일 09:00를 계산한다.
 * 한국은 DST가 없으므로 고정 +09:00 오프셋을 사용해 런타임의 시스템 타임존과 무관하다.
 */
export function buildWeeklyFeatureSchedule(now: Date): WeeklyFeatureSchedule {
  if (Number.isNaN(now.getTime())) throw new Error("유효하지 않은 실행 시각입니다.");

  const kstClock = new Date(now.getTime() + KST_OFFSET_MS);
  const daysSinceMonday = (kstClock.getUTCDay() + 6) % 7;
  const mondayClock = new Date(
    Date.UTC(
      kstClock.getUTCFullYear(),
      kstClock.getUTCMonth(),
      kstClock.getUTCDate() - daysSinceMonday,
    ),
  );
  const saturdayClock = new Date(mondayClock.getTime() + 5 * DAY_MS);
  const localDate = utcDateToken(kstClock);
  const weekStart = utcDateToken(mondayClock);
  const publishDate = utcDateToken(saturdayClock);
  const sourceEnd = localDate < publishDate ? localDate : publishDate;
  const publishAtKst = `${publishDate}T09:00:00+09:00`;

  return {
    runKey: `gyeonggi-feature:${publishDate}`,
    weekStart,
    sourceEnd,
    publishDate,
    publishAt: new Date(publishAtKst),
    publishAtKst,
  };
}

export function isBeforeWeeklyFeaturePublishDeadline(
  now: Date,
  schedule: WeeklyFeatureSchedule,
): boolean {
  if (Number.isNaN(now.getTime())) return false;
  return now.getTime() < schedule.publishAt.getTime();
}

export function validateTopicSelection(
  topic: WeeklyFeatureTopic,
  candidates: WeeklyFeatureCandidate[],
  options: { minimumSources?: number } = {},
): string[] {
  const errors: string[] = [];
  const minimumSources = options.minimumSources ?? MIN_WEEKLY_FEATURE_SOURCES;
  const knownIds = new Set(candidates.map((candidate) => candidate.id));
  const selectedIds = [...new Set(topic.sourceIds.map((id) => id.trim()).filter(Boolean))];
  const selectedTitles = candidates
    .filter((candidate) => selectedIds.includes(candidate.id))
    .map((candidate) => candidate.title)
    .join(" ");
  const archiveTerms = [
    ...new Set(topic.archiveTerms.map(normalizeWeeklyFeatureIssueText).filter(Boolean)),
  ];

  if (topic.headline.trim().length < 10) errors.push("주제 제목이 너무 짧습니다.");
  if (topic.angle.trim().length < 20) errors.push("취재 관점이 충분히 구체적이지 않습니다.");
  if (topic.rationale.trim().length < 20) errors.push("주제 선정 근거가 충분하지 않습니다.");
  if (selectedIds.length < minimumSources) {
    errors.push(`서로 다른 공식 근거가 ${minimumSources}개 미만입니다.`);
  }
  if (selectedIds.some((id) => !knownIds.has(id))) {
    errors.push("후보 목록에 없는 출처 ID가 포함됐습니다.");
  }
  if (archiveTerms.length < 2 || archiveTerms.length > 4) {
    errors.push("과거 공식자료 검색 핵심어는 서로 다른 2~4개여야 합니다.");
  }
  if (archiveTerms.some((term) => term.length < 2 || term.length > 30)) {
    errors.push("과거 공식자료 검색 핵심어는 각각 2~30자여야 합니다.");
  }
  if (archiveTerms.some((term) => isGenericWeeklyFeatureArchiveTerm(term))) {
    errors.push("과거 공식자료 검색 핵심어에 일반어만 사용할 수 없습니다.");
  }
  const normalizedSelectedTitles = normalizeWeeklyFeatureIssueText(selectedTitles);
  if (archiveTerms.some((term) => !normalizedSelectedTitles.includes(term))) {
    errors.push("과거 공식자료 검색 핵심어는 선택한 이번 주 자료 제목에서 확인돼야 합니다.");
  }

  return errors;
}

export function validateDraftForSources(
  draft: WeeklyFeatureDraft,
  evidence: WeeklyFeatureEvidence[],
): string[] {
  const errors: string[] = [];
  const knownIds = new Set(evidence.map((source) => source.id));
  const citedIds = new Set<string>();

  if (draft.title.trim().length < 10 || draft.title.trim().length > 120) {
    errors.push("기사 제목은 10~120자여야 합니다.");
  }
  if (draft.subtitle.trim().length < 15 || draft.subtitle.trim().length > 180) {
    errors.push("부제는 15~180자여야 합니다.");
  }
  if (draft.lead.trim().length < 60) errors.push("리드문이 60자 미만입니다.");
  if (draft.sections.length !== WEEKLY_FEATURE_SECTION_ROLES.length) {
    errors.push("본문은 현황 → 원인 → 데이터·사례 → 반론 → 대안·전망의 5개 섹션이어야 합니다.");
  }
  if (draft.conclusion.trim().length < 60) errors.push("결론이 60자 미만입니다.");
  if (draft.imagePrompt.trim().length < 20) errors.push("대표 이미지 프롬프트가 너무 짧습니다.");
  const bodyCharacters = weeklyFeatureDraftText(draft).length;
  if (bodyCharacters < MIN_WEEKLY_FEATURE_BODY_CHARS) {
    errors.push(`기사 본문이 공백 포함 ${MIN_WEEKLY_FEATURE_BODY_CHARS}자 미만입니다.`);
  }
  if (bodyCharacters > MAX_WEEKLY_FEATURE_BODY_CHARS) {
    errors.push(`기사 본문이 공백 포함 ${MAX_WEEKLY_FEATURE_BODY_CHARS}자를 초과합니다.`);
  }

  let paragraphCount = 0;
  for (const [index, section] of draft.sections.entries()) {
    const expectedRole = WEEKLY_FEATURE_SECTION_ROLES[index];
    if (section.role !== expectedRole) {
      errors.push(
        `${index + 1}번째 섹션 역할은 '${expectedRole ?? "없음"}'이어야 합니다(현재 '${section.role}').`,
      );
    }
    if (section.heading.trim().length < 3) errors.push("비어 있거나 지나치게 짧은 소제목이 있습니다.");
    if (section.paragraphs.length < 2) errors.push(`'${section.heading}' 문단이 2개 미만입니다.`);
    paragraphCount += section.paragraphs.length;
    for (const sourceId of section.sourceIds) {
      if (!knownIds.has(sourceId)) errors.push(`알 수 없는 출처 ID가 인용됐습니다: ${sourceId}`);
      else citedIds.add(sourceId);
    }
  }
  if (paragraphCount < 10) errors.push("5개 섹션의 전체 본문 문단이 10개 미만입니다.");
  if (citedIds.size < MIN_WEEKLY_FEATURE_SOURCES) {
    errors.push(`본문에서 인용한 공식 근거가 ${MIN_WEEKLY_FEATURE_SOURCES}개 미만입니다.`);
  }

  return [...new Set(errors)];
}

export function escapeFeatureHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sourceLinks(sourceIds: string[], sourceById: Map<string, WeeklyFeatureEvidence>): string {
  return [...new Set(sourceIds)]
    .map((id) => sourceById.get(id))
    .filter((source): source is WeeklyFeatureEvidence => Boolean(source))
    .map(
      (source) =>
        `<a href="${escapeFeatureHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeFeatureHtml(source.title)} (${escapeFeatureHtml(source.date)})</a>`,
    )
    .join(" · ");
}

export function buildWeeklyFeatureBodyHtml(params: {
  draft: WeeklyFeatureDraft;
  evidence: WeeklyFeatureEvidence[];
  imageUrl: string;
  imageKind: WeeklyFeatureImageKind;
}): string {
  const { draft, evidence, imageUrl, imageKind } = params;
  const sourceById = new Map(evidence.map((source) => [source.id, source]));
  const caption =
    imageKind === "ai"
      ? "AI 생성 이미지: 기사 이해를 돕기 위해 제작한 자료 이미지입니다."
      : "이 이미지는 기사 이해를 돕기 위해 경인블루저널이 자체 제작한 자료 이미지(SVG)입니다.";
  const parts = [
    `<div class="weekly-gyeonggi-feature" style="font-family:'맑은 고딕','Malgun Gothic',sans-serif;font-size:16px;line-height:1.9">`,
    `<figure style="margin:0 0 1.5em"><img src="${escapeFeatureHtml(imageUrl)}" alt="${escapeFeatureHtml(draft.title)}" style="display:block;width:100%;height:auto" /><figcaption style="margin-top:.55em;color:#666;font-size:13px">${escapeFeatureHtml(caption)}</figcaption></figure>`,
    `<p style="margin:0 0 1.2em"><strong>${escapeFeatureHtml(draft.lead)}</strong></p>`,
  ];

  for (const section of draft.sections) {
    parts.push(`<h2 style="margin:1.6em 0 .65em;font-size:1.35em">${escapeFeatureHtml(section.heading)}</h2>`);
    for (const paragraph of section.paragraphs) {
      parts.push(`<p style="margin:0 0 1em">${escapeFeatureHtml(paragraph)}</p>`);
    }
    const links = sourceLinks(section.sourceIds, sourceById);
    if (links) {
      parts.push(`<p style="margin:.25em 0 1.2em;color:#666;font-size:13px"><strong>이 대목의 공식 근거</strong> : ${links}</p>`);
    }
  }

  parts.push(
    `<p style="margin:1.6em 0 1em"><strong>${escapeFeatureHtml(draft.conclusion)}</strong></p>`,
    `<h2 style="margin:1.6em 0 .65em;font-size:1.35em">공식 근거 자료</h2>`,
    "<ol>",
    ...evidence.map(
      (source) =>
        `<li style="margin-bottom:.55em"><a href="${escapeFeatureHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeFeatureHtml(source.title)}</a> <span style="color:#666">(${escapeFeatureHtml(source.date)}, ${escapeFeatureHtml(source.sourceName)})</span></li>`,
    ),
    "</ol>",
    `<p style="margin-top:1.4em;color:#666;font-size:13px">이 기사는 위 경기도 및 관계기관 공식 공개자료를 교차 검토해 작성했습니다. 링크는 독자가 원문과 수치를 직접 확인할 수 있도록 함께 제공합니다.</p>`,
    "</div>",
  );

  return parts.join("");
}

export function weeklyFeatureBodyText(draft: WeeklyFeatureDraft): string {
  return weeklyFeatureDraftText(draft).slice(0, 1200);
}

/** 분량 검증용 원문. 제목/소제목은 제외하고 리드·본문·결론을 공백 포함해 센다. */
export function weeklyFeatureDraftText(draft: WeeklyFeatureDraft): string {
  return [
    draft.lead,
    ...draft.sections.flatMap((section) => section.paragraphs),
    draft.conclusion,
  ]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeSvgText(value: string): string {
  return escapeFeatureHtml(value).replace(/[\u0000-\u001f\u007f]/g, " ");
}

export function buildWeeklyFeatureFallbackSvg(title: string, weekStart: string): string {
  const safeTitle = escapeSvgText(title.trim().slice(0, 42));
  const safeWeek = escapeSvgText(weekStart);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024" viewBox="0 0 1536 1024" role="img" aria-labelledby="title desc">
  <title id="title">${safeTitle}</title>
  <desc id="desc">경기 현안 심층특집 자료 이미지</desc>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#071d35"/><stop offset="0.55" stop-color="#164a73"/><stop offset="1" stop-color="#d26c3d"/>
    </linearGradient>
    <pattern id="grid" width="64" height="64" patternUnits="userSpaceOnUse">
      <path d="M64 0H0V64" fill="none" stroke="#ffffff" stroke-opacity="0.08" stroke-width="2"/>
    </pattern>
  </defs>
  <rect width="1536" height="1024" fill="url(#bg)"/>
  <rect width="1536" height="1024" fill="url(#grid)"/>
  <circle cx="1260" cy="180" r="250" fill="#f0b35f" fill-opacity="0.16"/>
  <path d="M1010 760c90-210 210-330 360-360-35 106-24 203 34 292-124 116-255 161-394 68Z" fill="#ffffff" fill-opacity="0.10"/>
  <rect x="112" y="114" width="14" height="194" rx="7" fill="#ef8b55"/>
  <text x="164" y="172" fill="#f5ba80" font-family="Arial, sans-serif" font-size="34" font-weight="700" letter-spacing="5">BLUEJOURNAL WEEKLY</text>
  <text x="164" y="255" fill="#ffffff" font-family="Arial, 'Malgun Gothic', sans-serif" font-size="70" font-weight="800">경기 현안 심층특집</text>
  <line x1="164" y1="306" x2="840" y2="306" stroke="#ffffff" stroke-opacity="0.45" stroke-width="3"/>
  <text x="164" y="430" fill="#ffffff" font-family="Arial, 'Malgun Gothic', sans-serif" font-size="46" font-weight="700">${safeTitle}</text>
  <text x="164" y="828" fill="#dcecf7" font-family="Arial, 'Malgun Gothic', sans-serif" font-size="28">공식자료 기반 분석 · ${safeWeek}</text>
  <text x="164" y="882" fill="#dcecf7" font-family="Arial, 'Malgun Gothic', sans-serif" font-size="24">경인블루저널 자체 제작 자료 이미지</text>
</svg>`;
}
