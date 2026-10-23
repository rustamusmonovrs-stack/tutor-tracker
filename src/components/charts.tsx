export interface Series {
  key: string;
  label: string;
  color: string;
}

export interface BarDatum {
  label: string;
  values: Record<string, number>;
}

/**
 * Minimal stacked bar chart in plain SVG. `data` order is left→right.
 * Every bar carries a <title> tooltip and the whole chart has an aria-label summary.
 */
export function StackedBars({
  data,
  series,
  summary,
  height = 150,
}: {
  data: BarDatum[];
  series: Series[];
  summary: string;
  height?: number;
}) {
  const W = 560;
  const padL = 26;
  const padB = 20;
  const padT = 8;
  const plotH = height - padB - padT;
  const totals = data.map((d) => series.reduce((s, x) => s + (d.values[x.key] ?? 0), 0));
  const max = Math.max(1, ...totals);
  const niceMax = max <= 4 ? (max % 2 ? max + 1 : max) : Math.ceil(max / 5) * 5;
  const slot = (W - padL) / Math.max(1, data.length);
  const bw = Math.min(28, slot * 0.64);
  const every = Math.ceil(data.length / 8);

  return (
    <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={summary}>
      {[0, 0.5, 1].map((t) => {
        const y = padT + plotH * (1 - t);
        return (
          <g key={t}>
            <line x1={padL} x2={W} y1={y} y2={y} stroke="var(--line)" strokeWidth="1" />
            <text x={padL - 6} y={y + 3} textAnchor="end">
              {Math.round(niceMax * t * 10) / 10}
            </text>
          </g>
        );
      })}
      {data.map((d, i) => {
        const x = padL + slot * i + (slot - bw) / 2;
        let y = padT + plotH;
        const tip = `${d.label}: ${series.map((s) => `${s.label} ${d.values[s.key] ?? 0}`).join(", ")}`;
        return (
          <g key={i}>
            <title>{tip}</title>
            {series.map((s) => {
              const v = d.values[s.key] ?? 0;
              const h = (v / niceMax) * plotH;
              y -= h;
              return h > 0 ? <rect key={s.key} x={x} y={y} width={bw} height={h} rx="2" fill={s.color} /> : null;
            })}
            {i % every === 0 && (
              <text x={x + bw / 2} y={height - 5} textAnchor="middle">
                {d.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function Legend({ series }: { series: Series[] }) {
  return (
    <div className="chart__legend">
      {series.map((s) => (
        <span key={s.key}>
          <i style={{ background: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

/** Horizontal bars for ranking-style comparisons (one value per row). */
export function HBars({
  rows,
  format = (n) => String(n),
}: {
  rows: { label: string; value: number }[];
  format?: (n: number) => string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {rows.map((r) => (
        <div key={r.label} style={{ display: "grid", gap: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--fs-sm)", fontWeight: 600 }}>
            <span>{r.label}</span>
            <span>{format(r.value)}</span>
          </div>
          <span className="meter">
            <span className="meter__fill" style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
        </div>
      ))}
    </div>
  );
}
