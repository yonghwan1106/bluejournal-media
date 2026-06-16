import { SITE } from "@/lib/site";

export const metadata = { title: "회사소개" };

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-extrabold">회사소개</h1>
      <p className="mt-2 font-bold text-brand">{SITE.slogan}</p>

      <div className="article-body mt-6 space-y-4 leading-8">
        <p>
          건강한 지역 사회를 지탱하는 힘은 ‘깨어있는 시민의 눈’과 ‘살아있는 언론의
          펜’에서 나옵니다. 경인블루저널은 시민단체 ‘용인블루’가 현장에서 외쳤던
          치열한 개혁 의지와 비판 정신을 모태로 탄생한 정론직필(正論直筆)의 지역
          정론지입니다.
        </p>
        <h2 className="text-xl font-bold">책상 위가 아닌, 현장에서 답을 찾습니다</h2>
        <p>
          “기자가 1인 시위에 나서는 언론사” — 부당한 권력에 맞서야 할 때, 시민의
          이익이 침해받을 때, 우리는 점잖게 기사만 쓰는 것에 만족하지 않겠습니다.
          필요하다면 가장 먼저 거리로 나가 피켓을 들고, 가장 날카로운 언어로
          부조리를 고발하겠습니다.
        </p>
        <h2 className="text-xl font-bold">성역 없는 비판, 타협 없는 감시</h2>
        <p>
          우리의 눈은 언제나 시청과 도청, 그리고 지방의회를 향해 있습니다. 시민의
          혈세가 낭비되는 예산의 사각지대는 없는지, 선출직 공직자들이 시민 위에
          군림하려 들지는 않는지 끝까지 추적하겠습니다.
        </p>
        <h2 className="text-xl font-bold">시민과 함께 만드는 푸른 내일</h2>
        <p>
          경인블루저널(Gyeongin Blue Journal)의 ‘블루’는 투명하고 청정한 지역
          사회를 향한 우리의 염원입니다. 거짓과 위선이 발붙일 곳 없는 투명한 사회를
          만드는 길에 경인블루저널이 언제나 앞장서겠습니다.
        </p>
      </div>

      <dl className="mt-10 grid grid-cols-[7rem_1fr] gap-y-2 border-t border-line pt-6 text-sm">
        <dt className="font-bold">제호</dt>
        <dd>{SITE.name}</dd>
        <dt className="font-bold">발행·편집인</dt>
        <dd>{SITE.publisher}</dd>
        <dt className="font-bold">등록번호</dt>
        <dd>{SITE.registerNo}</dd>
        <dt className="font-bold">등록일</dt>
        <dd>{SITE.founded}</dd>
        <dt className="font-bold">사업자등록번호</dt>
        <dd>{SITE.bizNo}</dd>
        <dt className="font-bold">주소</dt>
        <dd>{SITE.address}</dd>
        <dt className="font-bold">전화</dt>
        <dd>{SITE.tel}</dd>
        <dt className="font-bold">이메일</dt>
        <dd>{SITE.email}</dd>
      </dl>
    </div>
  );
}
