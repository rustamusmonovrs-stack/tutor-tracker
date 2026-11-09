import { addDays, weekStart } from "./dates";
import type { Assessment, Assignment, HwTask } from "./homework";
import type { Lesson } from "./types";

/**
 * Homework statistics for Ingliz tili → Statistika: ONE item list feeds both the weekly chart and the summary card,
 * so the two can never disagree. Read-only: nothing is written, coins are not touched.
 *
 * Two sources are combined:
 *  - Smart Homework (student_task_assessments): one item per assessed student × task. Each assessment is counted
 *    once (keyed by task + student), so re-grading a task replaces its status instead of adding a second item.
 *  - Old per-lesson grade (lessons.homework): one item per graded lesson. It is skipped when the same student already
 *    has Smart Homework results checked on that date, so a lesson is never counted twice.
 *
 * Date of an item = the lesson where the work is checked:
 *  - Smart Homework: the stored checking date (due_date) when it is after the given date ("Oldin berilgan vazifa"),
 *    otherwise the lesson the task was entered under (lesson_date). The same rule Bugun uses to list a lesson's tasks.
 *    The time the grade was clicked (graded_at) and the coin date (rewarded_on) are not used here.
 *  - Old grade: the lesson date.
 */

export type HwStatus = "full" | "partial" | "not_done";

export interface HwItem {
  date: string;
  studentId: string;
  /** null = assigned, checking date reached, not graded yet. */
  status: HwStatus | null;
  source: "smart" | "legacy";
}

export interface HwCounts {
  full: number;
  partial: number;
  notDone: number;
  /** full + partial + notDone */
  graded: number;
  /** Assigned Smart Homework whose checking date has come, without a grade. */
  pending: number;
}

export interface HwWeek extends HwCounts {
  start: string;
  end: string;
}

export interface HwStatsInput {
  studentIds: ReadonlySet<string>;
  lessons: readonly Lesson[];
  tasks: readonly HwTask[];
  assignments: readonly Assignment[];
  assessments: ReadonlyMap<string, Assessment>;
  from: string;
  to: string;
}

export const checkDate = (t: Pick<HwTask, "lesson_date" | "due_date">): string =>
  t.due_date && t.due_date > t.lesson_date ? t.due_date : t.lesson_date;

const empty = (): HwCounts => ({ full: 0, partial: 0, notDone: 0, graded: 0, pending: 0 });

function add(c: HwCounts, s: HwStatus | null) {
  if (s === null) c.pending += 1;
  else {
    c.graded += 1;
    if (s === "full") c.full += 1;
    else if (s === "partial") c.partial += 1;
    else c.notDone += 1;
  }
}

export function homeworkItems(i: HwStatsInput): HwItem[] {
  const inRange = (d: string) => d >= i.from && d <= i.to;
  const taskById = new Map(i.tasks.map((t) => [t.id, t]));
  const items: HwItem[] = [];
  const smartDays = new Set<string>(); // `${student}|${date}` with Smart Homework grades

  // Graded Smart Homework (archived tasks included: their grades and coins still exist).
  for (const a of i.assessments.values()) {
    if (!i.studentIds.has(a.student_id)) continue;
    const t = taskById.get(a.task_id);
    if (!t) continue;
    const date = checkDate(t);
    if (!inRange(date)) continue;
    items.push({ date, studentId: a.student_id, status: a.status, source: "smart" });
    smartDays.add(`${a.student_id}|${date}`);
  }

  // Assigned, due, not graded yet (archived tasks without a grade are no longer expected).
  const seen = new Set<string>();
  for (const a of i.assignments) {
    const key = `${a.task_id}|${a.student_id}`;
    if (seen.has(key) || i.assessments.has(key) || !i.studentIds.has(a.student_id)) continue;
    seen.add(key);
    const t = taskById.get(a.task_id);
    if (!t || t.archived_at) continue;
    const date = checkDate(t);
    if (!inRange(date)) continue;
    items.push({ date, studentId: a.student_id, status: null, source: "smart" });
  }

  // Old per-lesson grade, unless that student-day already has Smart Homework grades.
  for (const l of i.lessons) {
    if (!l.homework || !i.studentIds.has(l.student_id) || !inRange(l.lesson_date)) continue;
    if (smartDays.has(`${l.student_id}|${l.lesson_date}`)) continue;
    items.push({ date: l.lesson_date, studentId: l.student_id, status: l.homework, source: "legacy" });
  }
  return items;
}

export function summarizeItems(items: readonly HwItem[]): HwCounts {
  const c = empty();
  for (const it of items) add(c, it.status);
  return c;
}

/** Monday-based calendar weeks (date strings, no timezone math) from the week of `from` to the week of `to`. */
export function homeworkWeeks(items: readonly HwItem[], from: string, to: string): HwWeek[] {
  const weeks: HwWeek[] = [];
  for (let w = weekStart(from); w <= to; w = addDays(w, 7)) weeks.push({ start: w, end: addDays(w, 6), ...empty() });
  const byStart = new Map(weeks.map((w) => [w.start, w]));
  for (const it of items) {
    const w = byStart.get(weekStart(it.date));
    if (w) add(w, it.status);
  }
  return weeks;
}
