import type { Homework, Student } from "./types";

/** Per-task result. `Berilmagan` (not assigned) and `Baholanmagan` (assigned, not graded) have no stored value. */
export type TaskStatus = Homework; // full | partial | not_done

export interface HwTask {
  id: string;
  group_id: string;
  lesson_date: string;
  title: string;
  due_date: string | null;
  position: number;
  archived_at: string | null;
  created_at: string;
}

export interface Assignment {
  task_id: string;
  student_id: string;
  assigned_at: string;
}

export interface Assessment {
  task_id: string;
  student_id: string;
  status: TaskStatus;
  coins: number;
  graded_at: string;
  rewarded_on: string | null;
  completed_late: boolean;
  original_status: "partial" | "not_done" | null;
  original_graded_at: string | null;
}

export interface WatchCase {
  id: string;
  student_id: string;
  group_id: string;
  status: "active" | "resolved";
  task_ids: string[];
  opened_at: string;
  last_activity_on: string;
  resolved_at: string | null;
  resolve_reason: "completed" | "corrected" | null;
}

export interface WatchNote {
  id: string;
  student_id: string;
  author_id: string;
  body: string;
  created_at: string;
}

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  full: "To'liq",
  partial: "Chala",
  not_done: "Qilmadi",
};

/** A coin event for the existing ranking: derived from assessments, never stored as a balance. */
export interface CoinEvent {
  student_id: string;
  date: string; // rewarded_on
  coins: number;
}

export function taskCoinEvents(assessments: Assessment[]): CoinEvent[] {
  const out: CoinEvent[] = [];
  for (const a of assessments) {
    if (a.status === "full" && a.rewarded_on) out.push({ student_id: a.student_id, date: a.rewarded_on, coins: 1 });
  }
  return out;
}

export type ProgressTone = "none" | "pending" | "ok" | "warn" | "bad";

export interface Progress {
  assigned: number;
  graded: number;
  full: number;
  partial: number;
  notDone: number;
  ungraded: number;
  coins: number;
  tone: ProgressTone;
}

/**
 * Progress of one student on a set of tasks. Tasks the student is not assigned to are excluded from the
 * denominator. Red only when every assigned task is graded and none was done; anything not fully graded is neutral.
 */
export function studentProgress(
  taskIds: string[],
  studentId: string,
  assigned: Set<string>,
  assess: Map<string, Assessment>,
): Progress {
  let a = 0, g = 0, f = 0, p = 0, n = 0;
  for (const id of taskIds) {
    if (!assigned.has(`${id}|${studentId}`)) continue;
    a += 1;
    const s = assess.get(`${id}|${studentId}`)?.status;
    if (!s) continue;
    g += 1;
    if (s === "full") f += 1;
    else if (s === "partial") p += 1;
    else n += 1;
  }
  let tone: ProgressTone;
  if (a === 0) tone = "none";
  else if (g < a) tone = "pending";
  else if (f === a) tone = "ok";
  else if (n === a) tone = "bad";
  else tone = "warn";
  return { assigned: a, graded: g, full: f, partial: p, notDone: n, ungraded: a - g, coins: f, tone };
}

// ---------------------------------------------------------------------------------------------
// Watch rule (pure mirror of public.recompute_watch in 20261028_smart_homework.sql).

export interface WatchInput {
  student: Pick<Student, "id" | "group_id">;
  today: string;
  tasks: HwTask[];
  assignments: Assignment[];
  assessments: Assessment[];
  /** Dates on which this student was marked absent. */
  absentDates: Set<string>;
  /** Mock exam dates of the student's group. */
  mockDates: Set<string>;
}

/**
 * Trailing run of "missed" lessons. A lesson is missed when every counted task is graded and every one is Qilmadi.
 * Ungraded work, absence, mock days and lessons without tasks are neutral (skipped); a lesson with any To'liq/Chala ends the run.
 */
export function missedRun(i: WatchInput): { lessons: number; taskIds: string[] } {
  const asg = new Set(i.assignments.filter((a) => a.student_id === i.student.id).map((a) => a.task_id));
  const ass = new Map(i.assessments.filter((a) => a.student_id === i.student.id).map((a) => [a.task_id, a.status]));
  const byDate = new Map<string, { n: number; graded: number; nd: string[] }>();
  for (const t of i.tasks) {
    if (t.group_id !== i.student.group_id || !asg.has(t.id)) continue;
    const st = ass.get(t.id);
    const counted = st !== undefined || (t.archived_at === null && (t.due_date === null || t.due_date <= i.today));
    if (!counted || (t.archived_at !== null && st === undefined)) continue;
    if (i.absentDates.has(t.lesson_date) || i.mockDates.has(t.lesson_date)) continue;
    const row = byDate.get(t.lesson_date) ?? { n: 0, graded: 0, nd: [] };
    row.n += 1;
    if (st !== undefined) row.graded += 1;
    if (st === "not_done") row.nd.push(t.id);
    byDate.set(t.lesson_date, row);
  }
  let lessons = 0;
  const taskIds: string[] = [];
  for (const d of [...byDate.keys()].sort().reverse()) {
    const r = byDate.get(d)!;
    if (r.graded < r.n) continue;
    if (r.nd.length === r.n) {
      lessons += 1;
      taskIds.push(...r.nd);
    } else break;
  }
  return { lessons, taskIds };
}

