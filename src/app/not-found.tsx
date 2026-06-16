import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center px-4 py-24 text-center">
      <div className="text-5xl font-extrabold text-brand">404</div>
      <h1 className="mt-4 text-xl font-bold">페이지를 찾을 수 없습니다</h1>
      <p className="mt-2 text-muted">
        요청하신 기사나 페이지가 삭제되었거나 주소가 변경되었을 수 있습니다.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-md bg-brand px-5 py-2.5 font-bold text-white hover:bg-brand-dark"
      >
        홈으로 가기
      </Link>
    </div>
  );
}
