import { COINS, STREAK_BONUS, STREAK_LENGTH } from "./config";
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
 * Streak rules: "full" extends the streak, "absent" is neutral, anything else resets it.
 * The bonus lands on every STREAK_LENGTH-th consecutive full lesson (3rd, 6th, 9th, ...).
 */
export function scoreLessons(lessons: Lesson[]): ScoredLesson[] {
  const sorted = [...lessons].sort(byTime);
  let streak = 0;
  return sorted.map((lesson) => {
    const base = COINS[lesson.result];
    let bonus = 0;
    if (lesson.result === "full") {
      streak += 1;
      if (streak % STREAK_LENGTH === 0) bonus = STREAK_BONUS;
    } else if (lesson.result !== "absent") {
      streak = 0;
    }
    return { lesson, base, bonus, coins: base + bonus };
  });
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

export interface Standing {
  student: Student;
  coins: number;
  lessons: number; // lessons attended in range
  full: number;
  rank: number;
}

function inRange(date: string, range: DateRange): boolean {
  if (range.from && date < range.from) return false;
  if (range.to && date > range.to) return false;
  return true;
}

/** Ranks active students; ties share a rank (1, 1, 3). Streaks use full history, totals use the range. */
export function buildStandings(
  students: Student[],
  lessons: Lesson[],
  range: DateRange,
): Standing[] {
  const byStudent = groupByStudent(lessons);
  const rows = students.map((student) => {
    const scored = scoreLessons(byStudent.get(student.id) ?? []).filter((s) =>
      inRange(s.lesson.lesson_date, range),
    );
    return {
      student,
      coins: scored.reduce((sum, s) => sum + s.coins, 0),
      lessons: scored.filter((s) => s.lesson.result !== "absent").length,
      full: scored.filter((s) => s.lesson.result === "full").length,
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
