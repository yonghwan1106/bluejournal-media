const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const MIN_WEEKLY_FEATURE_SOURCES = 3;
export const MIN_WEEKLY_FEATURE_BODY_CHARS = 2_500;
export const MAX_WEEKLY_FEATURE_BODY_CHARS = 5_000;
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
): string[] {
  const errors: string[] = [];
  const knownIds = new Set(candidates.map((candidate) => candidate.id));
  const selectedIds = [...new Set(topic.sourceIds.map((id) => id.trim()).filter(Boolean))];

  if (topic.headline.trim().length < 10) errors.push("주제 제목이 너무 짧습니다.");
  if (topic.angle.trim().length < 20) errors.push("취재 관점이 충분히 구체적이지 않습니다.");
  if (topic.rationale.trim().length < 20) errors.push("주제 선정 근거가 충분하지 않습니다.");
  if (selectedIds.length < MIN_WEEKLY_FEATURE_SOURCES) {
    errors.push(`서로 다른 공식 근거가 ${MIN_WEEKLY_FEATURE_SOURCES}개 미만입니다.`);
  }
  if (selectedIds.some((id) => !knownIds.has(id))) {
    errors.push("후보 목록에 없는 출처 ID가 포함됐습니다.");
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
    `<p style="margin-top:1.4em;color:#666;font-size:13px">이 기사는 위 경기도 공식 공개자료를 교차 검토해 작성했습니다. 링크는 독자가 원문과 수치를 직접 확인할 수 있도록 함께 제공합니다.</p>`,
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
