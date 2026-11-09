import { todayISO } from "../dates";
import { scoreLessons } from "../scoring";
import type { Assessment, CoinEvent, HwTask } from "../homework";
import type { GroupTransfer } from "../stages";
import type { Group, Lesson, LessonPlan, Student } from "../types";
import type { SubjectGroup, SubjectKey, SubjectLesson, SubjectRecord, SubjectStudent } from "../subjects/types";
import {
  inDailyRoster,
  summarizeDaily,
  type DailyReport,
  type DailyRow,
  type DailyTask,
  type DailyTest,
  type SmartOverall,
  type TaskCell,
} from "./model";

/** Calendar day (Asia/Tashkent) of a stored timestamp. */
const dayOf = (iso: string) => todayISO(new Date(iso));

const clean = (s: string | null | undefined): string | null => {
  const t = (s ?? "").trim();
  return t === "" ? null : t;
};

// ---------------------------------------------------------------------------------------------
// Matematika / Tarix

export interface SubjectDailyInput {
  subject: SubjectKey;
  group: Pick<SubjectGroup, "id" | "name">;
  date: string;
  /** All students of the subject; the builder scopes them to the group itself. */
  students: SubjectStudent[];
  lessons: SubjectLesson[];
  records: SubjectRecord[];
  generatedOn: string;
}

/** Dates on which this group has a lesson row (what the teacher can pick in the report card). */
export function subjectLessonDates(subject: SubjectKey, groupId: string, lessons: SubjectLesson[]): string[] {
  return [...new Set(lessons.filter((l) => l.subject === subject && l.group_id === groupId).map((l) => l.lesson_date))].sort().reverse();
}

export function buildSubjectDaily(input: SubjectDailyInput): DailyReport {
  const { subject, group, date, generatedOn } = input;

  // Hard scoping: this subject + this group + this date, whatever the caller passed in.
  const lesson = input.lessons.find((l) => l.subject === subject && l.group_id === group.id && l.lesson_date === date) ?? null;
  const recs = lesson ? input.records.filter((r) => r.subject === subject && r.group_id === group.id && r.lesson_id === lesson.id) : [];
  const recOf = new Map(recs.map((r) => [r.student_id, r]));

  const roster = input.students
    .filter((s) => s.subject === subject && s.group_id === group.id && inDailyRoster(s, date, recOf.has(s.id), dayOf))
    .sort((a, b) => a.name.localeCompare(b.name, "uz"));

  // A disabled test (or one without a maximum) is not a recorded test: stored scores are kept but not reported.
  const test: DailyTest | null = lesson && lesson.has_test && lesson.test_max != null ? { title: clean(lesson.test_title), max: lesson.test_max } : null;

  const rows: DailyRow[] = roster.map((s) => {
    const r = recOf.get(s.id) ?? null;
    return {
      studentId: s.id,
      name: s.name,
      attendance: r?.attendance ?? null,
      homework: { kind: "simple", status: r?.homework ?? null },
      score: test ? (r?.score ?? null) : null,
      coins: null,
    };
  });

  return {
    subject,
    groupId: group.id,
    groupName: group.name,
    date,
    topic: clean(lesson?.topic),
    homeworkText: clean(lesson?.homework),
    hasData: lesson !== null || recs.length > 0,
    historical: date < generatedOn,
    homeworkMode: "simple",
    tasks: [],
    test,
    rows,
    summary: summarizeDaily(rows, "simple", test, false),
    generatedOn,
  };
}

// ---------------------------------------------------------------------------------------------
// Ingliz tili (existing Smart Homework + coin logic, read-only)

export interface EnglishDailyInput {
  group: Pick<Group, "id" | "name">;
  date: string;
  /** All students (archived included); the builder scopes them to the group itself. */
  students: Student[];
  /** All English lesson rows (full history: the streak bonus in coins needs it). */
  lessons: Lesson[];
  plans: LessonPlan[];
  /** All Smart Homework tasks of the group's days; the builder keeps the active ones of `date`. */
  tasks: HwTask[];
  /** `${taskId}|${studentId}` */
  assignedSet: Set<string>;
  assessMap: Map<string, Assessment>;
  coinEvents: CoinEvent[];
  /** Group changes per student (student_group_transfer_history): the only record of who was in which group when. */
  transfersByStudent: Map<string, GroupTransfer[]>;
  generatedOn: string;
}

/**
 * The group a student belonged to at the end of `date` (Asia/Tashkent), from the transfer history.
 * Day granularity: a transfer made on `date` counts as already moved. Returns null when the history says the
 * student was in a group that no longer exists (never guessed). With no history the current group is the answer.
 */
export function groupOnDate(currentGroupId: string, transfers: GroupTransfer[] | undefined, date: string): string | null {
  const sorted = [...(transfers ?? [])].sort((a, b) => a.transferred_at.localeCompare(b.transferred_at));
  let lastPast: GroupTransfer | null = null;
  for (const t of sorted) {
    if (dayOf(t.transferred_at) <= date) lastPast = t;
    else return lastPast ? lastPast.to_group_id : t.from_group_id; // first transfer after the date: where they were before it
  }
  return lastPast ? lastPast.to_group_id : currentGroupId;
}

