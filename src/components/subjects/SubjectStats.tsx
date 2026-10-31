"use client";

import { useMemo, useState } from "react";
import { Kpi } from "@/components/ui";
import { addDays, formatShort, todayISO } from "@/lib/dates";
import { useSubjectScope } from "@/lib/subjects/data";
import { personKey } from "@/lib/subjects/people";
import { buildReport } from "@/lib/subjects/report";
import { studentTestHistory, summarize } from "@/lib/subjects/stats";
import { SUBJECTS } from "@/lib/subjects/types";
import { PctBars } from "./PctBars";
import { NoGroups, fmtPct } from "./shared";

export function SubjectStats() {
  const { subject, groups, activeGroups, students, lessons, records } = useSubjectScope();
  const today = todayISO();
  const [groupId, setGroupId] = useState(""); // "" = all active groups
  const [from, setFrom] = useState(addDays(today, -90));
  const [to, setTo] = useState(today);
  const [studentId, setStudentId] = useState("");

  const chosen = useMemo(() => (groupId ? groups.filter((g) => g.id === groupId) : activeGroups), [groupId, groups, activeGroups]);
  const models = useMemo(
    () => chosen.map((group) => buildReport({ subject, group, students, lessons, records, from, to, generatedOn: today })),
    [chosen, subject, students, lessons, records, from, to, today],
  );
  const sum = useMemo(() => summarize(models), [models]);

  if (groups.length === 0) return (<><div className="page-head"><h1 className="page-title">Statistika</h1></div><NoGroups subject={subject} /></>);

  // distinct people: someone in two groups is one student, not two
  const chosenIds = new Set(chosen.map((g) => g.id));
  const enrolled = new Set(students.filter((s) => !s.archived_at && chosenIds.has(s.group_id)).map(personKey)).size;
  const tests = models.flatMap((m) => m.testSummaries.map((t) => ({ ...t, group: m.groupName }))).sort((a, b) => (a.date < b.date ? -1 : 1));
  const one = groupId ? models[0] : null;
  const history = one && studentId ? studentTestHistory(one, studentId) : [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Statistika</h1>
          <p className="page-sub">{SUBJECTS[subject].label} · {formatShort(from)} – {formatShort(to)}</p>
        </div>
      </div>

      <div className="card card--pad sj-filters">
        <label className="field"><span className="field__label">Guruh</span>
          <select className="select" value={groupId} onChange={(e) => { setGroupId(e.target.value); setStudentId(""); }}>
            <option value="">Barcha faol guruhlar</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}{g.archived_at ? " (arxiv)" : ""}</option>)}
          </select></label>
        <label className="field"><span className="field__label">Dan</span><input className="input" type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} /></label>
        <label className="field"><span className="field__label">Gacha</span><input className="input" type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} /></label>
      </div>

      <div className="kpis" style={{ margin: "12px 0" }}>
        <Kpi label="Faol guruhlar" value={groupId ? chosen.filter((g) => !g.archived_at).length : activeGroups.length} />
        <Kpi label="Faol o'quvchilar" value={enrolled} />
        <Kpi label="Davomat" value={fmtPct(sum.attendancePct)} note={sum.attendancePct === null ? "belgilangan davomat yo'q" : "belgilanganlardan"} />
        <Kpi label="Uy vazifasi topshirilgan" value={fmtPct(sum.homeworkPct)} note={sum.homeworkPct === null ? "baholangan vazifa yo'q" : "baholanganlardan"} />
        <Kpi label="Testlar" value={sum.testsCount} />
        <Kpi label="O'rtacha test foizi" value={fmtPct(sum.avgTestPct)} note={sum.avgTestPct === null ? "ball kiritilmagan" : undefined} />
      </div>

      {sum.lessons === 0 ? (
        <div className="card empty"><strong>Bu davrda dars yozilmagan</strong><p className="hint">Sanalar oralig&apos;ini o&apos;zgartiring yoki jurnalni to&apos;ldiring.</p></div>
      ) : (
        <>
          {!groupId && (
            <div className="card sj-scroll" style={{ marginBottom: 12 }}>
              <table className="sj-grid">
                <thead><tr><th scope="col" className="sj-sticky">Guruh</th><th scope="col">O&apos;quvchilar</th><th scope="col">Darslar</th><th scope="col">Davomat</th><th scope="col">Vazifa</th><th scope="col">Testlar</th><th scope="col">O&apos;rtacha test</th></tr></thead>
                <tbody>{models.map((m) => (
                  <tr key={m.groupName}><th scope="row" className="sj-sticky">{m.groupName}</th><td>{m.summary.students}</td><td>{m.summary.lessons}</td><td>{fmtPct(m.summary.attendancePct)}</td><td>{fmtPct(m.summary.homeworkPct)}</td><td>{m.summary.testsCount}</td><td>{fmtPct(m.summary.avgTestPct)}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}

          <div className="card card--pad" style={{ marginBottom: 12 }}>
            <h2 className="sj-h2">Testlar bo&apos;yicha guruh o&apos;rtachasi</h2>
            {tests.length === 0 ? <p className="hint">Bu davrda test yo&apos;q.</p>
              : <PctBars label="Testlar o'rtacha foizi" items={tests.map((t) => ({ key: t.lessonId, label: `${formatShort(t.date)}${groupId ? "" : ` · ${t.group}`}`, value: t.avgPct }))} />}
          </div>

          {one && (
            <div className="card card--pad">
              <div className="sj-hist-head">
                <h2 className="sj-h2">O&apos;quvchi o&apos;sishi</h2>
                <select className="select" style={{ maxWidth: 260 }} value={studentId} onChange={(e) => setStudentId(e.target.value)} aria-label="O'quvchi">
                  <option value="">O&apos;quvchini tanlang</option>
                  {one.rows.map((r) => <option key={r.studentId} value={r.studentId}>{r.name}</option>)}
                </select>
              </div>
              {!studentId ? <p className="hint">Test foizlari vaqt bo&apos;yicha.</p>
                : history.length === 0 ? <p className="hint">Bu davrda ball kiritilmagan.</p>
                : <PctBars label="O'quvchi o'sishi" items={history.map((h) => ({ key: `${h.date}-${h.title}`, label: `${formatShort(h.date)} · ${h.score}/${h.max}`, value: h.pct }))} />}
            </div>
          )}
        </>
      )}
    </>
  );
}
