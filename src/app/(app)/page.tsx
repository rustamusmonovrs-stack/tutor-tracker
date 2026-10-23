"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { COINS, RESULT_META, RESULT_ORDER, STUCK_AFTER } from "@/lib/config";
import { useData } from "@/lib/data";
import { addDays, formatDay, todayISO, weekStart } from "@/lib/dates";
import { currentTopic, repeatCount } from "@/lib/progress";
import { buildStandings, scoreLessons } from "@/lib/scoring";
import type { Lesson, LessonResult, Student, Topic } from "@/lib/types";

interface RowModel {
  student: Student;
  existing: Lesson | undefined;
  planned: Topic | null;
  title: string;
  position: number | null;
  repeats: number;
  weekCoins: number;
  dayCoins: number | null;
}

export default function TodayPage() {
  const data = useData();
  const { activeGroups, activeStudents, lessonsByStudent, topicsByStudent, markLesson, clearLesson, notify, isSaving } = data;

  const today = todayISO();
  const [date, setDate] = useState(today);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const group = activeGroups.find((g) => g.id === groupId) ?? activeGroups[0] ?? null;
  const roster = useMemo(
    () =>
      group
        ? activeStudents.filter((s) => s.group_id === group.id).sort((a, b) => a.name.localeCompare(b.name))
        : [],
    [activeStudents, group],
  );

  const weekCoins = useMemo(() => {
    const from = weekStart(date);
    const standings = buildStandings(activeStudents, [...lessonsByStudent.values()].flat(), {
      from,
      to: addDays(from, 6),
    });
    return new Map(standings.map((s) => [s.student.id, s.coins]));
  }, [activeStudents, lessonsByStudent, date]);

  const rows: RowModel[] = roster.map((student) => {
    const lessons = lessonsByStudent.get(student.id) ?? [];
    const topics = topicsByStudent.get(student.id) ?? [];
    const existing = lessons.find((l) => l.lesson_date === date);
    const before = lessons.filter((l) => l.lesson_date < date);
    const planned = currentTopic(topics, before);
    const override = custom[`${student.id}:${date}`];
    const title = existing?.topic_title ?? override ?? planned?.title ?? "";
    const linked = existing?.topic_id ?? (override ? null : planned?.id ?? null);
    const position = topics.find((t) => t.id === linked)?.position ?? null;
    const dayCoins = existing
      ? (scoreLessons(lessons).find((s) => s.lesson.id === existing.id)?.coins ?? null)
      : null;
    return {
      student,
      existing,
      planned,
      title,
      position,
      repeats: existing ? 0 : repeatCount(planned, before),
      weekCoins: weekCoins.get(student.id) ?? 0,
      dayCoins,
    };
  });

  const marked = rows.filter((r) => r.existing).length;

  async function onMark(row: RowModel, result: LessonResult) {
    const { student, existing, planned } = row;
    const lessons = lessonsByStudent.get(student.id) ?? [];

    // Tapping the active result again removes the mark (with Undo).
    if (existing && existing.result === result) {
      const previous = existing;
      if (await clearLesson(existing)) {
        notify(`${student.name}: belgi olib tashlandi`, {
          action: {
            label: "Undo",
            run: () =>
              void markLesson({
                student,
                date,
                result: previous.result,
                topicId: previous.topic_id,
                topicTitle: previous.topic_title,
              }),
          },
        });
      }
      return;
    }

    const override = custom[`${student.id}:${date}`];
    let topicId: string | null;
    let topicTitle: string;
    if (existing) {
      topicId = existing.topic_id;
      topicTitle = existing.topic_title;
    } else if (override && override !== planned?.title) {
      topicId = null;
      topicTitle = override;
    } else if (planned) {
      topicId = planned.id;
      topicTitle = planned.title;
    } else {
      topicId = null;
      topicTitle = "Mavzu kiritilmagan";
    }

    // Preview the coins (including a streak bonus) before saving, for the confirmation toast.
    const draftLesson: Lesson = {
      id: existing?.id ?? "draft",
      student_id: student.id,
      topic_id: topicId,
      topic_title: topicTitle,
      lesson_date: date,
      result,
      created_at: existing?.created_at ?? new Date().toISOString(),
    };
    const next = existing ? lessons.map((l) => (l.id === existing.id ? draftLesson : l)) : [...lessons, draftLesson];
    const scored = scoreLessons(next).find((s) => s.lesson === draftLesson);

    const ok = await markLesson({ student, date, result, topicId, topicTitle });
    if (ok) {
      const coins = scored?.coins ?? COINS[result];
      const bonus = scored && scored.bonus > 0 ? " (streak bonus!)" : "";
      notify(
        coins > 0
          ? `${student.name}: +${coins}${bonus}`
          : `${student.name}: ${RESULT_META[result].label}`,
      );
    }
  }

  function startEdit(row: RowModel) {
    setEditing(row.student.id);
    setDraft(row.title);
  }

  async function saveTopic(e: FormEvent, row: RowModel) {
    e.preventDefault();
    const title = draft.trim();
    setEditing(null);
    if (!title || title === row.title) return;
    const { student, existing, planned } = row;
    if (existing) {
      await markLesson({
        student,
        date,
        result: existing.result,
        topicId: planned && title === planned.title ? planned.id : null,
        topicTitle: title,
      });
    } else {
      setCustom((c) => ({ ...c, [`${student.id}:${date}`]: title }));
    }
  }

  if (!activeGroups.length) {
    return (
      <>
        <PageHead title="Today" sub="Start by creating a group" />
        <div className="sheet empty">
          <strong>No groups yet</strong>
          <p>Create your groups and add students, then lessons are one tap each.</p>
          <p style={{ marginTop: 14 }}>
            <Link className="btn btn--primary" href="/students">
              Set up groups
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
          <h1 className="page-title">{date === today ? "Today" : formatDay(date)}</h1>
          <p className="page-sub">
            {date === today ? formatDay(date) : "Past lesson"}
            {rows.length > 0 && ` · ${marked}/${rows.length} marked`}
          </p>
        </div>
        <div className="day-nav">
          <button className="icon-btn" aria-label="Previous day" onClick={() => setDate(addDays(date, -1))}>
            ‹
          </button>
          <button
            className="btn btn--quiet btn--sm"
            onClick={() => setDate(today)}
            disabled={date === today}
            aria-label="Go to today"
          >
            Today
          </button>
          <button
            className="icon-btn"
            aria-label="Next day"
            disabled={date >= today}
            onClick={() => setDate(addDays(date, 1))}
          >
            ›
          </button>
        </div>
      </div>

      <div className="seg" role="tablist" aria-label="Groups">
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

      <div className="sheet" style={{ marginTop: 14 }}>
        {rows.length === 0 ? (
          <div className="empty">
            <strong>No students in {group?.name}</strong>
            <Link href="/students">Add students</Link>
          </div>
        ) : (
          <ul className="roster">
            {rows.map((row) => {
              const busy = isSaving(row.student.id);
              const stuck = row.repeats >= STUCK_AFTER;
              return (
                <li className="student" key={row.student.id}>
                  <div className="student__head">
                    <Link href={`/students/${row.student.id}`} className="student__name" style={{ color: "inherit", textDecoration: "none" }}>
                      {row.student.name}
                    </Link>
                    <span style={{ display: "flex", gap: 6 }}>
                      {row.dayCoins !== null && row.dayCoins > 0 && (
                        <span className="coins coins--day" title="Coins for this lesson">
                          +{row.dayCoins}
                        </span>
                      )}
                      <span className="coins" title="Coins this week">
                        {row.weekCoins}
                      </span>
                    </span>
                  </div>

                  {editing === row.student.id ? (
                    <form className="topic-edit form-row" onSubmit={(e) => void saveTopic(e, row)}>
                      <input
                        className="input"
                        value={draft}
                        autoFocus
                        aria-label={`Topic for ${row.student.name}`}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => e.key === "Escape" && setEditing(null)}
                      />
                      <button className="btn btn--primary btn--sm" type="submit">
                        Save
                      </button>
                    </form>
                  ) : (
                    <button className="topic" onClick={() => startEdit(row)} aria-label={`Change topic for ${row.student.name}`}>
                      <span className="topic__title">
                        {row.title || "Reja tugadi: mavzu qo'shing yoki shu yerda yozing"}
                      </span>
                      <span className={`topic__meta${stuck ? " topic__meta--warn" : ""}`}>
                        {row.position ? `Topic ${row.position}` : row.title ? "Off-plan" : "No topic planned"}
                        {row.repeats > 0 && ` · repeated ${row.repeats}×`}
                      </span>
                    </button>
                  )}

                  <div className="results" role="group" aria-label={`Result for ${row.student.name}`}>
                    {RESULT_ORDER.map((r) => (
                      <button
                        key={r}
                        className={`res res--${r}`}
                        aria-pressed={row.existing?.result === r}
                        disabled={busy}
                        onClick={() => void onMark(row, r)}
                      >
                        <span>{RESULT_META[r].label}</span>
                        {COINS[r] > 0 && <span className="res__pts">+{COINS[r]}</span>}
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}

function PageHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="page-head">
      <div>
        <h1 className="page-title">{title}</h1>
        {sub && <p className="page-sub">{sub}</p>}
      </div>
    </div>
  );
}
