import { SITE } from "@/lib/site";

export const metadata = { title: "청소년보호정책" };

export default function YouthPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-extrabold">청소년보호정책</h1>
      <div className="article-body mt-6 space-y-4 leading-8">
        <p>
          경인블루저널은 「청소년 보호법」에 따라 청소년이 유해한 정보에 노출되지
          않도록 다음과 같은 청소년보호정책을 시행합니다.
        </p>
        <h2 className="text-lg font-bold">1. 청소년 유해정보로부터의 보호</h2>
        <p>
          본지는 청소년이 유해한 콘텐츠에 접근할 수 없도록 모니터링하며, 유해정보가
          게재되지 않도록 노력합니다.
        </p>
        <h2 className="text-lg font-bold">2. 청소년 보호를 위한 활동</h2>
        <p>
          유해정보에 대한 청소년 접근 제한 및 관리, 청소년보호 관련 종사자 교육,
          피해 청소년 상담·신고 처리를 수행합니다.
        </p>
        <h2 className="text-lg font-bold">3. 청소년보호책임자</h2>
        <p>
          본지는 청소년보호와 관련한 업무를 총괄하는 청소년보호책임자를 두고
          있습니다.
        </p>
        <ul>
          <li>청소년보호책임자 : {SITE.youthOfficer}</li>
          <li>연락처 : {SITE.tel}</li>
          <li>이메일 : {SITE.email}</li>
        </ul>
      </div>
    </div>
  );
}
