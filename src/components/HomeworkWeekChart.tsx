"use client";

import { useId } from "react";
import { formatShort } from "@/lib/dates";
import type { HwWeek } from "@/lib/homeworkStats";

const SERIES = [
  { key: "full", label: "To'liq", cls: "ok" },
  { key: "partial", label: "Chala", cls: "warn" },
  { key: "notDone", label: "Qilmadi", cls: "bad" },
] as const;

/**
 * Weekly homework results as stacked columns (To'liq / Chala / Qilmadi), one column per calendar week of the period.
 * Each column is focusable and shows a tooltip with the exact date range and counts. A week without graded homework
 * draws no bar: it shows 0 and says so (no artificial bars).
 */
export function HomeworkWeekChart({ weeks, from, to }: { weeks: HwWeek[]; from: string; to: string }) {
  const base = useId();
  const max = Math.max(1, ...weeks.map((w) => w.graded));
  const scale = max <= 5 ? max : Math.ceil(max / 5) * 5;
  const range = (w: HwWeek) => `${formatShort(w.start < from ? from : w.start)} – ${formatShort(w.end > to ? to : w.end)}`;

  return (
    <div className={`hww${weeks.length > 7 ? " hww--dense" : ""}${weeks.length > 10 ? " hww--sparse" : ""}`}>
      <div className="hww__plot" style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }} role="list" aria-label="Haftalar bo'yicha uy vazifasi natijalari">
        <span className="hww__grid" aria-hidden>
          <i />
          <i />
          <i />
        </span>
        {weeks.map((w, i) => {
          const tipId = `${base}-${i}`;
          const pct = w.graded ? Math.round((w.full / w.graded) * 100) : null;
          return (
            <div role="listitem" key={w.start} className={`hww__col${i >= weeks.length / 2 ? " hww__col--end" : ""}`}>
              <button type="button" className="hww__hit" aria-describedby={tipId} aria-label={`${range(w)}: ${w.graded} ta baholangan`}>
                <span className={`hww__total${w.graded ? "" : " hww__total--zero"}`}>{w.graded}</span>
                <span className="hww__bar" style={{ height: `calc(var(--hww-h) * ${w.graded / scale})` }}>
                  {SERIES.map((s) =>
                    w[s.key] > 0 ? <span key={s.key} className={`hww__seg hww__seg--${s.cls}`} style={{ flexGrow: w[s.key] }} /> : null,
                  )}
                </span>
              </button>
              <span className="hww__x" aria-hidden>
                <b>{formatShort(w.start < from ? from : w.start)}</b>
                <span>{formatShort(w.end > to ? to : w.end)}</span>
              </span>
              <span role="tooltip" id={tipId} className="hww__tip">
                <strong>{range(w)}</strong>
                {w.graded === 0 ? (
                  <span className="hww__tip-empty">Bu haftada baholangan uy vazifasi yo&apos;q.</span>
                ) : (
                  SERIES.map((s) => (
                    <span key={s.key} className="hww__tip-row">
                      <i className={`hww__dot hww__dot--${s.cls}`} />
                      {s.label}
                      <b>{w[s.key]}</b>
                    </span>
                  ))
                )}
                {w.pending > 0 && (
                  <span className="hww__tip-row">
                    <i className="hww__dot hww__dot--muted" />
                    Baholanmagan
                    <b>{w.pending}</b>
                  </span>
                )}
                {pct !== null && (
                  <span className="hww__tip-foot">
                    To&apos;liq: {pct}% ({w.full} / {w.graded} baholangan)
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
