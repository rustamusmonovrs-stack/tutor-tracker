import type {
  SubjectAttendance,
  SubjectGroup,
  SubjectHomework,
  SubjectKey,
  SubjectLesson,
  SubjectRecord,
  SubjectStudent,
} from "./types";

/**
 * The single source of truth for every figure shown on the Statistika / Test natijalari pages and
 * in the PDF and HTML exports. Renderers only format what this model contains.
 */

/** Percentage rounded to one decimal; null when the denominator is 0 ("no data", never 0%). */
export function pct(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return Math.round((part / whole) * 1000) / 10;
}

export function mean(values: number[]): number | null {
  if (!values.length) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

export interface ReportTest {
  lessonId: string;
  date: string;
  title: string | null;
  max: number;
}

export interface ReportStudentRow {
  studentId: string;
  name: string;
  /** Keyed by lesson date: null = not marked. */
  attendance: Record<string, SubjectAttendance | null>;
  homework: Record<string, SubjectHomework | null>;
  /** Keyed by lessonId of a test: null = score not entered (NOT zero). */
  scores: Record<string, number | null>;
  present: number;
  absent: number;
  attendancePct: number | null;
  submitted: number;
  notSubmitted: number;
  homeworkPct: number | null;
  testsTaken: number;
  avgTestPct: number | null;
}

export interface ReportTestSummary extends ReportTest {
  entered: number;
  missing: number;
  avgPct: number | null;
  highest: number | null;
  lowest: number | null;
}

export interface ReportModel {
  subject: SubjectKey;
  groupName: string;
  from: string;
  to: string;
  generatedOn: string;
  /** Lesson dates in the period, ascending. */
  dates: string[];
  topicByDate: Record<string, string | null>;
  tests: ReportTest[];
  rows: ReportStudentRow[];
  summary: {
    students: number;
    lessons: number;
    attendancePct: number | null;
    homeworkPct: number | null;
    testsCount: number;
    avgTestPct: number | null;
  };
  testSummaries: ReportTestSummary[];
}

export interface ReportInput {
  subject: SubjectKey;
  group: Pick<SubjectGroup, "id" | "name">;
  students: SubjectStudent[];
  lessons: SubjectLesson[];
  records: SubjectRecord[];
  from: string;
  to: string;
  /** Optional: restrict the roster to one student. */
  studentId?: string | null;
  generatedOn: string;
}

export function buildReport(input: ReportInput): ReportModel {
  const { subject, group, from, to, generatedOn } = input;

  // Hard scoping: only this subject + this group, whatever the caller passed in.
  const lessons = input.lessons
    .filter((l) => l.subject === subject && l.group_id === group.id && l.lesson_date >= from && l.lesson_date <= to)
    .sort((a, b) => (a.lesson_date < b.lesson_date ? -1 : a.lesson_date > b.lesson_date ? 1 : 0));
  const lessonIds = new Set(lessons.map((l) => l.id));
  const inScope = input.records.filter((r) => r.subject === subject && r.group_id === group.id && lessonIds.has(r.lesson_id));
  const withRecords = new Set(inScope.map((r) => r.student_id));
  // Archived students stay in the report only if they have records in the period (history is never hidden).
  const roster = input.students
    .filter(
      (s) =>
        s.subject === subject &&
        s.group_id === group.id &&
        (!input.studentId || s.id === input.studentId) &&
        (!s.archived_at || withRecords.has(s.id)),
    )
    .sort((a, b) => a.name.localeCompare(b.name, "uz"));
  const rosterIds = new Set(roster.map((s) => s.id));
  const records = inScope.filter((r) => rosterIds.has(r.student_id));

  const dateOf = new Map(lessons.map((l) => [l.id, l.lesson_date]));
  // A disabled test is not a recorded test: its stored scores are kept in the database but not reported.
  const tests: ReportTest[] = lessons
    .filter((l) => l.has_test && l.test_max != null)
    .map((l) => ({ lessonId: l.id, date: l.lesson_date, title: l.test_title, max: l.test_max as number }));
  const testById = new Map(tests.map((t) => [t.lessonId, t]));

  const byStudent = new Map<string, SubjectRecord[]>();
  for (const r of records) {
    const list = byStudent.get(r.student_id) ?? [];
    list.push(r);
    byStudent.set(r.student_id, list);
  }

  const rows: ReportStudentRow[] = roster.map((s) => {
    const recs = byStudent.get(s.id) ?? [];
    const attendance: ReportStudentRow["attendance"] = {};
    const homework: ReportStudentRow["homework"] = {};
    const scores: ReportStudentRow["scores"] = {};
    for (const l of lessons) {
      attendance[l.lesson_date] = null;
      homework[l.lesson_date] = null;
    }
    for (const t of tests) scores[t.lessonId] = null;
    let present = 0;
    let absent = 0;
    let submitted = 0;
    let notSubmitted = 0;
    const testPcts: number[] = [];
    for (const r of recs) {
      const date = dateOf.get(r.lesson_id);
      if (!date) continue;
      attendance[date] = r.attendance;
      homework[date] = r.homework;
      if (r.attendance === "present") present += 1;
      if (r.attendance === "absent") absent += 1;
      if (r.homework === "submitted") submitted += 1;
      if (r.homework === "not_submitted") notSubmitted += 1;
      const t = testById.get(r.lesson_id);
      if (t && r.score !== null) {
        scores[t.lessonId] = r.score;
        testPcts.push((r.score / t.max) * 100);
      }
    }
    return {
      studentId: s.id,
      name: s.name,
      attendance,
      homework,
      scores,
      present,
      absent,
      attendancePct: pct(present, present + absent),
      submitted,
      notSubmitted,
      homeworkPct: pct(submitted, submitted + notSubmitted),
      testsTaken: testPcts.length,
      avgTestPct: mean(testPcts),
    };
  });

  const testSummaries: ReportTestSummary[] = tests.map((t) => {
    const entered = rows.map((r) => r.scores[t.lessonId]).filter((v): v is number => v !== null);
    return {
      ...t,
      entered: entered.length,
      missing: rows.length - entered.length,
      avgPct: mean(entered.map((v) => (v / t.max) * 100)),
      highest: entered.length ? Math.max(...entered) : null,
      lowest: entered.length ? Math.min(...entered) : null,
    };
  });

  const sum = (f: (r: ReportStudentRow) => number) => rows.reduce((a, r) => a + f(r), 0);
  const allTestPcts = tests.flatMap((t) =>
    rows.map((r) => r.scores[t.lessonId]).filter((v): v is number => v !== null).map((v) => (v / t.max) * 100),
  );

  return {
    subject,
    groupName: group.name,
    from,
    to,
    generatedOn,
    dates: lessons.map((l) => l.lesson_date),
    topicByDate: Object.fromEntries(lessons.map((l) => [l.lesson_date, l.topic])),
    tests,
    rows,
    summary: {
      students: rows.length,
      lessons: lessons.length,
      attendancePct: pct(sum((r) => r.present), sum((r) => r.present + r.absent)),
      homeworkPct: pct(sum((r) => r.submitted), sum((r) => r.submitted + r.notSubmitted)),
      testsCount: tests.length,
      avgTestPct: mean(allTestPcts),
    },
    testSummaries,
  };
}
