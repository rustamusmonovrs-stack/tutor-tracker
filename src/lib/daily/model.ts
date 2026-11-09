import { mean, pct } from "../subjects/report";

/**
 * Daily journal report: ONE normalized dataset for Ingliz tili, Matematika and Tarix.
 * The PDF and the HTML export both render a view built from this model (see view.ts), so every figure comes
 * from one calculation. Everything here is a pure, read-only function of data the app already loaded:
 * nothing is written, no coins are recalculated.
 */

export type DailySubject = "english" | "math" | "history";

export const DAILY_SUBJECT_LABEL: Record<DailySubject, string> = {
  english: "Ingliz tili",
  math: "Matematika",
  history: "Tarix",
};

export const REPORT_TEACHER = "Rustam Usmonov";

export type DailyAttendance = "present" | "absent" | null;

/** English Smart Homework: one student's state for one task. */
export type TaskCell = "full" | "partial" | "not_done" | "ungraded" | "unassigned";

/** Overall English homework state of one student for the day (only tasks assigned to THIS student count). */
export type SmartOverall = "none" | "ungraded" | "pending" | "full" | "partial" | "not_done";

export type DailyHomework =
  | {
      /** Matematika / Tarix. null = not entered. */
      kind: "simple";
      status: "submitted" | "not_submitted" | "unchecked" | null;
    }
  | {
      /** English Smart Homework. */
      kind: "smart";
      assigned: number;
      graded: number;
      full: number;
      partial: number;
      notDone: number;
      overall: SmartOverall;
      /** One entry per task of the day, in the day's task order. */
      tasks: TaskCell[];
      /** Old per-lesson grade, shown only when the student has no assigned tasks. */
      legacy: "full" | "partial" | "not_done" | null;
    };

export interface DailyRow {
  studentId: string;
  name: string;
  attendance: DailyAttendance;
  homework: DailyHomework;
  /** null = not entered (never the same as 0). Only meaningful when the report has a test. */
  score: number | null;
  /** English only: coins of this day exactly as the existing Bugun page shows them. null for other subjects. */
  coins: number | null;
}

export interface DailyTask {
  id: string;
  title: string;
  /** The lesson the task was given/entered under (earlier than the report date for "Oldin berilgan vazifa"). */
  given: string;
  due: string | null;
  /** Archived after being graded: kept in the report because its assessments (and coins) still exist. */
  archived: boolean;
}

export interface DailyTest {
  title: string | null;
  max: number;
}

export type DailyHomeworkSummary =
  | {
      kind: "simple";
      submitted: number;
      notSubmitted: number;
      unchecked: number;
      notEntered: number;
      /** submitted / (submitted + notSubmitted); null when nobody was assessed. */
      pct: number | null;
    }
  | {
      kind: "smart";
      /** Students by overall state. */
      full: number;
      partial: number;
      notDone: number;
      pending: number;
      ungraded: number;
      none: number;
      /** Task slots (student x assigned task). */
      slotsAssigned: number;
      slotsGraded: number;
      slotsFull: number;
      slotsUngraded: number;
      /** slotsFull / slotsGraded; null when nothing was graded. */
      pct: number | null;
    };

export interface DailyTestSummary {
  max: number;
  entered: number;
  missing: number;
  /** Real zero scores. */
  zeros: number;
  avgScore: number | null;
  avgPct: number | null;
  highest: number | null;
  lowest: number | null;
}

export interface DailySummary {
  students: number;
  present: number;
  absent: number;
  unmarked: number;
  /** present / (present + absent): unmarked attendance is NOT counted as absence. */
  attendancePct: number | null;
  homework: DailyHomeworkSummary;
  test: DailyTestSummary | null;
  coins: number | null;
}

