"use client";

import { useEffect, useMemo, useState } from "react";
import { Kpi } from "@/components/ui";
import { addDays, formatShort, todayISO } from "@/lib/dates";
import { useSubjectScope } from "@/lib/subjects/data";
import { pct } from "@/lib/subjects/report";
import { studentTestHistory } from "@/lib/subjects/stats";
import { SUBJECTS } from "@/lib/subjects/types";
import { PctBars } from "./PctBars";
import { NoGroups, fmtPct, useStoredGroup } from "./shared";
import { useGroupReport } from "./useReport";

export function SubjectTests() {
  const { subject, groups } = useSubjectScope();
  const [group, pickGroup] = useStoredGroup(subject, groups.filter((g) => !g.archived_at).concat(groups.filter((g) => g.archived_at)));
  const today = todayISO();
  const [from, setFrom] = useState(addDays(today, -90));
  const [to, setTo] = useState(today);
  const [testId, setTestId] = useState("");
  const [studentId, setStudentId] = useState("");
  const model = useGroupReport(group?.id ?? null, from, to);

  // a selection from another group / range must not linger
  useEffect(() => {
    if (testId && model && !model.tests.some((t) => t.lessonId === testId)) setTestId("");
    if (studentId && model && !model.rows.some((r) => r.studentId === studentId)) setStudentId("");
  }, [model, testId, studentId]);

  const shown = useMemo(() => (model ? (testId ? model.testSummaries.filter((t) => t.lessonId === testId) : model.testSummaries) : []), [model, testId]);

  if (!group || !model) {
    return (<><div className="page-head"><h1 className="page-title">Test natijalari</h1></div><NoGroups subject={subject} /></>);
  }
  const single = shown.length === 1 ? shown[0] : null;
  const allPcts = shown.flatMap((t) => model.rows.map((r) => r.scores[t.lessonId]).filter((v): v is number => v !== null).map((v) => (v / t.max) * 100));
  const avg = allPcts.length ? Math.round((allPcts.reduce((a, b) => a + b, 0) / allPcts.length) * 10) / 10 : null;
  const hi = allPcts.length ? Math.round(Math.max(...allPcts) * 10) / 10 : null;
  const lo = allPcts.length ? Math.round(Math.min(...allPcts) * 10) / 10 : null;
  const history = studentId ? studentTestHistory(model, studentId) : [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Test natijalari</h1>
          <p className="page-sub">{SUBJECTS[subject].label} · {group.name}</p>
        </div>
      </div>

      <div className="card card--pad sj-filters">
        <label className="field"><span className="field__label">Guruh</span>
          <select className="select" value={group.id} onChange={(e) => pickGroup(e.target.value)}>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}{g.archived_at ? " (arxiv)" : ""}</option>)}
          </select></label>
        <label className="field"><span className="field__label">Dan</span><input className="input" type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} /></label>
        <label className="field"><span className="field__label">Gacha</span><input className="input" type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} /></label>
        <label className="field"><span className="field__label">Test</span>
          <select className="select" value={testId} onChange={(e) => setTestId(e.target.value)}>
            <option value="">Barcha testlar ({model.tests.length})</option>
            {model.tests.map((t) => <option key={t.lessonId} value={t.lessonId}>{formatShort(t.date)} · {t.title ?? "Test"} · /{t.max}</option>)}
          </select></label>
      </div>

      {model.tests.length === 0 ? (
        <div className="card empty" style={{ marginTop: 12 }}><strong>Bu davrda test yozilmagan</strong><p className="hint">Jurnalda &quot;Test bo&apos;ldi&quot; ni yoqib, ballarni kiriting.</p></div>
      ) : (
        <>
          <div className="kpis" style={{ margin: "12px 0" }}>
            <Kpi label="Testlar" value={shown.length} />
            <Kpi label="O'rtacha foiz" value={fmtPct(avg)} note={allPcts.length ? `${allPcts.length} ta kiritilgan ball` : "ball kiritilmagan"} />
            <Kpi label={single ? "Eng yuqori ball" : "Eng yuqori foiz"} value={single ? (single.highest === null ? "—" : `${single.highest}/${single.max}`) : fmtPct(hi)} />
            <Kpi label={single ? "Eng past ball" : "Eng past foiz"} value={single ? (single.lowest === null ? "—" : `${single.lowest}/${single.max}`) : fmtPct(lo)} />
          </div>

          <div className="card sj-scroll">
            <table className="sj-grid">
              <thead>
                <tr>
                  <th scope="col" className="sj-sticky">O&apos;quvchi</th>
                  {shown.map((t) => <th scope="col" key={t.lessonId}>{formatShort(t.date)}<small>{t.title ?? "Test"} · /{t.max}</small></th>)}
                  {!single && <th scope="col">O&apos;rtacha</th>}
                </tr>
              </thead>
              <tbody>
                {model.rows.map((r) => (
                  <tr key={r.studentId}>
                    <th scope="row" className="sj-sticky">{r.name}</th>
                    {shown.map((t) => {
                      const v = r.scores[t.lessonId];
                      return <td key={t.lessonId}>{v === null ? <span className="sj-missing" title="Ball kiritilmagan">—</span> : <>{v}/{t.max}<small>{fmtPct(pct(v, t.max))}</small></>}</td>;
                    })}
                    {!single && <td><b>{fmtPct(r.avgTestPct)}</b></td>}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><th scope="row" className="sj-sticky">Guruh o&apos;rtachasi</th>{shown.map((t) => <td key={t.lessonId}><b>{fmtPct(t.avgPct)}</b><small>{t.entered} ta / {t.missing} ta kiritilmagan</small></td>)}{!single && <td><b>{fmtPct(avg)}</b></td>}</tr>
              </tfoot>
            </table>
          </div>

          <div className="card card--pad" style={{ marginTop: 12 }}>
            <div className="sj-hist-head">
              <h2 className="sj-h2">O&apos;quvchi natijalari tarixi</h2>
              <select className="select" style={{ maxWidth: 260 }} value={studentId} onChange={(e) => setStudentId(e.target.value)} aria-label="O'quvchi">
                <option value="">O&apos;quvchini tanlang</option>
                {model.rows.map((r) => <option key={r.studentId} value={r.studentId}>{r.name}</option>)}
              </select>
            </div>
            {!studentId ? <p className="hint">Tanlangan o&apos;quvchining barcha testlar bo&apos;yicha foizi shu yerda chiqadi.</p>
              : history.length === 0 ? <p className="hint">Bu davrda o&apos;quvchi uchun ball kiritilmagan.</p>
              : <PctBars label="O'quvchi testlari" items={history.map((h) => ({ key: `${h.date}-${h.title}`, label: `${formatShort(h.date)} · ${h.score}/${h.max}`, value: h.pct }))} />}
          </div>
        </>
      )}
    </>
  );
}
