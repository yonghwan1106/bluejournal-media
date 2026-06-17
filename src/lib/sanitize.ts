import "server-only";
import sanitizeHtml from "sanitize-html";

/**
 * 기사 본문(bodyHtml) 새니타이즈 — 저장형 XSS 차단.
 *
 * 레거시 그누보드 마이그레이션 HTML·관리자 입력·자동화 발행 API 본문은 모두
 * 신뢰할 수 없는 입력으로 간주한다(시드에 이미 <script>/<iframe> 포함됨).
 * 공개 렌더(news/[id])가 dangerouslySetInnerHTML 로 출력하기 직전 이 함수를 거쳐
 * <script>·이벤트핸들러(on*)·javascript: URL 등 실행 가능한 마크업을 제거한다.
 *
 * 정당한 콘텐츠는 보존: 문단/표/그림/서식(font·span style)·이미지·영상 임베드.
 * 영상 <iframe> 은 허용 호스트(Vimeo·YouTube)만 통과시킨다.
 */
const IFRAME_HOSTS = [
  "player.vimeo.com",
  "www.youtube.com",
  "youtube.com",
  "www.youtube-nocookie.com",
  "youtube-nocookie.com",
];

/**
 * 인라인 style 값에서 실행성 CSS 제거. 정당한 서식(width·color·text-align 등 9천여 건)은
 * 보존하기 위해 속성 화이트리스트(allowedStyles) 대신 위험 토큰만 무력화한다.
 * expression() 은 IE7 이하 전용(현대 브라우저 무시)이나 방어적으로 함께 제거.
 */
function scrubStyle(style: string): string {
  return style
    .replace(/expression\s*\(/gi, "")
    .replace(/(?:javascript|vbscript)\s*:/gi, "")
    .replace(/-moz-binding\s*:/gi, "")
    .replace(/behavior\s*:/gi, "")
    .trim();
}

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "br", "span", "div", "a", "img",
    "strong", "b", "em", "i", "u", "s", "sup", "sub", "mark", "small", "font",
    "figure", "figcaption", "blockquote", "pre", "code", "hr",
    "ul", "ol", "li", "dl", "dt", "dd",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption", "colgroup", "col",
    "video", "audio", "source", "iframe",
  ],
  allowedAttributes: {
    a: ["href", "name", "target", "rel", "title"],
    img: ["src", "alt", "title", "width", "height", "loading", "class", "style"],
    font: ["color", "face", "size"],
    iframe: ["src", "width", "height", "frameborder", "allow", "allowfullscreen", "title", "loading"],
    video: ["src", "width", "height", "controls", "poster", "preload", "muted", "loop", "playsinline", "class", "style"],
    audio: ["src", "controls", "preload"],
    source: ["src", "type", "srcset", "media"],
    td: ["colspan", "rowspan", "align", "valign", "class", "style"],
    th: ["colspan", "rowspan", "align", "valign", "class", "style"],
    table: ["border", "cellpadding", "cellspacing", "width", "class", "style"],
    col: ["span", "width", "style"],
    "*": ["class", "style"],
  },
  // 기본 스킴 + 이미지 data URI 허용. javascript:/vbscript: 등은 자동 차단.
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesByTag: { img: ["http", "https", "data"] },
  allowProtocolRelative: true,
  // iframe 은 영상 임베드 호스트만 허용(그 외 전부 제거).
  allowedIframeHostnames: IFRAME_HOSTS,
  // 모든 태그 공통 변환: style 의 실행성 CSS 스크럽 + <a> 탭내빙 방지 rel 보강.
  transformTags: {
    "*": (tagName, attribs) => {
      if (attribs.style) {
        const scrubbed = scrubStyle(attribs.style);
        if (scrubbed) attribs.style = scrubbed;
        else delete attribs.style;
      }
      if (tagName === "a") attribs.rel = "noopener noreferrer";
      return { tagName, attribs };
    },
  },
};

export function sanitizeBodyHtml(html: string | null | undefined): string {
  if (!html) return "";
  return sanitizeHtml(html, OPTIONS);
}
