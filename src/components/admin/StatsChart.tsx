// 경량 SVG 추이 차트(서버 렌더, 외부 차트 라이브러리·번들 부담 0).
// PV=막대, UV=라인. 색은 currentColor 상속(fill-current/stroke-current + text-색)으로
// tailwind 커스텀 색 등록과 무관하게 동작.
export function StatsChart({
  data,
}: {
  data: { bucket: string; pv: number; uv: number }[];
}) {
  if (!data.length) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted">
        아직 수집된 방문 데이터가 없습니다. 배포 후 방문이 쌓이면 표시됩니다.
      </div>
    );
  }
  const W = 760, H = 220, padX = 28, padY = 16, padBottom = 26;
  const max = Math.max(1, ...data.map((d) => d.pv));
  const n = data.length;
  const bw = (W - padX * 2) / n;
  const yOf = (v: number) => H - padBottom - (v / max) * (H - padY - padBottom);
  const pts = data.map((d, i) => `${padX + bw * (i + 0.5)},${yOf(d.uv)}`).join(" ");
  const every = Math.max(1, Math.ceil(n / 12));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="접속자 추이">
      {data.map((d, i) => {
        const x = padX + bw * i;
        const y = yOf(d.pv);
        return (
          <g key={i} className="text-brand">
            <rect
              x={x + bw * 0.18}
              y={y}
              width={bw * 0.64}
              height={Math.max(0, H - padBottom - y)}
              rx={2}
              className="fill-current opacity-80"
            >
              <title>{`${d.bucket} — PV ${d.pv} · UV ${d.uv}`}</title>
            </rect>
            {i % every === 0 && (
              <text
                x={x + bw * 0.5}
                y={H - 8}
                textAnchor="middle"
                className="fill-current text-muted"
                style={{ fontSize: 9 }}
              >
                {d.bucket.slice(5)}
              </text>
            )}
          </g>
        );
      })}
      <polyline points={pts} className="fill-none stroke-current text-accent" strokeWidth={1.5} />
      {data.map((d, i) => (
        <circle key={i} cx={padX + bw * (i + 0.5)} cy={yOf(d.uv)} r={2} className="fill-current text-accent" />
      ))}
    </svg>
  );
}