export function englishLessonDates(
  groupId: string,
  students: Student[],
  lessons: Lesson[],
  plans: LessonPlan[],
  tasks: HwTask[],
  transfersByStudent: Map<string, GroupTransfer[]> = new Map(),
  /** Checking dates after this day (future deadlines) are not offered as report dates. */
  upTo?: string,
): string[] {
  const byId = new Map(students.map((s) => [s.id, s]));
  const dates = new Set<string>();
  for (const l of lessons) {
    const s = byId.get(l.student_id);
    if (s && groupOnDate(s.group_id, transfersByStudent.get(s.id), l.lesson_date) === groupId) dates.add(l.lesson_date);
  }
  for (const p of plans) if (p.group_id === groupId && (clean(p.topic) || clean(p.homework))) dates.add(p.lesson_date);
  for (const t of tasks) {
    if (t.group_id !== groupId || t.archived_at) continue;
    dates.add(t.lesson_date);
    // An earlier-given task is checked at the lesson of its stored checking date (Bugun → "Oldin berilgan vazifa").
    if (t.due_date && t.due_date > t.lesson_date && (!upTo || t.due_date <= upTo)) dates.add(t.due_date);
  }
  return [...dates].sort().reverse();
}

export function buildEnglishDaily(input: EnglishDailyInput): DailyReport {
  const { group, date, assignedSet, assessMap, generatedOn } = input;

  // Historical roster: who was in THIS group on THIS date (transfer history), not who is in it today.
  const groupStudents = input.students.filter((s) => groupOnDate(s.group_id, input.transfersByStudent.get(s.id), date) === group.id);
  const lessonsByStudent = new Map<string, Lesson[]>();
  for (const l of input.lessons) {
    const list = lessonsByStudent.get(l.student_id);
    if (list) list.push(l);
    else lessonsByStudent.set(l.student_id, [l]);
  }

  // The tasks CHECKED at this lesson, with the same rule as Bugun (lessonCheckTasks): tasks entered at this lesson,
  // plus earlier-given tasks whose stored checking date (due_date) is this lesson ("Oldin berilgan vazifa").
  // Active ones, plus archived ones that were graded (their assessments and coins still exist, so leaving them out
  // would make the report disagree with the coins). Never-graded archived tasks stay out.
  const gradedTaskIds = new Set([...assessMap.keys()].map((k) => k.split("|")[0]));
  const tasks = input.tasks
    .filter(
      (t) =>
        t.group_id === group.id &&
        (t.lesson_date === date || (t.lesson_date < date && t.due_date === date)) &&
        (!t.archived_at || gradedTaskIds.has(t.id)),
    )
    .sort(
      (a, b) =>
        (a.lesson_date < b.lesson_date ? -1 : a.lesson_date > b.lesson_date ? 1 : 0) ||
        a.position - b.position ||
        (a.created_at < b.created_at ? -1 : 1),
    );
  const taskIds = tasks.map((t) => t.id);
  const plan = input.plans.find((p) => p.group_id === group.id && p.lesson_date === date) ?? null;

  const lessonOf = (studentId: string) => (lessonsByStudent.get(studentId) ?? []).find((l) => l.lesson_date === date) ?? null;
  const touched = (studentId: string) => lessonOf(studentId) !== null || taskIds.some((id) => assignedSet.has(`${id}|${studentId}`));

  const roster = groupStudents.filter((s) => inDailyRoster(s, date, touched(s.id), dayOf)).sort((a, b) => a.name.localeCompare(b.name));

  const rows: DailyRow[] = roster.map((s) => {
    const mine = lessonsByStudent.get(s.id) ?? [];
    const existing = lessonOf(s.id);

    // Per-task state: only tasks actually assigned to this student are assessed.
    let assigned = 0, graded = 0, full = 0, partial = 0, notDone = 0;
    const cells: TaskCell[] = taskIds.map((id) => {
      if (!assignedSet.has(`${id}|${s.id}`)) return "unassigned";
      assigned += 1;
      const st = assessMap.get(`${id}|${s.id}`)?.status;
      if (!st) return "ungraded";
      graded += 1;
      if (st === "full") full += 1;
      else if (st === "partial") partial += 1;
      else notDone += 1;
      return st;
    });
    let overall: SmartOverall;
    if (assigned === 0) overall = "none";
    else if (graded === 0) overall = "ungraded";
    else if (graded < assigned) overall = "pending";
    else if (full === assigned) overall = "full";
    else if (notDone === assigned) overall = "not_done";
    else overall = "partial";

    // Coins of the day exactly as the Bugun page computes them (read-only; nothing is recalculated or stored):
    // the lesson's own coins from the derived scoring + Smart Homework coin events rewarded on this date.
    const scored = scoreLessons(mine);
    const lessonCoins = existing ? (scored.find((x) => x.lesson.id === existing.id)?.coins ?? 0) : 0;
    const taskCoins = input.coinEvents.filter((e) => e.student_id === s.id && e.date === date).reduce((n, e) => n + e.coins, 0);

    return {
      studentId: s.id,
      name: s.name,
      attendance: existing?.attendance ?? null,
      homework: { kind: "smart", assigned, graded, full, partial, notDone, overall, tasks: cells, legacy: existing?.homework ?? null },
      score: null,
      coins: lessonCoins + taskCoins,
    };
  });

  const dailyTasks: DailyTask[] = tasks.map((t) => ({ id: t.id, title: t.title, given: t.lesson_date, due: t.due_date, archived: t.archived_at !== null }));
  const anyLesson = groupStudents.some((s) => lessonOf(s.id) !== null);

  return {
    subject: "english",
    groupId: group.id,
    groupName: group.name,
    date,
    topic: clean(plan?.topic),
    homeworkText: clean(plan?.homework),
    historical: date < generatedOn,
    hasData: anyLesson || tasks.length > 0 || Boolean(clean(plan?.topic)) || Boolean(clean(plan?.homework)),
    homeworkMode: "smart",
    tasks: dailyTasks,
    test: null,
    rows,
    summary: summarizeDaily(rows, "smart", null, true),
    generatedOn,
  };
}
