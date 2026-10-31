"use client";

import { useState } from "react";
import { Kpi } from "@/components/ui";
import { useData } from "@/lib/data";
import { addDays, todayISO } from "@/lib/dates";
import { useSubjectScope } from "@/lib/subjects/data";
import { renderReportHtml } from "@/lib/subjects/reportHtml";
import { fmtP, reportFileBase, reportTables } from "@/lib/subjects/reportTables";
import { SUBJECTS } from "@/lib/subjects/types";
import { NoGroups, useStoredGroup } from "./shared";
import { useGroupReport } from "./useReport";

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function SubjectReports() {
  const { subject, groups } = useSubjectScope();
  const { notify } = useData();
  const ordered = groups.filter((g) => !g.archived_at).concat(groups.filter((g) => g.archived_at));
  const [group, pickGroup] = useStoredGroup(subject, ordered);
  const today = todayISO();
  const [from, setFrom] = useState(addDays(today, -30));
  const [to, setTo] = useState(today);
  const [studentId, setStudentId] = useState("");
  const [busy, setBusy] = useState<"pdf" | "html" | null>(null);
  const model = useGroupReport(group?.id ?? null, from, to, studentId || null);
  const roster = useGroupReport(group?.id ?? null, from, to, null);

  if (!group || !model) return (<><div className="page-head"><h1 className="page-title">Hisobotlar</h1></div><NoGroups subject={subject} /></>);

  const valid = from <= to;
  async function downloadPdf() {
    if (!model) return;
    setBusy("pdf");
    try {
      const [{ buildReportPdf }, regular, bold] = await Promise.all([
        import("@/lib/subjects/reportPdf"),
        fetch("/fonts/DejaVuSans.ttf").then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error("Shrift yuklanmadi")))),
        fetch("/fonts/DejaVuSans-Bold.ttf").then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error("Shrift yuklanmadi")))),
      ]);
      const bytes = await buildReportPdf(model, { regular: new Uint8Array(regular), bold: new Uint8Array(bold) });
      save(new Blob([bytes as BlobPart], { type: "application/pdf" }), `${reportFileBase(model)}.pdf`);
    } catch (e) {
      notify(`PDF yaratilmadi: ${e instanceof Error ? e.message : "noma'lum xatolik"}`, { kind: "error" });
    } finally {
      setBusy(null);
    }
  }
  function downloadHtml() {
    if (!model) return;
    setBusy("html");
    try {
      save(new Blob([renderReportHtml(model)], { type: "text/html;charset=utf-8" }), `${reportFileBase(model)}.html`);
    } finally {
      setBusy(null);
    }
  }

  const students = reportTables(model).find((t) => t.id === "students");

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Hisobotlar</h1>
          <p className="page-sub">{SUBJECTS[subject].label} · o&apos;quvchilar hisoboti</p>
        </div>
        <div className="page-actions">
          <button className="btn btn--primary" disabled={!valid || busy !== null || model.rows.length === 0} onClick={() => void downloadPdf()}>{busy === "pdf" ? "Tayyorlanmoqda…" : "PDF yuklab olish"}</button>
          <button className="btn" disabled={!valid || busy !== null} onClick={downloadHtml}>HTML yuklab olish</button>
        </div>
      </div>

      <div className="card card--pad sj-filters">
        <label className="field"><span className="field__label">Fan</span><input className="input" value={SUBJECTS[subject].label} readOnly aria-readonly /></label>
        <label className="field"><span className="field__label">Guruh</span>
          <select className="select" value={group.id} onChange={(e) => { pickGroup(e.target.value); setStudentId(""); }}>
            {ordered.map((g) => <option key={g.id} value={g.id}>{g.name}{g.archived_at ? " (arxiv)" : ""}</option>)}
          </select></label>
        <label className="field"><span className="field__label">Boshlanish sanasi</span><input className="input" type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} /></label>
        <label className="field"><span className="field__label">Tugash sanasi</span><input className="input" type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} /></label>
        <label className="field"><span className="field__label">O&apos;quvchi (ixtiyoriy)</span>
          <select className="select" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
            <option value="">Butun guruh</option>
            {(roster?.rows ?? []).map((r) => <option key={r.studentId} value={r.studentId}>{r.name}</option>)}
          </select></label>
      </div>

      {!valid && <p className="sj-err" role="alert" style={{ marginTop: 8 }}>Boshlanish sanasi tugash sanasidan keyin bo&apos;lmasin.</p>}

      <div className="kpis" style={{ margin: "12px 0" }}>
        <Kpi label="O'quvchilar" value={model.summary.students} />
        <Kpi label="Darslar" value={model.summary.lessons} />
        <Kpi label="Davomat" value={fmtP(model.summary.attendancePct)} />
        <Kpi label="Vazifa bajarilishi" value={fmtP(model.summary.homeworkPct)} />
        <Kpi label="Testlar" value={model.summary.testsCount} />
        <Kpi label="O'rtacha test foizi" value={fmtP(model.summary.avgTestPct)} />
      </div>

      {model.summary.lessons === 0 ? (
        <div className="card empty"><strong>Tanlangan davrda dars yozilmagan</strong><p className="hint">Hisobotni baribir yuklab olish mumkin, unda bo&apos;sh davr ko&apos;rsatiladi.</p></div>
      ) : students && (
        <div className="card sj-scroll">
          <table className="sj-grid">
            <thead><tr>{students.columns.map((c) => <th scope="col" key={c.header} className={c.align === "left" ? undefined : "sj-num"}>{c.header}{c.sub && <small>{c.sub}</small>}</th>)}</tr></thead>
            <tbody>{students.rows.map((r, i) => (
              <tr key={i} className={i === students.rows.length - 1 ? "sj-total" : undefined}>
                {r.map((v, j) => j === 0 ? <th scope="row" key={j} className="sj-sticky">{v}</th> : <td key={j} className="sj-num">{v}</td>)}
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <p className="hint" style={{ marginTop: 8 }}>PDF va HTML bir xil hisob-kitobdan olinadi. Eksportda faqat shu guruh va tanlangan davr yozuvlari bo&apos;ladi.</p>
    </>
  );
}
