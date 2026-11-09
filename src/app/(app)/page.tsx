"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { HomeworkDrawer } from "@/components/HomeworkDrawer";
import { ProgressButton } from "@/components/HomeworkParts";
import { HomeworkTasks } from "@/components/HomeworkTasks";
import { GroupSwitcher } from "@/components/GroupSwitcher";
import { IconChevronLeft, IconChevronRight, IconCoin, IconAlert, IconBook, IconCheck, IconClose, IconHistory, IconPresent, IconTask, IconUsers, IconWatch } from "@/components/icons";
import { AttendanceMarks, SaveChip, SummaryTile } from "@/components/ui";
import { DailyReportCard } from "@/components/DailyReportCard";
import { buildEnglishDaily, englishLessonDates } from "@/lib/daily/build";
import { HOMEWORK_META } from "@/lib/config";
import { blockerLines, groupDeleteBlockers } from "@/lib/groups";
import { lessonCheckTasks, studentProgress } from "@/lib/homework";
import { useHomework } from "@/lib/homeworkData";
import { useStages } from "@/lib/stagesData";
import { useData, type PlanPatch } from "@/lib/data";
import { addDays, formatDay, formatShort, todayISO, weekStart } from "@/lib/dates";
import { currentTopic } from "@/lib/progress";
import { scoreLessons } from "@/lib/scoring";
import type { Attendance, Student } from "@/lib/types";

const PLAN_DEBOUNCE_MS = 800;

export default function TodayPage() {
  const data = useData();
  const {
    groups,
    activeGroups,
    activeStudents,
    students: allStudents,
    lessons: allLessons,
    lessonsByStudent,
    topicsByStudent,
    plans,
    markLesson,
    markAttendanceBulk,
    savePlan,
    isSaving,
    renameGroup,
    setGroupArchived,
    deleteGroup,
  } = data;
  const hw = useHomework();
  const stages = useStages();
  const { transfersByStudent } = stages;
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

  // Tasks checked in this lesson: entered here, plus earlier-given ones whose stored checking date is this lesson.
  const dayTasks = useMemo(() => (group ? lessonCheckTasks(hw.tasks, group.id, date) : []), [hw.tasks, group, date]);
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
  const absent = rows.filter((r) => r.existing?.attendance === "absent").length;
  // With structured tasks: graded / assigned task slots. Without: the old per-lesson grade counts.
  const hwSlots = rows.reduce((n, r) => n + r.progress.assigned, 0);
  const hwDone = rows.reduce((n, r) => n + r.progress.graded, 0);
  const legacyGraded = rows.filter((r) => r.existing?.homework).length;
  const hwGraded = dayTasks.length ? hwDone : legacyGraded;
  const hwTarget = dayTasks.length ? hwSlots : Math.max(present, legacyGraded);
  // Same numbers as before; only the empty case (no tasks and no old-format grades) is shown as a neutral dash, not "0/N".
  const hasHwWork = dayTasks.length > 0 || legacyGraded > 0;

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

  // Permanent group deletion is only offered for a group with no history at all (see lib/groups.ts).
  const factsReady = stages.status === "ready" && hw.status === "ready";
  const transferList = useMemo(() => [...transfersByStudent.values()].flat(), [transfersByStudent]);
  const stintList = useMemo(() => [...stages.stintsByStudent.values()].flat(), [stages.stintsByStudent]);
  const deleteBlockers = (id: string) =>
    !factsReady
      ? ["Ma'lumotlar hali to'liq yuklanmadi"]
      : blockerLines(
          groupDeleteBlockers({
            groupId: id,
            students: allStudents,
            lessonPlans: plans,
            tasks: hw.tasks,
            watchCases: hw.cases,
            saturdayPlans: stages.plans,
            transfers: transferList,
            stints: stintList,
          }),
        );
  const switcher = (value: string | null) => (
    <GroupSwitcher
      groups={groups}
      value={value}
      onChange={setGroupId}
      studentCount={(id) => activeStudents.filter((s) => s.group_id === id).length}
      onRename={renameGroup}
      onArchive={(id) => setGroupArchived(id, true)}
      onRestore={(id) => setGroupArchived(id, false)}
      onDelete={deleteGroup}
      deleteBlockers={deleteBlockers}
      archiveKeeps="Arxivlash faqat guruhni yashiradi: o'quvchilar, davomat, vazifa baholari, tangalar, reyting, mock natijalari va hisobotlar o'zgarmaydi."
    />
  );

  if (!activeGroups.length) {
    return (
      <>
        <div className="page-head">
          <h1 className="page-title">Bugun</h1>
        </div>
        {groups.length > 0 && <div style={{ marginBottom: 12 }}>{switcher(null)}</div>}
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

      <div style={{ marginBottom: 12 }}>{switcher(group?.id ?? null)}</div>

      <div className="today-top">
      <div className="card plan-card">
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
      </div>
      {group && (
        <div className="card hwt-card">
          <HomeworkTasks group={group} date={date} roster={roster} legacyText={plan?.homework ?? null} />
        </div>
      )}
      {rows.length > 0 && (
        <div className="tiles today-tiles" role="group" aria-label="Kunlik ko'rsatkichlar">
          <SummaryTile icon={<IconUsers />} label="Jami o'quvchilar" value={rows.length} tone="brand" />
          <SummaryTile
            icon={<IconCheck />}
            label="Kelganlar"
            value={present}
            tone="ok"
            note={`${attMarked}/${rows.length} belgilangan`}
          />
          <SummaryTile
            icon={<IconClose />}
            label="Kelmaganlar"
            value={absent}
            tone="bad"
            note={rows.length - attMarked > 0 ? `${rows.length - attMarked} ta belgilanmagan` : undefined}
          />
          <SummaryTile
            icon={<IconTask />}
            label="Vazifalar tekshiruvi"
            value={hasHwWork && hwTarget > 0 ? `${hwGraded}/${hwTarget}` : "—"}
            tone="neutral"
            note={hasHwWork && hwTarget > 0 ? "baholandi" : "Tekshiriladigan vazifa yo'q"}
            meter={hasHwWork ? { value: hwGraded, max: hwTarget } : undefined}
          />
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
              <span>Vazifa holati</span>
              <span>Tanga</span>
              <span className="roster__act-head">Amallar</span>
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

      {group && (
        <DailyReportCard
          key={`${group.id}|${date}`}
          pageDate={date}
          dates={englishLessonDates(group.id, allStudents, allLessons, plans, hw.tasks, transfersByStudent, today)}
          build={(d) =>
            buildEnglishDaily({
              group,
              date: d,
              students: allStudents,
              lessons: allLessons,
              plans,
              tasks: hw.tasks,
              assignedSet: hw.assignedSet,
              assessMap: hw.assessMap,
              coinEvents: hw.coinEvents,
              transfersByStudent,
              generatedOn: today,
            })
          }
        />
      )}

      {group && <HomeworkDrawer student={drawerFor} group={group} date={date} legacy={drawerFor ? (rows.find((r) => r.student.id === drawerFor.id)?.existing?.homework ?? null) : null} tasks={dayTasks} onClose={() => setDrawerFor(null)} />}
    </>
  );
}
