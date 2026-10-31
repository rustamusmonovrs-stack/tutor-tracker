import { mean, pct } from "./report";
import type { SubjectAttendance, SubjectGroup, SubjectHomework, SubjectLesson, SubjectRecord, SubjectStudent } from "./types";

/**
 * A "person" is the same learner across several groups of ONE subject.
 * subject_students holds one row per group membership, so identity is derived:
 *  - the linked English student (english_student_id) when there is one, otherwise
 *  - the normalised name (case, spacing).
 * Nothing here writes to the database or touches English data.
 */

export const nameKey = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

export function personKey(s: Pick<SubjectStudent, "english_student_id" | "name">): string {
  return s.english_student_id ? `e:${s.english_student_id}` : `n:${nameKey(s.name)}`;
}

export interface Person {
  key: string;
  name: string;
  englishStudentId: string | null;
  /** Every membership row (any group, archived or not). */
  memberships: SubjectStudent[];
  /** Memberships that are not archived and whose group is not archived. */
  active: SubjectStudent[];
}

export function buildPeople(students: SubjectStudent[], groups: SubjectGroup[]): Person[] {
  const groupActive = new Set(groups.filter((g) => !g.archived_at).map((g) => g.id));
  const map = new Map<string, Person>();
  for (const s of [...students].sort((a, b) => (a.created_at < b.created_at ? -1 : 1))) {
    const key = personKey(s);
    let p = map.get(key);
    if (!p) {
      p = { key, name: s.name, englishStudentId: s.english_student_id, memberships: [], active: [] };
      map.set(key, p);
    }
    p.memberships.push(s);
    if (!s.archived_at && groupActive.has(s.group_id)) p.active.push(s);
  }
  for (const p of map.values()) {
    const first = p.active[0] ?? p.memberships[0];
    p.name = first.name;
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "uz"));
}

/**
 * Which identity a typed/selected name resolves to. Re-uses an existing person of this subject
 * (same English link or same name) so a second "Ali Valiyev" is never created as a stranger.
 */
export function identify(
  name: string,
  englishStudentId: string | null,
  people: Person[],
): { name: string; englishStudentId: string | null; existing: Person | null } {
  const clean = name.trim().replace(/\s+/g, " ");
  const existing =
    (englishStudentId ? people.find((p) => p.englishStudentId === englishStudentId) : undefined) ??
    people.find((p) => nameKey(p.name) === nameKey(clean));
  if (existing) return { name: existing.name, englishStudentId: existing.englishStudentId ?? englishStudentId, existing };
  return { name: clean, englishStudentId, existing: null };
}

export interface PersonHistoryEntry {
  date: string;
  groupName: string;
  topic: string | null;
  attendance: SubjectAttendance | null;
  homework: SubjectHomework | null;
  /** Only for lessons where the test is switched on. */
  score: number | null;
  max: number | null;
  scorePct: number | null;
  testTitle: string | null;
}

export interface PersonProgress {
  /** Newest first. */
  history: PersonHistoryEntry[];
  present: number;
  absent: number;
  attendancePct: number | null;
  submitted: number;
  notSubmitted: number;
  homeworkPct: number | null;
  /** Oldest first, only tests with an entered score. */
  tests: { date: string; title: string | null; groupName: string; score: number; max: number; pct: number }[];
  avgTestPct: number | null;
}

/** All figures of one person, computed with the same rules as the group report (unmarked never counts as absent / zero). */
export function personProgress(
  person: Pick<Person, "memberships">,
  groups: SubjectGroup[],
  lessons: SubjectLesson[],
  records: SubjectRecord[],
): PersonProgress {
  const ids = new Set(person.memberships.map((m) => m.id));
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  const lessonById = new Map(lessons.map((l) => [l.id, l]));
  const history: PersonHistoryEntry[] = [];
  let present = 0;
  let absent = 0;
  let submitted = 0;
  let notSubmitted = 0;
  const tests: PersonProgress["tests"] = [];

  for (const r of records) {
    if (!ids.has(r.student_id)) continue;
    const l = lessonById.get(r.lesson_id);
    if (!l) continue;
    if (r.attendance === "present") present += 1;
    if (r.attendance === "absent") absent += 1;
    if (r.homework === "submitted") submitted += 1;
    if (r.homework === "not_submitted") notSubmitted += 1;
    const isTest = l.has_test && l.test_max != null;
    const scored = isTest && r.score !== null;
    if (scored) {
      tests.push({
        date: l.lesson_date,
        title: l.test_title,
        groupName: groupName.get(l.group_id) ?? "",
        score: r.score as number,
        max: l.test_max as number,
        pct: pct(r.score as number, l.test_max as number) as number,
      });
    }
    history.push({
      date: l.lesson_date,
      groupName: groupName.get(l.group_id) ?? "",
      topic: l.topic,
      attendance: r.attendance,
      homework: r.homework,
      score: scored ? r.score : null,
      max: isTest ? l.test_max : null,
      scorePct: scored ? pct(r.score as number, l.test_max as number) : null,
      testTitle: isTest ? l.test_title : null,
    });
  }

  history.sort((a, b) => (a.date === b.date ? a.groupName.localeCompare(b.groupName, "uz") : a.date < b.date ? 1 : -1));
  tests.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return {
    history,
    present,
    absent,
    attendancePct: pct(present, present + absent),
    submitted,
    notSubmitted,
    homeworkPct: pct(submitted, submitted + notSubmitted),
    tests,
    avgTestPct: mean(tests.map((t) => (t.score / t.max) * 100)),
  };
}
