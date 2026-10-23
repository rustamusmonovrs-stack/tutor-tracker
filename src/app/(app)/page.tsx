"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { IconChevronLeft, IconChevronRight, IconCoin, IconCopy, IconHistory, IconPresent, IconTask } from "@/components/icons";
import { AttendanceMarks, HomeworkMarks, Meter, SaveChip } from "@/components/ui";
import { useData } from "@/lib/data";
import { addDays, formatDay, formatShort, todayISO, weekStart } from "@/lib/dates";
import { currentTopic } from "@/lib/progress";
import { scoreLessons } from "@/lib/scoring";
import type { Attendance, Homework, Student } from "@/lib/types";

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

  // ---- group homework (stored in Supabase, autosaved) ---------------------
  const plan = plans.find((p) => p.group_id === group?.id && p.lesson_date === date);
  const [draft, setDraft] = useState(plan?.homework ?? "");
  const pending = useRef<{ groupId: string; date: string; text: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savePlanRef = useRef(savePlan);
  useEffect(() => {
    savePlanRef.current = savePlan;
  });

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const p = pending.current;
    pending.current = null;
    if (p) void savePlanRef.current(p.groupId, p.date, p.text);
  }, []);

  const groupKey = group?.id ?? "";
  useEffect(() => {
    // Switching group or day: save what was typed, then show the stored text for the new one.
    const stored = plans.find((p) => p.group_id === groupKey && p.lesson_date === date)?.homework ?? "";
    setDraft(stored);
    return () => flush();
    // `plans` is intentionally not a dependency: remote updates must not overwrite what is being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupKey, date, flush]);

  function onDraft(text: string) {
    setDraft(text);
    if (!group) return;
    pending.current = { groupId: group.id, date, text };
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

  const rows = roster.map((student) => {
    const lessons = lessonsByStudent.get(student.id) ?? [];
    const existing = lessons.find((l) => l.lesson_date === date);
    const scored = scoredByStudent.get(student.id) ?? [];
    const dayCoins = existing ? (scored.find((s) => s.lesson.id === existing.id)?.coins ?? 0) : 0;
    const weekCoins = scored
      .filter((s) => s.lesson.lesson_date >= weekFrom && s.lesson.lesson_date <= weekTo)
      .reduce((sum, s) => sum + s.coins, 0);
    const topics = topicsByStudent.get(student.id) ?? [];
    const planned = topics.length ? currentTopic(topics, lessons.filter((l) => l.lesson_date < date)) : null;
    return { student, existing, dayCoins, weekCoins, planned };
  });

  const attMarked = rows.filter((r) => r.existing?.attendance).length;
  const hwGraded = rows.filter((r) => r.existing?.homework).length;
  const present = rows.filter((r) => r.existing?.attendance === "present").length;
  const hwTarget = Math.max(present, hwGraded);

  function createArgs(row: (typeof rows)[number]) {
    return {
      topicId: row.planned?.id ?? null,
      topicTitle: row.planned?.title ?? (draft.trim() ? draft.trim().slice(0, 200) : "Dars"),
    };
  }

  function setAttendance(row: (typeof rows)[number], value: Attendance | null) {
    void markLesson({ student: row.student, date, attendance: value, ...createArgs(row) });
  }
  function setHomework(row: (typeof rows)[number], value: Homework | null) {
    void markLesson({ student: row.student, date, homework: value, ...createArgs(row) });
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
              <IconTask aria-hidden /> Uy vazifasi
            </span>
            <span className="hint">Butun guruh uchun, avtomatik saqlanadi</span>
          </div>
          <textarea
            className="input"
            value={draft}
            rows={2}
            maxLength={1000}
            aria-label="Guruh uy vazifasi"
            placeholder="Masalan: 12-mashq, 45-bet"
            onChange={(e) => onDraft(e.target.value)}
            onBlur={flush}
          />
          {previousPlans.length > 0 && (
            <details className="plan__prev">
              <summary>
                <IconHistory aria-hidden /> Oldingi vazifalar
              </summary>
              <div className="plan__list">
                {previousPlans.map((p) => (
                  <div className="plan__item" key={p.id}>
                    <time>{formatShort(p.lesson_date)}</time>
                    <span>{p.homework}</span>
                    <button className="btn btn--ghost btn--sm" onClick={() => onDraft(p.homework)} title="Bugungi vazifaga nusxalash">
                      <IconCopy aria-hidden /> Nusxa
                    </button>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
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
            <div className="roster__head" aria-hidden={false}>
              <span>O&apos;quvchi</span>
              <span>Hafta</span>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                Davomat
                {unmarked.length > 0 && (
                  <button
                    className="btn btn--sm"
                    style={{ height: 24 }}
                    onClick={() => void markAttendanceBulk(unmarked, date, "present")}
                    title="Belgilanmaganlarni Keldi deb belgilash"
                  >
                    <IconPresent aria-hidden /> Hammasi keldi
                  </button>
                )}
              </span>
              <span>Uy vazifasi</span>
            </div>
            <ul className="roster">
              {rows.map((row) => {
                const busy = isSaving(row.student.id);
                const att = row.existing?.attendance ?? null;
                const hw = row.existing?.homework ?? null;
                return (
                  <li className="student" key={row.student.id}>
                    <div className="student__top">
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
                    </div>
                    <div className="student__marks">
                      <AttendanceMarks name={row.student.name} value={att} disabled={busy} onChange={(v) => setAttendance(row, v)} />
                      <HomeworkMarks
                        name={row.student.name}
                        value={hw}
                        muted={att === "absent" && !hw}
                        disabled={busy}
                        onChange={(v) => setHomework(row, v)}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </>
  );
}