export type WatchAction =
  | { kind: "none" }
  | { kind: "open"; taskIds: string[] }
  | { kind: "update"; taskIds: string[] }
  | { kind: "resolve"; taskIds: string[]; reason: "completed" | "corrected" };

/** What to do with the student's active case (or lack of one) after the run is recomputed. */
export function evaluateWatch(
  active: Pick<WatchCase, "task_ids"> | null,
  run: { lessons: number; taskIds: string[] },
  assessments: Assessment[],
  studentId: string,
): WatchAction {
  if (!active) return run.lessons >= 2 ? { kind: "open", taskIds: run.taskIds } : { kind: "none" };
  const ids = [...new Set([...active.task_ids, ...run.taskIds])];
  const mine = assessments.filter((a) => a.student_id === studentId && ids.includes(a.task_id));
  const full = mine.filter((a) => a.status === "full").length;
  if (mine.length === 0) return { kind: "resolve", taskIds: ids, reason: "corrected" };
  if (full === mine.length) return { kind: "resolve", taskIds: ids, reason: "completed" };
  const same = ids.length === active.task_ids.length && ids.every((x) => active.task_ids.includes(x));
  return same ? { kind: "none" } : { kind: "update", taskIds: ids };
}

// ---------------------------------------------------------------------------------------------
// Which tasks are checked in a lesson (Bugun → "Berilgan vazifalar").
//
// Stored dates: `lesson_date` = the lesson the task was given/entered under, `due_date` = optional deadline, which
// the journal treats as the checking date. Nothing is inferred: a task entered earlier belongs to this lesson only
// when its stored `due_date` is this lesson's date. Tasks entered at this lesson always belong to it.

/** Active tasks checked in the lesson of `date`: earlier-given ones due on `date` first, then those entered at this lesson. */
export function lessonCheckTasks(tasks: HwTask[], groupId: string, date: string): HwTask[] {
  return tasks
    .filter((t) => t.group_id === groupId && !t.archived_at && (t.lesson_date === date || (t.lesson_date < date && t.due_date === date)))
    .sort(
      (a, b) =>
        (a.lesson_date < b.lesson_date ? -1 : a.lesson_date > b.lesson_date ? 1 : 0) ||
        a.position - b.position ||
        (a.created_at < b.created_at ? -1 : 1),
    );
}

export interface TaskCounts {
  /** Students of the roster this task is assigned to. */
  assigned: number;
  /** Of those, how many have a grade (To'liq / Chala / Qilmadi). */
  graded: number;
  /** Assigned but not graded yet. */
  pending: number;
}

/** Per-task counts over the given students only. Unassigned students are in neither number. */
export function taskCounts(taskId: string, studentIds: string[], assigned: Set<string>, assess: Map<string, Assessment>): TaskCounts {
  let a = 0;
  let g = 0;
  for (const s of studentIds) {
    if (!assigned.has(`${taskId}|${s}`)) continue;
    a += 1;
    if (assess.has(`${taskId}|${s}`)) g += 1;
  }
  return { assigned: a, graded: g, pending: a - g };
}

/**
 * Tasks entered at an earlier lesson that still have ungraded assigned students and are not already checked in this
 * lesson. The teacher may pull one into this lesson explicitly (its due date becomes this lesson's date); nothing is
 * moved automatically. Most recently given first.
 */
export function earlierOpenTasks(
  tasks: HwTask[],
  groupId: string,
  date: string,
  studentIds: string[],
  assigned: Set<string>,
  assess: Map<string, Assessment>,
): HwTask[] {
  return tasks
    .filter(
      (t) =>
        t.group_id === groupId &&
        !t.archived_at &&
        t.lesson_date < date &&
        t.due_date !== date &&
        taskCounts(t.id, studentIds, assigned, assess).pending > 0,
    )
    .sort((a, b) => (a.lesson_date < b.lesson_date ? 1 : a.lesson_date > b.lesson_date ? -1 : a.position - b.position));
}
