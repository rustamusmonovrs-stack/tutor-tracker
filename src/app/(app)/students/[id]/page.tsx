"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Avatar } from "@/components/Avatar";
import { Legend, StackedBars } from "@/components/charts";
import {
  IconArchive,
  IconArrowDown,
  IconArrowUp,
  IconChevronLeft,
  IconClose,
  IconEdit,
  IconPlus,
  IconRestore,
  IconTrash,
} from "@/components/icons";
import { AttendanceMarks, ConfirmDialog, HomeworkMarks, Kpi, SaveChip } from "@/components/ui";
import { useData } from "@/lib/data";
import { addDays, formatShort, todayISO, weekStart } from "@/lib/dates";
import { currentTopic, repeatCount, topicStatuses } from "@/lib/progress";
import { currentStreak, scoreLessons, summarize } from "@/lib/scoring";
import type { Topic } from "@/lib/types";

const PAGE = 30;
const WEEKS = 8;

export default function StudentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const {
    students,
    groups,
    topicsByStudent,
    lessonsByStudent,
    isSaving,
    markLesson,
    updateStudent,
    setStudentArchived,
    deleteStudent,
    addTopics,
    renameTopic,
    removeTopic,
    moveTopic,
  } = useData();

  const student = students.find((s) => s.id === id);
  const topics = useMemo(() => topicsByStudent.get(id) ?? [], [topicsByStudent, id]);
  const lessons = useMemo(() => lessonsByStudent.get(id) ?? [], [lessonsByStudent, id]);

  const [name, setName] = useState(student?.name ?? "");
  const [bulk, setBulk] = useState("");
  const [editingTopic, setEditingTopic] = useState<string | null>(null);
  const [topicDraft, setTopicDraft] = useState("");
  const [removing, setRemoving] = useState<Topic | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [shown, setShown] = useState(PAGE);

  useEffect(() => {
    if (student) setName(student.name);
  }, [student]);

  const statuses = useMemo(() => topicStatuses(topics, lessons), [topics, lessons]);
  const scored = useMemo(() => scoreLessons(lessons), [lessons]);
  const all = useMemo(() => summarize(scored), [scored]);

  const today = todayISO();
  const thisWeek = weekStart(today);
  const weekly = useMemo(() => {
    return Array.from({ length: WEEKS }, (_, i) => {
      const start = addDays(thisWeek, -7 * (WEEKS - 1 - i));
      const end = addDays(start, 6);
      const inWeek = scored.filter((s) => s.lesson.lesson_date >= start && s.lesson.lesson_date <= end);
      const sum = summarize(inWeek);
      return { start, sum };
    });
  }, [scored, thisWeek]);
  const monthCoins = scored
    .filter((s) => s.lesson.lesson_date >= addDays(today, -29))
    .reduce((t, s) => t + s.coins, 0);
  const weekCoins = weekly[WEEKS - 1].sum.coins;

  const history = useMemo(
    () =>
      [...scored]
        .reverse()
        .filter((s) => (!from || s.lesson.lesson_date >= from) && (!to || s.lesson.lesson_date <= to)),
    [scored, from, to],
  );

  if (!student) {
    return (
      <div className="card empty">
        <strong>O&apos;quvchi topilmadi</strong>
        <p>U o&apos;chirilgan bo&apos;lishi mumkin.</p>
        <p style={{ marginTop: 14 }}>
          <Link className="btn" href="/students">
            O&apos;quvchilarga qaytish
          </Link>
        </p>
      </div>
    );
  }

  const current = currentTopic(topics, lessons);
  const doneCount = topics.filter((t) => statuses.get(t.id) === "done").length;
  const repeats = repeatCount(current, lessons);
  const streak = currentStreak(lessons);
  const activeGroups = groups.filter((g) => !g.archived_at || g.id === student.group_id);
  const group = groups.find((g) => g.id === student.group_id);
  const attendanceBase = all.present + all.absent;
  const saving = isSaving(student.id);

  async function saveName(e: FormEvent) {
    e.preventDefault();
    const value = name.trim();
    if (!value) return setName(student!.name);
    if (value !== student!.name) await updateStudent(student!.id, { name: value });
  }

  async function submitTopics(e: FormEvent) {
    e.preventDefault();
    if (await addTopics(student!.id, bulk.split("\n"))) setBulk("");
  }

  async function saveTopic(e: FormEvent, topic: Topic) {
    e.preventDefault();
    setEditingTopic(null);
    if (topicDraft.trim() && topicDraft.trim() !== topic.title) await renameTopic(topic.id, topicDraft);
  }

  async function onDelete() {
    setBusy(true);
    if (await deleteStudent(student!.id)) router.replace("/students");
    else setBusy(false);
  }

  const lines = bulk.split("\n").filter((l) => l.trim()).length;
  const hwSeries = [
    { key: "full", label: "To'liq", color: "var(--ok)" },
    { key: "partial", label: "Chala", color: "#e0a526" },
    { key: "notDone", label: "Qilmadi", color: "var(--bad)" },
  ];
  const coinSeries = [{ key: "coins", label: "Tanga", color: "var(--brand)" }];

  return (
    <>
      <p style={{ marginBottom: 8 }}>
        <Link href="/students" className="btn btn--ghost btn--sm" style={{ paddingLeft: 4 }}>
          <IconChevronLeft aria-hidden /> O&apos;quvchilar
        </Link>
      </p>

      <div className="page-head">
        <div className="profile-head">
          <Avatar name={student.name} size={52} />
          <div>
            <h1 className="page-title">{student.name}</h1>
            <p className="page-sub">
              {group?.name}
              {student.archived_at ? " · Arxivda" : ""}
              {topics.length ? ` · ${doneCount}/${topics.length} mavzu bajarilgan` : ""}
            </p>
          </div>
        </div>
        <div className="page-actions">
          <SaveChip />
        </div>
      </div>

      <div className="kpis">
        <Kpi label="Jami tanga" value={all.coins} note={`Hafta: ${weekCoins} · 30 kun: ${monthCoins}`} />
        <Kpi label="Joriy seriya" value={streak} unit="ta" note="Ketma-ket to'liq vazifa" />
        <Kpi
          label="Davomat"
          value={attendanceBase ? Math.round((all.present / attendanceBase) * 100) : "—"}
          unit={attendanceBase ? "%" : undefined}
          note={attendanceBase ? `${all.present} keldi · ${all.absent} kelmadi` : "Hali belgilanmagan"}
        />
        <Kpi
          label="To'liq vazifa"
          value={all.graded ? Math.round((all.full / all.graded) * 100) : "—"}
          unit={all.graded ? "%" : undefined}
          note={all.graded ? `${all.full} / ${all.graded} baholangan` : "Hali baholanmagan"}
        />
      </div>

      {lessons.length === 0 ? (
        <div className="card empty" style={{ marginBottom: 16 }}>
          <strong>Hali dars belgilanmagan</strong>
          <p>Bugun sahifasida davomat va uy vazifasini belgilang, statistika shu yerda paydo bo&apos;ladi.</p>
        </div>
      ) : (
        <div className="charts" style={{ marginBottom: 16 }}>
          <div className="card chart">
            <span className="chart__title">Haftalik tanga</span>
            <StackedBars
              data={weekly.map((w) => ({ label: formatShort(w.start), values: { coins: w.sum.coins } }))}
              series={coinSeries}
              summary={`Oxirgi ${WEEKS} hafta bo'yicha tangalar`}
            />
          </div>
          <div className="card chart">
            <span className="chart__title">Uy vazifasi (haftalik)</span>
            <StackedBars
              data={weekly.map((w) => ({
                label: formatShort(w.start),
                values: { full: w.sum.full, partial: w.sum.partial, notDone: w.sum.notDone },
              }))}
              series={hwSeries}
              summary={`Oxirgi ${WEEKS} hafta bo'yicha uy vazifasi natijalari`}
            />
            <Legend series={hwSeries} />
          </div>
        </div>
      )}

      <h2 className="section-title" style={{ marginTop: 8 }}>
        Darslar tarixi
      </h2>
      <div className="toolbar">
        <label className="field" style={{ gridAutoFlow: "column", alignItems: "center" }}>
          <span className="field__label">Dan</span>
          <input className="input" type="date" style={{ width: 150 }} value={from} max={to || today} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="field" style={{ gridAutoFlow: "column", alignItems: "center" }}>
          <span className="field__label">Gacha</span>
          <input className="input" type="date" style={{ width: 150 }} value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} />
        </label>
        {(from || to) && (
          <button className="btn btn--ghost" onClick={() => { setFrom(""); setTo(""); }}>
            Tozalash
          </button>
        )}
      </div>
      <div className="card">
        {history.length === 0 ? (
          <p className="empty">{lessons.length ? "Bu oraliqda dars yo'q." : "Hali darslar yo'q."}</p>
        ) : (
          history.slice(0, shown).map(({ lesson, coins }) => (
            <div key={lesson.id} className="hist">
              <time dateTime={lesson.lesson_date}>{formatShort(lesson.lesson_date)}</time>
              <span style={{ overflowWrap: "anywhere", color: "var(--ink-2)" }}>{lesson.topic_title}</span>
              <div className="hist__marks">
                <AttendanceMarks
                  name={`${student.name}, ${lesson.lesson_date}`}
                  value={lesson.attendance}
                  disabled={saving}
                  onChange={(v) => void markLesson({ student, date: lesson.lesson_date, attendance: v })}
                />
                <HomeworkMarks
                  name={`${student.name}, ${lesson.lesson_date}`}
                  value={lesson.homework}
                  disabled={saving}
                  muted={lesson.attendance === "absent" && !lesson.homework}
                  onChange={(v) => void markLesson({ student, date: lesson.lesson_date, homework: v })}
                />
              </div>
              <span style={{ fontWeight: 680, textAlign: "right" }}>{coins > 0 ? `+${coins}` : ""}</span>
            </div>
          ))
        )}
      </div>
      {history.length > shown && (
        <p style={{ marginTop: 8 }}>
          <button className="btn" onClick={() => setShown(shown + PAGE)}>
            Yana ko&apos;rsatish ({history.length - shown})
          </button>
        </p>
      )}

      <h2 className="section-title">Ma&apos;lumotlar</h2>
      <div className="card card--pad stack">
        <form className="form-row" onSubmit={saveName} style={{ alignItems: "end" }}>
          <label className="field" style={{ flex: 1 }}>
            <span className="field__label">Ism</span>
            <input className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} onBlur={saveName} />
          </label>
        </form>
        <label className="field">
          <span className="field__label">Guruh</span>
          <select className="select" value={student.group_id} onChange={(e) => void updateStudent(student.id, { group_id: e.target.value })}>
            {activeGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
                {g.archived_at ? " (arxivda)" : ""}
              </option>
            ))}
          </select>
        </label>
        <p className="hint">Guruhni o&apos;zgartirsangiz, barcha darslar va tangalar o&apos;quvchi bilan birga ko&apos;chadi.</p>
      </div>

      <h2 className="section-title">Shaxsiy mavzular rejasi</h2>
      {repeats >= 1 && current && (
        <p className="callout" style={{ background: "var(--warn-soft)", color: "var(--warn)" }}>
          “{current.title}” mavzusi {repeats} marta qaytarildi.
        </p>
      )}
      <div className="card">
        {topics.length === 0 ? (
          <div className="empty">
            <strong>Mavzular hali kiritilmagan</strong>
            <p>Ixtiyoriy: rejani quyida har qatorga bitta mavzu qilib joylang. Mavzu uy vazifasi &quot;To&apos;liq&quot; bo&apos;lganda o&apos;tilgan hisoblanadi.</p>
          </div>
        ) : (
          topics.map((t, i) => {
            const status = statuses.get(t.id) ?? "upcoming";
            return (
              <div key={t.id} className={`topic-row topic-row--${status}`}>
                <span className="topic-row__pos">{status === "done" ? "✓" : i + 1}</span>
                {editingTopic === t.id ? (
                  <form className="form-row" onSubmit={(e) => void saveTopic(e, t)} style={{ gridColumn: "2 / 4" }}>
                    <input
                      className="input"
                      value={topicDraft}
                      autoFocus
                      aria-label="Mavzu nomi"
                      maxLength={200}
                      onChange={(e) => setTopicDraft(e.target.value)}
                      onKeyDown={(e) => e.key === "Escape" && setEditingTopic(null)}
                    />
                    <button className="btn btn--primary" type="submit">
                      Saqlash
                    </button>
                  </form>
                ) : (
                  <>
                    <span className="topic-row__title">
                      {t.title}
                      {status === "current" && (
                        <span className="chip chip--brand" style={{ marginLeft: 8 }}>
                          Keyingi
                        </span>
                      )}
                    </span>
                    <span className="topic-row__tools">
                      <button className="icon-btn icon-btn--bare" aria-label={`“${t.title}” ni yuqoriga`} disabled={i === 0} onClick={() => void moveTopic(student.id, t.id, -1)}>
                        <IconArrowUp aria-hidden />
                      </button>
                      <button className="icon-btn icon-btn--bare" aria-label={`“${t.title}” ni pastga`} disabled={i === topics.length - 1} onClick={() => void moveTopic(student.id, t.id, 1)}>
                        <IconArrowDown aria-hidden />
                      </button>
                      <button className="icon-btn icon-btn--bare" aria-label={`“${t.title}” ni tahrirlash`} onClick={() => { setEditingTopic(t.id); setTopicDraft(t.title); }}>
                        <IconEdit aria-hidden />
                      </button>
                      <button className="icon-btn icon-btn--bare" aria-label={`“${t.title}” ni o'chirish`} onClick={() => setRemoving(t)}>
                        <IconClose aria-hidden />
                      </button>
                    </span>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>

      <form className="stack" style={{ marginTop: 12 }} onSubmit={submitTopics}>
        <label className="field">
          <span className="field__label">Mavzular qo&apos;shish (har qatorga bittadan)</span>
          <textarea className="input" value={bulk} placeholder={"Present perfect\nConditionals"} onChange={(e) => setBulk(e.target.value)} />
        </label>
        <div>
          <button className="btn btn--primary" type="submit" disabled={lines === 0}>
            <IconPlus aria-hidden />
            {lines > 1 ? `${lines} ta mavzu qo'shish` : "Mavzu qo'shish"}
          </button>
        </div>
      </form>

      <section className="danger" aria-label="Arxivlash yoki o'chirish">
        <h3>Arxivlash yoki o&apos;chirish</h3>
        <p className="hint">
          <strong>Arxivlash</strong> {student.name} ni Bugun va Reytingdan yashiradi, lekin butun tarix saqlanadi. Istalgan payt qaytarish mumkin.
        </p>
        <div className="actions">
          <button className="btn" onClick={() => void setStudentArchived(student.id, !student.archived_at)}>
            {student.archived_at ? <IconRestore aria-hidden /> : <IconArchive aria-hidden />}
            {student.archived_at ? "Arxivdan qaytarish" : "Arxivlash"}
          </button>
        </div>
        <p className="hint" style={{ marginTop: 16 }}>
          <strong>Butunlay o&apos;chirish</strong> {student.name}, uning barcha mavzulari va darslar tarixini o&apos;chiradi. Qaytarib bo&apos;lmaydi. Tasdiqlash uchun ismni yozing.
        </p>
        <div className="form-row" style={{ marginTop: 8 }}>
          <input
            className="input"
            value={confirmText}
            placeholder={student.name}
            aria-label="O'chirishni tasdiqlash uchun o'quvchi ismini yozing"
            onChange={(e) => setConfirmText(e.target.value)}
          />
          <button className="btn btn--danger" disabled={busy || confirmText.trim() !== student.name} onClick={() => void onDelete()}>
            <IconTrash aria-hidden /> O&apos;chirish
          </button>
        </div>
      </section>

      <ConfirmDialog
        open={Boolean(removing)}
        title={`“${removing?.title ?? ""}” mavzusini olib tashlaysizmi?`}
        confirmLabel="Olib tashlash"
        danger
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          const t = removing;
          setRemoving(null);
          if (t) void removeTopic(t.id);
        }}
      >
        O&apos;tgan darslarda mavzu nomi saqlanib qoladi.
      </ConfirmDialog>
    </>
  );
}