export interface DailyReport {
  subject: DailySubject;
  groupId: string;
  groupName: string;
  date: string; // YYYY-MM-DD
  topic: string | null;
  /** Free-text homework of the lesson (Matematika / Tarix). */
  homeworkText: string | null;
  /** Anything recorded for this group on this date (lesson row, plan, tasks, student records). */
  hasData: boolean;
  /** The report date is before the day the report was generated (roster is reconstructed from history). */
  historical: boolean;
  homeworkMode: "simple" | "smart";
  tasks: DailyTask[];
  test: DailyTest | null;
  rows: DailyRow[];
  summary: DailySummary;
  generatedOn: string;
}

/**
 * Historical roster rule (the data model has no membership history, so this is the closest honest answer):
 * a student belongs to the report if they have any record for that day, or if they existed on that day
 * (created on/before it) and were not archived on/before it.
 */
export function inDailyRoster(
  student: { created_at: string; archived_at: string | null },
  date: string,
  hasRecordThatDay: boolean,
  dayOf: (iso: string) => string,
): boolean {
  if (hasRecordThatDay) return true;
  const created = Number.isNaN(Date.parse(student.created_at)) ? null : dayOf(student.created_at);
  if (created !== null && created > date) return false;
  if (student.archived_at) {
    const archived = Number.isNaN(Date.parse(student.archived_at)) ? null : dayOf(student.archived_at);
    if (archived === null || archived <= date) return false;
  }
  return true;
}

export function summarizeDaily(
  rows: DailyRow[],
  mode: "simple" | "smart",
  test: DailyTest | null,
  includeCoins: boolean,
): DailySummary {
  const present = rows.filter((r) => r.attendance === "present").length;
  const absent = rows.filter((r) => r.attendance === "absent").length;

  let homework: DailyHomeworkSummary;
  if (mode === "simple") {
    const s = { submitted: 0, notSubmitted: 0, unchecked: 0, notEntered: 0 };
    for (const r of rows) {
      const h = r.homework;
      if (h.kind !== "simple") continue;
      if (h.status === "submitted") s.submitted += 1;
      else if (h.status === "not_submitted") s.notSubmitted += 1;
      else if (h.status === "unchecked") s.unchecked += 1;
      else s.notEntered += 1;
    }
    homework = { kind: "simple", ...s, pct: pct(s.submitted, s.submitted + s.notSubmitted) };
  } else {
    const s = { full: 0, partial: 0, notDone: 0, pending: 0, ungraded: 0, none: 0, slotsAssigned: 0, slotsGraded: 0, slotsFull: 0 };
    for (const r of rows) {
      const h = r.homework;
      if (h.kind !== "smart") continue;
      s.slotsAssigned += h.assigned;
      s.slotsGraded += h.graded;
      s.slotsFull += h.full;
      if (h.overall === "full") s.full += 1;
      else if (h.overall === "partial") s.partial += 1;
      else if (h.overall === "not_done") s.notDone += 1;
      else if (h.overall === "pending") s.pending += 1;
      else if (h.overall === "ungraded") s.ungraded += 1;
      else s.none += 1;
    }
    homework = { kind: "smart", ...s, slotsUngraded: s.slotsAssigned - s.slotsGraded, pct: pct(s.slotsFull, s.slotsGraded) };
  }

  let testSummary: DailyTestSummary | null = null;
  if (test) {
    const entered = rows.map((r) => r.score).filter((v): v is number => v !== null);
    testSummary = {
      max: test.max,
      entered: entered.length,
      missing: rows.length - entered.length,
      zeros: entered.filter((v) => v === 0).length,
      avgScore: mean(entered),
      avgPct: mean(entered.map((v) => (v / test.max) * 100)),
      highest: entered.length ? Math.max(...entered) : null,
      lowest: entered.length ? Math.min(...entered) : null,
    };
  }

  return {
    students: rows.length,
    present,
    absent,
    unmarked: rows.length - present - absent,
    attendancePct: pct(present, present + absent),
    homework,
    test: testSummary,
    coins: includeCoins ? rows.reduce((n, r) => n + (r.coins ?? 0), 0) : null,
  };
}
