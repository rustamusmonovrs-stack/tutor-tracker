"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { IconBook, IconChevronLeft, IconChevronRight, IconPresent } from "@/components/icons";
import { Meter } from "@/components/ui";
import { ATTENDANCE_META } from "@/lib/config";
import { addDays, formatDay, todayISO } from "@/lib/dates";
import { useSubjectScope } from "@/lib/subjects/data";
import { SUBJECTS, type SubjectHomework, type SubjectLesson, type SubjectRecord } from "@/lib/subjects/types";
import { pct } from "@/lib/subjects/report";
import { GroupTabs, HW_LABEL, NoGroups, SubjectSaveChip, fmtPct, useStoredGroup } from "./shared";

const HW_ORDER: SubjectHomework[] = ["submitted", "not_submitted", "unchecked"];

/** Daily journal shared by Matematika and Tarix. Each subject sees only its own groups and records. */
export function SubjectJournal() {
  const { subject, api, activeGroups, activeStudents, lessons, records } = useSubjectScope();
  const today = todayISO();
  const [date, setDate] = useState(today);
  const [group, pickGroup] = useStoredGroup(subject, activeGroups);

  const roster = useMemo(
    () => (group ? activeStudents.filter((s) => s.group_id === group.id).sort((a, b) => a.name.localeCompare(b.name, "uz")) : []),
    [activeStudents, group],
  );
  const lesson = group ? lessons.find((l) => l.group_id === group.id && l.lesson_date === date) ?? null : null;
  const recOf = (studentId: string): SubjectRecord | null =>
    lesson ? records.find((r) => r.lesson_id === lesson.id && r.student_id === studentId) ?? null : null;

  if (!group) {
    return (
      <>
        <div className="page-head"><h1 className="page-title">Bugun</h1></div>
        <NoGroups subject={subject} />
      </>
    );
  }

  const marked = roster.filter((s) => recOf(s.id)?.attendance != null).length;
  const submitted = roster.filter((s) => recOf(s.id)?.homework === "submitted").length;
  const assessed = roster.filter((s) => {
    const h = recOf(s.id)?.homework;
    return h === "submitted" || h === "not_submitted";
  }).length;
  const unmarked = roster.filter((s) => recOf(s.id)?.attendance == null);
  const showScore = Boolean(lesson?.has_test && lesson.test_max != null);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{date === today ? "Bugun" : formatDay(date)}</h1>
          <p className="page-sub">
            {formatDay(date)} · {group.name} · {roster.length} o&apos;quvchi
          </p>
        </div>
        <div className="page-actions">
          <SubjectSaveChip />
          <button className="icon-btn" aria-label="Oldingi kun" onClick={() => setDate(addDays(date, -1))}><IconChevronLeft /></button>
          <button className="btn" onClick={() => setDate(today)} disabled={date === today}>Bugun</button>
          <button className="icon-btn" aria-label="Keyingi kun" disabled={date >= today} onClick={() => setDate(addDays(date, 1))}><IconChevronRight /></button>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <GroupTabs groups={activeGroups} value={group.id} onChange={pickGroup} />
      </div>

      <LessonInfo key={`${group.id}|${date}`} subject={subject} groupId={group.id} date={date} lesson={lesson} records={records} />

      <div className="card sj-summary">
        <div>
          <div className="sj-summary__row"><span>Davomat</span><span><b>{marked}</b>/{roster.length}</span></div>
          <Meter value={marked} max={Math.max(roster.length, 1)} />
        </div>
        <div>
          <div className="sj-summary__row"><span>Vazifa topshirdi</span><span><b>{submitted}</b>/{assessed}</span></div>
          <Meter value={submitted} max={Math.max(assessed, 1)} tone="ok" />
        </div>
      </div>

      <div className="card">
        {roster.length === 0 ? (
          <div className="empty"><strong>Guruhda o&apos;quvchi yo&apos;q</strong><p className="hint"><Link href={`${SUBJECTS[subject].path}/groups`}>Guruhlar</Link> bo&apos;limida o&apos;quvchi qo&apos;shing.</p></div>
        ) : (
          <div className="sj-table" role="table" aria-label="Jurnal">
            <div className={`sj-row sj-row--head${showScore ? " sj-row--score" : ""}`} role="row">
              <span role="columnheader">O&apos;quvchi</span>
              <span role="columnheader" className="sj-head-att">
                Davomat
                {unmarked.length > 0 && (
                  <button className="btn btn--sm" title="Belgilanmaganlarni Keldi deb belgilash" onClick={() => void api.markAllPresent(subject, group.id, date, unmarked.map((s) => s.id))}>
                    <IconPresent aria-hidden /> Hammasi keldi
                  </button>
                )}
              </span>
              <span role="columnheader">Uy vazifasi</span>
              {showScore && <span role="columnheader">Test balli</span>}
            </div>
            {roster.map((s) => {
              const r = recOf(s.id);
              return (
                <div className={`sj-row${showScore ? " sj-row--score" : ""}`} role="row" key={s.id}>
                  <span className="sj-who" role="cell"><Avatar name={s.name} /><span className="sj-name">{s.name}</span></span>
                  <div className="sj-seg" role="group" aria-label={`Davomat: ${s.name}`}>
                    {(["present", "absent"] as const).map((a) => (
                      <button
                        key={a}
                        type="button"
                        className={`sj-btn sj-btn--${a}`}
                        aria-pressed={r?.attendance === a}
                        onClick={() => void api.setRecord(subject, group.id, date, s.id, { attendance: r?.attendance === a ? null : a })}
                      >
                        {ATTENDANCE_META[a].label}
                      </button>
                    ))}
                  </div>
                  <div className="sj-seg" role="group" aria-label={`Uy vazifasi: ${s.name}`}>
                    {HW_ORDER.map((h) => (
                      <button
                        key={h}
                        type="button"
                        className={`sj-btn sj-btn--${h}`}
                        aria-pressed={r?.homework === h}
                        onClick={() => void api.setRecord(subject, group.id, date, s.id, { homework: r?.homework === h ? null : h })}
                      >
                        {HW_LABEL[h]}
                      </button>
                    ))}
                  </div>
                  {showScore && lesson && (
                    <ScoreCell
                      key={`${r?.score ?? "x"}`}
                      name={s.name}
                      value={r?.score ?? null}
                      max={lesson.test_max as number}
                      onCommit={(v) => api.setRecord(subject, group.id, date, s.id, { score: v })}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <p className="hint" style={{ marginTop: 8 }}>
        Belgilanmagan = hali kiritilmagan (Kelmadi / Topshirmadi emas). {SUBJECTS[subject].label} yozuvlari English jurnalidan alohida saqlanadi.
      </p>
    </>
  );
}

function ScoreCell({ name, value, max, onCommit }: { name: string; value: number | null; max: number; onCommit: (v: number | null) => Promise<boolean> }) {
  const [draft, setDraft] = useState(value === null ? "" : String(value));
  const [err, setErr] = useState<string | null>(null);

  function commit() {
    const text = draft.trim();
    if (text === (value === null ? "" : String(value))) {
      setErr(null);
      return;
    }
    if (text === "") {
      setErr(null);
      void onCommit(null);
      return;
    }
    if (!/^\d+$/.test(text)) return setErr("Butun, manfiy bo'lmagan son kiriting");
    const n = Number(text);
    if (n > max) return setErr(`Maksimal ball ${max} dan oshmasin`);
    setErr(null);
    void onCommit(n).then((ok) => {
      if (!ok) setDraft(value === null ? "" : String(value));
    });
  }

  return (
    <div className="sj-score">
      <div className="sj-score__box">
        <input
          className="input sj-score__input"
          inputMode="numeric"
          aria-label={`Test balli: ${name}`}
          aria-invalid={err ? true : undefined}
          value={draft}
          placeholder="—"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
        />
        <span className="sj-score__max">/ {max}</span>
        {value !== null && <span className="chip chip--brand">{fmtPct(pct(value, max))}</span>}
      </div>
      {err && <span className="sj-err" role="alert">{err}</span>}
    </div>
  );
}

/** Topic, homework text and the "Test bo'ldi" switch for one group on one day. Saved when a field loses focus. */
function LessonInfo({ subject, groupId, date, lesson, records }: { subject: ReturnType<typeof useSubjectScope>["subject"]; groupId: string; date: string; lesson: SubjectLesson | null; records: SubjectRecord[] }) {
  const { api } = useSubjectScope();
  const [topic, setTopic] = useState(lesson?.topic ?? "");
  const [hw, setHw] = useState(lesson?.homework ?? "");
  const [testOn, setTestOn] = useState(lesson?.has_test ?? false);
  const [title, setTitle] = useState(lesson?.test_title ?? "");
  const [max, setMax] = useState(lesson?.test_max != null ? String(lesson.test_max) : "");
  const [err, setErr] = useState<string | null>(null);

  const scored = lesson ? records.filter((r) => r.lesson_id === lesson.id && r.score !== null) : [];
  const topScore = scored.reduce((m, r) => Math.max(m, r.score as number), 0);

  function toggle(on: boolean) {
    setTestOn(on);
    setErr(null);
    if (!on) {
      if (lesson?.has_test) void api.saveLesson(subject, groupId, date, { has_test: false }); // scores are kept
    } else if (lesson?.test_max != null) {
      void api.saveLesson(subject, groupId, date, { has_test: true });
    }
  }

  function saveMax() {
    if (!testOn) return;
    const text = max.trim();
    if (text === "") return setErr("Maksimal ball majburiy");
    if (!/^\d+$/.test(text) || Number(text) < 1 || Number(text) > 1000) return setErr("Maksimal ball 1 dan 1000 gacha butun son bo'lsin");
    const n = Number(text);
    if (n < topScore) return setErr(`Kiritilgan eng yuqori ball ${topScore}: maksimal ball undan kichik bo'lmasin`);
    setErr(null);
    if (lesson?.has_test && lesson.test_max === n && (lesson.test_title ?? "") === title.trim()) return;
    void api.saveLesson(subject, groupId, date, { test_max: n, test_title: title, has_test: true });
  }

  return (
    <div className="card sj-info" style={{ marginBottom: 12 }}>
      <div className="sj-info__grid">
        <label className="field">
          <span className="field__label"><IconBook aria-hidden /> Bugun o&apos;tilgan mavzu</span>
          <input
            className="input"
            value={topic}
            placeholder="Masalan: Kvadrat tenglamalar"
            maxLength={300}
            onChange={(e) => setTopic(e.target.value)}
            onBlur={() => topic.trim() !== (lesson?.topic ?? "") && void api.saveLesson(subject, groupId, date, { topic })}
          />
        </label>
        <label className="field">
          <span className="field__label">Uy vazifasi</span>
          <input
            className="input"
            value={hw}
            placeholder="Masalan: 25-mashq, 3-bet"
            maxLength={1000}
            onChange={(e) => setHw(e.target.value)}
            onBlur={() => hw.trim() !== (lesson?.homework ?? "") && void api.saveLesson(subject, groupId, date, { homework: hw })}
          />
        </label>
      </div>
      <div className="sj-test">
        <label className="sj-switch">
          <input type="checkbox" role="switch" checked={testOn} onChange={(e) => toggle(e.target.checked)} />
          <span className="sj-switch__track" aria-hidden />
          <span>Test bo&apos;ldi</span>
        </label>
        {testOn && (
          <div className="sj-test__fields">
            <label className="field">
              <span className="field__label">Test nomi/mavzusi (ixtiyoriy)</span>
              <input className="input" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} onBlur={() => max.trim() !== "" && saveMax()} />
            </label>
            <label className="field">
              <span className="field__label">Maksimal ball *</span>
              <input
                className="input"
                inputMode="numeric"
                value={max}
                aria-invalid={err ? true : undefined}
                aria-label="Maksimal ball"
                onChange={(e) => setMax(e.target.value)}
                onBlur={saveMax}
                onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
              />
            </label>
          </div>
        )}
        {testOn && err && <p className="sj-err" role="alert">{err}</p>}
        {testOn && !err && lesson?.test_max == null && <p className="hint">Maksimal ballni kiriting, shundan so&apos;ng ball ustuni ochiladi.</p>}
        {!testOn && lesson && lesson.test_max != null && scored.length > 0 && (
          <p className="hint">Test o&apos;chirilgan: {scored.length} ta kiritilgan ball saqlanib turibdi, lekin hisobotga kirmaydi.</p>
        )}
      </div>
    </div>
  );
}
