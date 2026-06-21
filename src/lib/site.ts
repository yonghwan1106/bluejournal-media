/** 매체 정보 (신문법 의무게재 + 메타데이터 단일 소스) */
export const SITE = {
  name: "경인블루저널",
  nameEn: "Gyeongin Blue Journal",
  slogan: "시민의 상식으로 묻고, 언론의 양심으로 행동합니다",
  description:
    "경인블루저널은 수원·용인 등 경기 지역을 중심으로 행정·의회를 감시하는 지역 정론지입니다.",
  url: "https://bluejournal.co.kr",
  // 신문법 의무게재
  registerNo: "경기, 아54671", // 인터넷신문 등록번호
  bizNo: "849-01-03618", // 사업자등록번호
  publisher: "박용환", // 발행인
  editor: "박용환", // 편집인
  youthOfficer: "박용환", // 청소년보호책임자
  ceo: "박용환", // 대표
  founded: "2025-12-29",
  address: "경기도 수원시 권선구 서호동로26번길19 3층302호(서문동)",
  tel: "031-287-2215",
  mobile: "010-7939-3123", // 대표 휴대전화(제보·문의)
  fax: "031-287-2215",
  email: "bluejournal@daum.net",
} as const;

/** 상단 내비게이션 */
export const NAV = [
  { label: "뉴스", href: "/section/뉴스" },
  { label: "특집", href: "/section/특집" },
  { label: "세계 자치모델", href: "/section/세계 자치모델" },
  { label: "탐사문학", href: "/section/탐사문학" },
  { label: "경기", href: "/region/경기" },
  { label: "인천", href: "/region/인천" },
] as const;
