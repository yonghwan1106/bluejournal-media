export function NoDbNotice() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <div className="rounded-lg border border-line bg-[#fff8e1] p-6">
        <h2 className="text-lg font-bold text-ink">데이터베이스 미연결</h2>
        <p className="mt-2 text-sm leading-7 text-muted">
          관리자 기능(기사 작성/수정)은 데이터베이스가 필요합니다. Vultr VPS MySQL을
          구성한 뒤 환경변수 <code className="rounded bg-line px-1">DATABASE_URL</code>{" "}
          을 설정하면 활성화됩니다. (자세한 절차: <code>infra/RUNBOOK.md</code> 4~6단계)
        </p>
        <p className="mt-2 text-sm text-muted">
          현재 공개 사이트는 시드 데이터로 정상 작동 중입니다.
        </p>
      </div>
    </div>
  );
}
