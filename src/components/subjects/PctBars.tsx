import { fmtPct } from "./shared";

/** Compact horizontal bars for percentages (0-100). Missing values are shown as "—", never as an empty 0 bar. */
export function PctBars({ items, label }: { items: { key: string; label: string; value: number | null }[]; label: string }) {
  return (
    <ul className="sj-bars" aria-label={label}>
      {items.map((i) => (
        <li key={i.key}>
          <span className="sj-bars__label">{i.label}</span>
          <span className="sj-bars__track" aria-hidden>{i.value !== null && <span className="sj-bars__fill" style={{ width: `${Math.min(100, i.value)}%` }} />}</span>
          <span className="sj-bars__val">{fmtPct(i.value)}</span>
        </li>
      ))}
    </ul>
  );
}
