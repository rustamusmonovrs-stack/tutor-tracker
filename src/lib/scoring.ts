import { HOMEWORK_COINS, STREAK_BONUS, STREAK_LENGTH } from "./config";
import type { Group, Lesson, Student } from "./types";

export interface ScoredLesson {
  lesson: Lesson;
  base: number;
  bonus: number;
  coins: number;
}

function byTime(a: Lesson, b: Lesson): number {
  if (a.lesson_date !== b.lesson_date) return a.lesson_date < b.lesson_date ? -1 : 1;
  return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
}

/**
 * Coins are derived, never stored, so editing an old lesson re-scores everything correctly.
 * Only homework earns coins: full 2, partial 1, not_done 0.
 * Streak: homework "full" extends it, "partial" / "not_done" reset it, and a lesson without a
 * homework grade (absent, or not assessed yet) is neutral. The bonus lands on every
 * STREAK_LENGTH-th consecutive full homework (3rd, 6th, 9th, ...).
 */
export function scoreLessons(lessons: Lesson[]): ScoredLesson[] {
  const sorted = [...lessons].sort(byTime);
  let streak = 0;
  return sorted.map((lesson) => {
    const hw = lesson.homework;
    const base = hw ? HOMEWORK_COINS[hw] : 0;
    let bonus = 0;
    if (hw === "full") {
      streak += 1;
      if (streak % STREAK_LENGTH === 0) bonus = STREAK_BONUS;
    } else if (hw) {
      streak = 0;
    }
    return { lesson, base, bonus, coins: base + bonus };
  });
}

/** Consecutive full homework ending at the latest graded lesson (absences / ungraded days are skipped). */
export function currentStreak(lessons: Lesson[]): number {
  let streak = 0;
  for (const l of [...lessons].sort(byTime)) {
    if (l.homework === "full") streak += 1;
    else if (l.homework) streak = 0;
  }
  return streak;
}

export function groupByStudent(lessons: Lesson[]): Map<string, Lesson[]> {
  const map = new Map<string, Lesson[]>();
  for (const l of lessons) {
    const list = map.get(l.student_id);
    if (list) list.push(l);
    else map.set(l.student_id, [l]);
  }
  return map;
}

export interface DateRange {
  from: string | null; // inclusive, YYYY-MM-DD
  to: string | null; // inclusive
}

export function inRange(date: string, range: DateRange): boolean {
  if (range.from && date < range.from) return false;
  if (range.to && date > range.to) return false;
  return true;
}

export interface Standing {
  student: Student;
  coins: number;
  /** Lessons attended in range (attendance = present). */
  attended: number;
  /** Lessons marked absent in range. */
  absent: number;
  full: number;
  /** Lessons with any mark in range. */
  marked: number;
  rank: number;
}

/** Ranks students; ties share a rank (1, 1, 3). Streaks use full history, totals use the range. */
export function buildStandings(
  students: Student[],
  lessons: Lesson[],
  range: DateRange,
  /** Smart-homework coins (1 per To'liq task, dated by reward date), added to the same totals. */
  extra: ReadonlyArray<{ student_id: string; date: string; coins: number }> = [],
): Standing[] {
  const byStudent = groupByStudent(lessons);
  const extraBy = new Map<string, number>();
  for (const e of extra) {
    if (inRange(e.date, range)) extraBy.set(e.student_id, (extraBy.get(e.student_id) ?? 0) + e.coins);
  }
  const rows = students.map((student) => {
    const scored = scoreLessons(byStudent.get(student.id) ?? []).filter((s) =>
      inRange(s.lesson.lesson_date, range),
    );
    return {
      student,
      coins: scored.reduce((sum, s) => sum + s.coins, 0) + (extraBy.get(student.id) ?? 0),
      attended: scored.filter((s) => s.lesson.attendance === "present").length,
      absent: scored.filter((s) => s.lesson.attendance === "absent").length,
      full: scored.filter((s) => s.lesson.homework === "full").length,
      marked: scored.length,
      rank: 0,
    };
  });

  rows.sort(
    (a, b) =>
      b.coins - a.coins ||
      b.full - a.full ||
      a.student.name.localeCompare(b.student.name),
  );

  rows.forEach((row, i) => {
    const prev = rows[i - 1];
    row.rank = prev && prev.coins === row.coins ? prev.rank : i + 1;
  });
  return rows;
}

export interface GroupStanding {
  group: Group;
  students: number;
  total: number;
  average: number;
  rank: number;
}

/** Group average = total coins / active students, so a bigger group has no built-in edge. */
export function buildGroupStandings(
  groups: Group[],
  standings: Standing[],
): GroupStanding[] {
  const rows = groups.map((group) => {
    const members = standings.filter((s) => s.student.group_id === group.id);
    const total = members.reduce((sum, s) => sum + s.coins, 0);
    return {
      group,
      students: members.length,
      total,
      average: members.length ? total / members.length : 0,
      rank: 0,
    };
  });
  rows.sort((a, b) => b.average - a.average || a.group.name.localeCompare(b.group.name));
  rows.forEach((row, i) => {
    const prev = rows[i - 1];
    row.rank = prev && prev.average === row.average ? prev.rank : i + 1;
  });
  return rows;
}

export interface Summary {
  lessons: number;
  present: number;
  absent: number;
  full: number;
  partial: number;
  notDone: number;
  /** Lessons where homework was graded. */
  graded: number;
  coins: number;
}

/** Aggregate counts for a set of lessons already filtered to the period (coins need full history). */
export function summarize(scored: ScoredLesson[]): Summary {
  const s: Summary = { lessons: scored.length, present: 0, absent: 0, full: 0, partial: 0, notDone: 0, graded: 0, coins: 0 };
  for (const { lesson, coins } of scored) {
    s.coins += coins;
    if (lesson.attendance === "present") s.present += 1;
    if (lesson.attendance === "absent") s.absent += 1;
    if (lesson.homework === "full") s.full += 1;
    if (lesson.homework === "partial") s.partial += 1;
    if (lesson.homework === "not_done") s.notDone += 1;
    if (lesson.homework) s.graded += 1;
  }
  return s;
}
