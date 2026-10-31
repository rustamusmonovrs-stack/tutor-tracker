import { describe, expect, it } from "vitest";
import { buildReport } from "./report";
import { studentTestHistory, summarize } from "./stats";
import type { SubjectLesson, SubjectRecord, SubjectStudent } from "./types";

const stu = (id: string, g: string): SubjectStudent => ({ id, subject: "math", group_id: g, name: id, english_student_id: null, archived_at: null, created_at: "" });
const les = (id: string, g: string, date: string, max: number | null): SubjectLesson => ({ id, subject: "math", group_id: g, lesson_date: date, topic: null, homework: null, has_test: max !== null, test_title: null, test_max: max, updated_at: "" });
const rec = (l: string, s: string, g: string, o: Partial<SubjectRecord>): SubjectRecord => ({ id: l + s, subject: "math", group_id: g, lesson_id: l, student_id: s, attendance: null, homework: null, score: null, updated_at: "", ...o });
const mk = (g: string, students: SubjectStudent[], lessons: SubjectLesson[], records: SubjectRecord[]) =>
  buildReport({ subject: "math", group: { id: g, name: g }, students, lessons, records, from: "2026-10-01", to: "2026-10-31", generatedOn: "2026-10-31" });

describe("summarize", () => {
  const m1 = mk("g1", [stu("a", "g1"), stu("b", "g1")], [les("l1", "g1", "2026-10-05", 10)], [
    rec("l1", "a", "g1", { attendance: "present", homework: "submitted", score: 10 }),
    rec("l1", "b", "g1", { attendance: "absent", homework: "not_submitted" }),
  ]);
  const m2 = mk("g2", [stu("c", "g2")], [les("l2", "g2", "2026-10-06", 20)], [rec("l2", "c", "g2", { attendance: "present", score: 0 })]);

  it("pools marked data across groups and keeps zero as a real score", () => {
    const s = summarize([m1, m2]);
    expect(s).toMatchObject({ groups: 2, students: 3, lessons: 2, testsCount: 2 });
    expect(s.attendancePct).toBe(66.7);
    expect(s.homeworkPct).toBe(50);
    expect(s.avgTestPct).toBe(50); // (100% + 0%) / 2: b has no score and is excluded
  });
  it("returns null, not 0, for nothing recorded", () => {
    const s = summarize([mk("g1", [stu("a", "g1")], [], [])]);
    expect(s.attendancePct).toBeNull();
    expect(s.avgTestPct).toBeNull();
    expect(summarize([]).students).toBe(0);
  });
});

describe("studentTestHistory", () => {
  it("lists only tests with an entered score, as percentages", () => {
    const m = mk("g1", [stu("a", "g1")], [les("l1", "g1", "2026-10-05", 10), les("l2", "g1", "2026-10-12", 40)], [
      rec("l1", "a", "g1", { score: 0 }),
    ]);
    expect(studentTestHistory(m, "a")).toEqual([{ date: "2026-10-05", title: null, score: 0, max: 10, pct: 0 }]);
    expect(studentTestHistory(m, "nobody")).toEqual([]);
  });
});
