import { mean, pct } from "./report";
import type { SubjectAttendance, SubjectGroup, SubjectHomework, SubjectLesson, SubjectRecord, SubjectStudent } from "./types";

/**
 * A "person" is one learner of ONE subject, identified by the permanent person_id stored on every membership row
 * (subject_students has one row per group membership; all rows of one person share the same person_id).
 * Names are NOT identity: two different learners called "Ali Valiyev" are two people.
 * Nothing here writes to the database or touches English data.
 */

export const nameKey = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

export const personKey = (s: Pick<SubjectStudent, "person_id">): string => s.person_id;

export interface Person {
  key: string;
  name: string;
  /** Optional reference to an English student (read-only link). */
  englishStudentId: string | null;
  /** Every membership row (any group, archived or not). */
  memberships: SubjectStudent[];
  /** Memberships that are not archived and whose group is not archived. */
  active: SubjectStudent[];
}

export function buildPeople(students: SubjectStudent[], groups: SubjectGroup[]): Person[] {
  const groupActive = new Set(groups.filter((g) => !g.archived_at).map((g) => g.id));
  const map = new Map<string, Person>();
  for (const s of [...students].sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0))) {
    let p = map.get(s.person_id);
    if (!p) {
      p = { key: s.person_id, name: s.name, englishStudentId: s.english_student_id, memberships: [], active: [] };
      map.set(s.person_id, p);
    }
    p.memberships.push(s);
    if (!p.englishStudentId && s.english_student_id) p.englishStudentId = s.english_student_id;
    if (!s.archived_at && groupActive.has(s.group_id)) p.active.push(s);
  }
  for (const p of map.values()) p.name = (p.active[0] ?? p.memberships[0]).name;
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "uz") || (a.key < b.key ? -1 : 1));
}

/** Existing people whose name matches what was typed. The caller must let the user choose: never auto-merge. */
export function candidatesByName(name: string, people: Person[]): Person[] {
  const k = nameKey(name);
  return k ? people.filter((p) => nameKey(p.name) === k) : [];
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
