"use client";

import { FileCode2, FileText } from "lucide-react";
import { useMemo, useState } from "react";
import { useData } from "@/lib/data";
import { formatLong } from "@/lib/dates";
import { downloadDailyHtml, downloadDailyPdf } from "@/lib/daily/export";
import type { DailyReport } from "@/lib/daily/model";

interface Props {
  /** The date the Bugun page is showing: the card starts on it. */
  pageDate: string;
  /** Dates with a recorded lesson for the selected group. */
  dates: string[];
  /** Pure, read-only: builds the report for the selected group and the given date from data already on screen. */
  build: (date: string) => DailyReport;
}

/**
 * "Kunlik hisobot": PDF / HTML download of the journal for one lesson date. The group and the data come from the
 * page; the teacher never re-enters anything. Mount it with key={group|date} so it follows the page.
 */
export function DailyReportCard({ pageDate, dates, build }: Props) {
  const { notify } = useData();
  const [date, setDate] = useState(pageDate);
  const [busy, setBusy] = useState<"pdf" | "html" | null>(null);

  const options = useMemo(() => [...new Set([...dates, pageDate])].sort().reverse(), [dates, pageDate]);
  const report = build(date);
  const ready = report.hasData;

  async function run(kind: "pdf" | "html") {
    setBusy(kind);
    try {
      if (kind === "pdf") await downloadDailyPdf(build(date));
      else await downloadDailyHtml(build(date));
    } catch (e) {
      notify(`${kind === "pdf" ? "PDF" : "HTML"} yaratilmadi: ${e instanceof Error ? e.message : "noma'lum xatolik"}`, { kind: "error" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card dr" aria-labelledby="dr-title">
      <div className="dr__head">
        <h2 className="dr__title" id="dr-title">
          <FileText aria-hidden size={16} /> Kunlik hisobot
        </h2>
        <p className="hint">
          {report.groupName} · {report.rows.length} o&apos;quvchi
        </p>
      </div>
      <div className="dr__controls">
        <label className="field dr__date">
          <span className="field__label">Dars sanasi</span>
          <select className="select" value={date} onChange={(e) => setDate(e.target.value)}>
            {options.map((d) => (
              <option key={d} value={d}>
                {formatLong(d)}
                {dates.includes(d) ? "" : " (yozuv yo'q)"}
              </option>
            ))}
          </select>
        </label>
        <div className="dr__actions">
          <button className="btn btn--primary" type="button" disabled={!ready || busy !== null} onClick={() => void run("pdf")}>
            <FileText aria-hidden size={16} /> {busy === "pdf" ? "Tayyorlanmoqda…" : "PDF yuklab olish"}
          </button>
          <button className="btn" type="button" disabled={!ready || busy !== null} onClick={() => void run("html")}>
            <FileCode2 aria-hidden size={16} /> {busy === "html" ? "Tayyorlanmoqda…" : "HTML yuklab olish"}
          </button>
        </div>
      </div>
      {!ready && <p className="hint">Bu sanada dars yozuvi yo&apos;q, shuning uchun hisobot tayyorlanmaydi.</p>}
    </section>
  );
}
