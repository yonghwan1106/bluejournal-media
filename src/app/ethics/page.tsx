export const metadata = { title: "윤리강령" };

export default function EthicsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-extrabold">윤리강령</h1>
      <div className="article-body mt-6 space-y-4 leading-8">
        <p>
          경인블루저널은 언론의 자유와 책임을 바탕으로, 정확하고 공정한 보도를 통해
          시민의 알 권리에 봉사한다. 본지의 모든 임직원은 다음의 윤리강령을
          준수한다.
        </p>
        <h2 className="text-lg font-bold">1. 진실 보도</h2>
        <p>
          우리는 사실에 근거하여 진실을 보도하며, 취재·보도 과정에서 왜곡·과장·축소를
          하지 않는다.
        </p>
        <h2 className="text-lg font-bold">2. 공정성과 독립성</h2>
        <p>
          우리는 어떠한 정치·경제·사회적 압력이나 이해관계로부터 독립하여, 공정하고
          균형 있는 보도를 지향한다.
        </p>
        <h2 className="text-lg font-bold">3. 인격권 존중</h2>
        <p>
          우리는 취재·보도 과정에서 개인의 명예와 사생활, 인격권을 존중하며, 사회적
          약자를 보호한다.
        </p>
        <h2 className="text-lg font-bold">4. 이해상충 회피</h2>
        <p>
          우리는 보도와 관련하여 부당한 이익을 추구하지 않으며, 취재원과의 관계에서
          공정성을 훼손하지 않는다.
        </p>
        <h2 className="text-lg font-bold">5. 정정과 반론</h2>
        <p>
          우리는 보도에 오류가 있을 경우 신속히 정정하며, 당사자의 반론권을
          보장한다.
        </p>
      </div>
    </div>
  );
}
