"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { HomeworkDrawer } from "@/components/HomeworkDrawer";
import { ProgressButton } from "@/components/HomeworkParts";
import { HomeworkTasks } from "@/components/HomeworkTasks";
import { IconChevronLeft, IconChevronRight, IconCoin, IconAlert, IconBook, IconHistory, IconPresent, IconWatch } from "@/components/icons";
import { AttendanceMarks, Meter, SaveChip } from "@/components/ui";
import { HOMEWORK_META } from "@/lib/config";
import { studentProgress } from "@/lib/homework";
import { useHomework } from "@/lib/homeworkData";
import { useData, type PlanPatch } from "@/lib/data";
import { addDays, formatDay, formatShort, todayISO, weekStart } from "@/lib/dates";
import { currentTopic } from "@/lib/progress";
import { scoreLessons } from "@/lib/scoring";
import type { Attendance, Student } from "@/lib/types";

const PLAN_DEBOUNCE_MS = 800;

export default function TodayPage() {
  const data = useData();
  const {
    activeGroups,
    activeStudents,
    lessonsByStudent,
    topicsByStudent,
    plans,
    markLesson,
    markAttendanceBulk,
    savePlan,
    isSaving,
  } = data;
  const hw = useHomework();
  const [drawerFor, setDrawerFor] = useState<Student | null>(null);

  const today = todayISO();
  const [date, setDate] = useState(today);
  const [groupId, setGroupId] = useState<string | null>(null);

  const group = activeGroups.find((g) => g.id === groupId) ?? activeGroups[0] ?? null;
  const roster = useMemo(
    () =>
      group
        ? activeStudents.filter((s) => s.group_id === group.id).sort((a, b) => a.name.localeCompare(b.name))
        : [],
    [activeStudents, group],
  );

  // ---- lesson info: topic taught + homework assigned (stored in Supabase, autosaved) -----
  const plan = plans.find((p) => p.group_id === group?.id && p.lesson_date === date);
  const [topicDraft, setTopicDraft] = useState(plan?.topic ?? "");
  const [planState, setPlanState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  type Pending = { groupId: string; date: string; patch: PlanPatch };
  const pending = useRef<Pending | null>(null);
  const failed = useRef<Pending | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savePlanRef = useRef(savePlan);
  useEffect(() => {
    savePlanRef.current = savePlan;
  });

  const send = useCallback(async (p: Pending) => {
    setPlanState("saving");
    const ok = await savePlanRef.current(p.groupId, p.date, p.patch);
    if (ok) {
      if (failed.current?.groupId === p.groupId && failed.current.date === p.date) failed.current = null;
      setPlanState(pending.current ? "saving" : "saved");
    } else {
      const f = failed.current;
      failed.current =
        f && f.groupId === p.groupId && f.date === p.date ? { ...p, patch: { ...f.patch, ...p.patch } } : p;
      setPlanState("error");
    }
  }, []);

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const p = pending.current;
    pending.current = null;
    if (p) void send(p);
  }, [send]);

  const retry = useCallback(() => {
    const f = failed.current;
    failed.current = null;
    if (f) void send(f);
  }, [send]);

  const groupKey = group?.id ?? "";
  useEffect(() => {
    // Switching group or day: save what was typed, then show the stored values for the new one.
    const stored = plans.find((p) => p.group_id === groupKey && p.lesson_date === date);
    setTopicDraft(stored?.topic ?? "");
    setPlanState("idle");
    return () => flush();
    // `plans` is intentionally not a dependency: remote updates must not overwrite what is being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupKey, date, flush]);

  function onField(field: keyof PlanPatch, text: string) {
    setTopicDraft(text);
    if (!group) return;
    const cur = pending.current;
    pending.current = {
      groupId: group.id,
      date,
      patch: { ...(cur && cur.groupId === group.id && cur.date === date ? cur.patch : {}), [field]: text },
    };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, PLAN_DEBOUNCE_MS);
  }

  const previousPlans = useMemo(
    () =>
      plans
        .filter((p) => p.group_id === group?.id && p.lesson_date < date)
        .sort((a, b) => (a.lesson_date < b.lesson_date ? 1 : -1))
        .slice(0, 8),
    [plans, group, date],
  );

  // ---- rows ---------------------------------------------------------------
  const scoredByStudent = useMemo(
    () => new Map(roster.map((s) => [s.id, scoreLessons(lessonsByStudent.get(s.id) ?? [])])),
    [roster, lessonsByStudent],
  );
  const weekFrom = weekStart(date);
  const weekTo = addDays(weekFrom, 6);

  const dayTasks = useMemo(() => (group ? hw.tasksFor(group.id, date) : []), [hw, group, date]);
  const dayTaskIds = useMemo(() => dayTasks.map((t) => t.id), [dayTasks]);

  const rows = roster.map((student) => {
    const lessons = lessonsByStudent.get(student.id) ?? [];
    const existing = lessons.find((l) => l.lesson_date === date);
    const scored = scoredByStudent.get(student.id) ?? [];
    const taskEvents = hw.coinEvents.filter((e) => e.student_id === student.id);
    const dayCoins =
      (existing ? (scored.find((s) => s.lesson.id === existing.id)?.coins ?? 0) : 0) +
      taskEvents.filter((e) => e.date === date).reduce((sum, e) => sum + e.coins, 0);
    const weekCoins =
      scored
        .filter((s) => s.lesson.lesson_date >= weekFrom && s.lesson.lesson_date <= weekTo)
        .reduce((sum, s) => sum + s.coins, 0) +
      taskEvents.filter((e) => e.date >= weekFrom && e.date <= weekTo).reduce((sum, e) => sum + e.coins, 0);
    const progress = studentProgress(dayTaskIds, student.id, hw.assignedSet, hw.assessMap);
    const topics = topicsByStudent.get(student.id) ?? [];
    const planned = topics.length ? currentTopic(topics, lessons.filter((l) => l.lesson_date < date)) : null;
    return { student, existing, dayCoins, weekCoins, planned, progress };
  });

  const attMarked = rows.filter((r) => r.existing?.attendance).length;
  const present = rows.filter((r) => r.existing?.attendance === "present").length;
  // With structured tasks: graded / assigned task slots. Without: the old per-lesson grade counts.
  const hwSlots = rows.reduce((n, r) => n + r.progress.assigned, 0);
  const hwDone = rows.reduce((n, r) => n + r.progress.graded, 0);
  const legacyGraded = rows.filter((r) => r.existing?.homework).length;
  const hwGraded = dayTasks.length ? hwDone : legacyGraded;
  const hwTarget = dayTasks.length ? hwSlots : Math.max(present, legacyGraded);

  function createArgs(row: (typeof rows)[number]) {
    return {
      topicId: row.planned?.id ?? null,
      topicTitle: topicDraft.trim() ? topicDraft.trim().slice(0, 200) : (row.planned?.title ?? "Dars"),
    };
  }

  function setAttendance(row: (typeof rows)[number], value: Attendance | null) {
    void markLesson({ student: row.student, date, attendance: value, ...createArgs(row) });
  }

  const unmarked: Student[] = rows.filter((r) => !r.existing).map((r) => r.student);

  if (!activeGroups.length) {
    return (
      <>
        <div className="page-head">
          <h1 className="page-title">Bugun</h1>
        </div>
        <div className="card empty">
          <strong>Hali guruh yo&apos;q</strong>
          <p>Avval guruh va o&apos;quvchilarni qo&apos;shing, keyin davomat bir bosishda belgilanadi.</p>
          <p style={{ marginTop: 14 }}>
            <Link className="btn btn--primary" href="/students">
              Guruh qo&apos;shish
            </Link>
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{date === today ? "Bugun" : formatDay(date)}</h1>
          <p className="page-sub">
            {date === today ? formatDay(date) : "O'tgan dars"}
            {group && ` · ${group.name} · ${roster.length} o'quvchi`}
          </p>
        </div>
        <div className="page-actions">
          <SaveChip />
          <button className="icon-btn" aria-label="Oldingi kun" onClick={() => setDate(addDays(date, -1))}>
            <IconChevronLeft />
          </button>
          <button className="btn" onClick={() => setDate(today)} disabled={date === today}>
            Bugun
          </button>
          <button className="icon-btn" aria-label="Keyingi kun" disabled={date >= today} onClick={() => setDate(addDays(date, 1))}>
            <IconChevronRight />
          </button>
        </div>
      </div>

      <div className="seg" role="tablist" aria-label="Guruhlar" style={{ marginBottom: 12 }}>
        {activeGroups.map((g) => (
          <button
            key={g.id}
            role="tab"
            className="seg__btn"
            aria-selected={g.id === group?.id}
            onClick={() => setGroupId(g.id)}
          >
            {g.name}
          </button>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="plan">
          <div className="plan__head">
            <span className="plan__title">
              <IconBook aria-hidden /> Dars ma&apos;lumoti
            </span>
            <span className="plan__status" role="status" aria-live="polite" data-state={planState}>
              {planState === "saving" && "Saqlanmoqda…"}
              {planState === "saved" && "Saqlandi"}
              {planState === "error" && (
                <>
                  <IconAlert aria-hidden /> Saqlanmadi
                  <button className="btn btn--sm" onClick={retry}>
                    Qayta urinish
                  </button>
                </>
              )}
              {planState === "idle" && <span className="hint">Butun guruh uchun, avtomatik saqlanadi</span>}
            </span>
          </div>
          <div className="plan__fields">
            <label className="field">
              <span className="field__label">
                <IconBook aria-hidden /> Bugun o&apos;tilgan mavzu
              </span>
              <textarea
                className="input"
                value={topicDraft}
                rows={2}
                maxLength={300}
                placeholder="Masalan: Present Simple — Positive and Negative Forms"
                onChange={(e) => onField("topic", e.target.value)}
                onBlur={flush}
              />
            </label>
          </div>
          {previousPlans.length > 0 && (
            <details className="plan__prev">
              <summary>
                <IconHistory aria-hidden /> Oldingi darslar
              </summary>
              <div className="plan__list">
                {previousPlans.map((p) => (
                  <div className="plan__item" key={p.id}>
                    <time>{formatShort(p.lesson_date)}</time>
                    <span>
                      {p.topic && <strong>{p.topic}</strong>}
                      {p.homework && <small>{p.homework}</small>}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
        {group && (
          <HomeworkTasks
            group={group}
            date={date}
            roster={roster}
            legacyText={plan?.homework ?? null}
          />
        )}
        {rows.length > 0 && (
          <div className="progress-strip" style={{ borderTop: "1px solid var(--line)" }}>
            <div className="progress-strip__item">
              <div className="progress-strip__head">
                <span>Davomat</span>
                <strong>
                  {attMarked}
                  <small>/{rows.length}</small>
                </strong>
              </div>
              <Meter value={attMarked} max={rows.length} />
            </div>
            <div className="progress-strip__item">
              <div className="progress-strip__head">
                <span>Vazifa baholandi</span>
                <strong>
                  {hwGraded}
                  <small>/{hwTarget}</small>
                </strong>
              </div>
              <Meter value={hwGraded} max={hwTarget} tone="ok" />
            </div>
          </div>
        )}
      </div>

      <div className="card">
        {rows.length === 0 ? (
          <div className="empty">
            <strong>{group?.name} guruhida o&apos;quvchi yo&apos;q</strong>
            <Link href="/students">O&apos;quvchi qo&apos;shish</Link>
          </div>
        ) : (
          <>
            <div className="roster__head roster__head--hw">
              <span>O&apos;quvchi</span>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                Davomat
                {unmarked.length > 0 && (
                  <button
                    className="btn btn--sm"
                    style={{ height: 24 }}
                    onClick={() => void markAttendanceBulk(unmarked, date, "present").then(() => hw.refreshCases())}
                    title="Belgilanmaganlarni Keldi deb belgilash"
                  >
                    <IconPresent aria-hidden /> Hammasi keldi
                  </button>
                )}
              </span>
              <span>Vazifalar</span>
              <span>Tanga</span>
              <span className="sr-only">Amallar</span>
            </div>
            <ul className="roster">
              {rows.map((row) => {
                const busy = isSaving(row.student.id);
                const att = row.existing?.attendance ?? null;
                const legacyHw = row.existing?.homework ?? null;
                return (
                  <li className="student student--hw" key={row.student.id}>
                    <Link href={`/students/${row.student.id}`} className="student__who">
                      <Avatar name={row.student.name} />
                      <span style={{ minWidth: 0 }}>
                        <span className="student__name" style={{ display: "block" }}>
                          {row.student.name}
                          {busy && <span className="student__spin" role="status" aria-label="Saqlanmoqda" style={{ display: "inline-block" }} />}
                        </span>
                        {row.planned && <span className="student__sub">Mavzu: {row.planned.title}</span>}
                      </span>
                    </Link>
                    <span className="student__coins" style={{ display: "flex", gap: 6 }}>
                      {row.dayCoins > 0 && (
                        <span className="coins coins--delta" title="Shu dars uchun">
                          +{row.dayCoins}
                        </span>
                      )}
                      <span className="coins" title="Shu haftadagi tangalar">
                        <IconCoin aria-hidden />
                        {row.weekCoins}
                      </span>
                    </span>
                    <div className="student__att">
                      <AttendanceMarks
                        name={row.student.name}
                        value={att}
                        disabled={busy}
                        onChange={(v) => {
                          setAttendance(row, v);
                          void hw.refreshCases();
                        }}
                      />
                    </div>
                    <div className="student__hw">
                      <ProgressButton
                        progress={row.progress}
                        tasksExist={dayTasks.length > 0}
                        legacy={legacyHw ? HOMEWORK_META[legacyHw].label : null}
                        name={row.student.name}
                        onClick={() => setDrawerFor(row.student)}
                      />
                    </div>
                    <div className="student__act">
                      <button className="icon-btn icon-btn--bare" aria-label={`${row.student.name}: vazifalarni ochish`} title="Vazifalar" onClick={() => setDrawerFor(row.student)}>
                        <IconWatch />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      {group && <HomeworkDrawer student={drawerFor} group={group} date={date} legacy={drawerFor ? (rows.find((r) => r.student.id === drawerFor.id)?.existing?.homework ?? null) : null} onClose={() => setDrawerFor(null)} />}
    </>
  );
}
