import { SITE } from "@/lib/site";

export const metadata = { title: "기사제보·광고문의" };

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-extrabold">기사제보·광고문의</h1>
      <p className="mt-3 text-muted">
        시민의 제보가 살아있는 지역 언론을 만듭니다. 부당한 일, 알려야 할 일이
        있다면 경인블루저널에 알려주세요.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <a
          href={`mailto:${SITE.email}`}
          className="rounded-lg border border-line p-5 hover:border-brand"
        >
          <div className="text-sm font-bold text-brand">이메일 제보</div>
          <div className="mt-1 text-lg font-semibold">{SITE.email}</div>
        </a>
        <a
          href={`tel:${SITE.tel}`}
          className="rounded-lg border border-line p-5 hover:border-brand"
        >
          <div className="text-sm font-bold text-brand">전화 제보·문의</div>
          <div className="mt-1 text-lg font-semibold">{SITE.tel}</div>
          <div className="text-lg font-semibold">{SITE.mobile}</div>
        </a>
      </div>

      <div className="mt-8 rounded-lg bg-[#f7f8fa] p-5 text-sm leading-7 text-muted">
        <div className="font-bold text-ink">{SITE.name}</div>
        <div className="mt-1">{SITE.address}</div>
        <div>대표전화 {SITE.tel}, {SITE.mobile} · 이메일 {SITE.email}</div>
        <div>광고·제휴 문의도 위 연락처로 받습니다.</div>
      </div>
    </div>
  );
}
