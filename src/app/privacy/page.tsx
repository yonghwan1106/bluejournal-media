import { SITE } from "@/lib/site";

export const metadata = { title: "개인정보처리방침" };

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-extrabold">개인정보처리방침</h1>
      <div className="article-body mt-6 space-y-4 leading-8">
        <p>
          경인블루저널(이하 ‘회사’)은 「개인정보 보호법」을 준수하며, 이용자의
          개인정보를 보호하기 위해 다음과 같은 처리방침을 둡니다.
        </p>
        <h2 className="text-lg font-bold">1. 수집하는 개인정보 항목</h2>
        <p>
          회사는 기사제보·문의 시 이름, 연락처, 이메일 등 최소한의 정보를 수집할 수
          있습니다.
        </p>
        <h2 className="text-lg font-bold">2. 개인정보의 이용 목적</h2>
        <p>수집한 정보는 문의 응대, 제보 확인 및 취재 목적으로만 이용합니다.</p>
        <h2 className="text-lg font-bold">3. 개인정보의 보유 및 파기</h2>
        <p>
          이용 목적이 달성된 개인정보는 지체 없이 파기하며, 관계 법령에 따라 보존이
          필요한 경우 해당 기간 동안 보관합니다.
        </p>
        <h2 className="text-lg font-bold">4. 이용자의 권리</h2>
        <p>
          이용자는 자신의 개인정보에 대한 열람·정정·삭제·처리정지를 요구할 수
          있습니다.
        </p>
        <h2 className="text-lg font-bold">5. 개인정보 보호책임자</h2>
        <ul>
          <li>책임자 : {SITE.publisher}</li>
          <li>연락처 : {SITE.tel}</li>
          <li>이메일 : {SITE.email}</li>
        </ul>
      </div>
    </div>
  );
}
