import { describe, expect, it } from "vitest";
import { buildReport, mean, pct } from "./report";
import type { SubjectLesson, SubjectRecord, SubjectStudent } from "./types";

const G = { id: "g1", name: "Matematika 1" };
const stu = (id: string, name: string, over: Partial<SubjectStudent> = {}): SubjectStudent => ({
  id, subject: "math", group_id: "g1", name, english_student_id: null, archived_at: null, created_at: "", ...over,
});
const les = (id: string, date: string, over: Partial<SubjectLesson> = {}): SubjectLesson => ({
  id, subject: "math", group_id: "g1", lesson_date: date, topic: null, homework: null,
  has_test: false, test_title: null, test_max: null, updated_at: "", ...over,
});
const rec = (lesson: string, student: string, over: Partial<SubjectRecord> = {}): SubjectRecord => ({
  id: `${lesson}-${student}`, subject: "math", group_id: "g1", lesson_id: lesson, student_id: student,
  attendance: null, homework: null, score: null, updated_at: "", ...over,
});
const base = { subject: "math" as const, group: G, from: "2026-10-01", to: "2026-10-31", generatedOn: "2026-10-31" };

describe("pct / mean", () => {
  it("returns null (not 0) when there is nothing to divide by", () => {
    expect(pct(0, 0)).toBeNull();
    expect(mean([])).toBeNull();
  });
  it("rounds to one decimal", () => {
    expect(pct(2, 3)).toBe(66.7);
    expect(mean([26 / 30 * 100, 19 / 30 * 100])).toBe(75);
  });
});

describe("buildReport", () => {
  const students = [stu("a", "Ali"), stu("b", "Bobur"), stu("c", "Camila")];
  const lessons = [
    les("l1", "2026-10-05"),
    les("l2", "2026-10-12", { has_test: true, test_max: 30, test_title: "Algebra" }),
  ];

  it("keeps a missing score distinct from a real zero", () => {
    const r = buildReport({
      ...base, students, lessons,
      records: [rec("l2", "a", { score: 26 }), rec("l2", "b", { score: 0 }), rec("l2", "c", { attendance: "present" })],
    });
    const byName = Object.fromEntries(r.rows.map((x) => [x.name, x]));
    expect(byName.Ali.scores.l2).toBe(26);
    expect(byName.Bobur.scores.l2).toBe(0);
    expect(byName.Camila.scores.l2).toBeNull();
    expect(byName.Bobur.avgTestPct).toBe(0);
    expect(byName.Camila.avgTestPct).toBeNull();
    const t = r.testSummaries[0];
    expect(t).toMatchObject({ entered: 2, missing: 1, highest: 26, lowest: 0 });
    expect(t.avgPct).toBe(43.3); // (86.67 + 0) / 2
  });

  it("excludes unmarked attendance and unchecked homework from the denominators", () => {
    const r = buildReport({
      ...base, students, lessons,
      records: [
        rec("l1", "a", { attendance: "present", homework: "submitted" }),
        rec("l2", "a", { attendance: "absent", homework: "unchecked" }),
        rec("l1", "b", { attendance: "present", homework: "not_submitted" }),
        // c: nothing marked at all
      ],
    });
    const a = r.rows.find((x) => x.studentId === "a")!;
    expect(a.attendancePct).toBe(50);
    expect(a.homeworkPct).toBe(100); // unchecked is not "not submitted"
    const c = r.rows.find((x) => x.studentId === "c")!;
    expect(c.attendancePct).toBeNull();
    expect(c.homeworkPct).toBeNull();
    expect(r.summary.attendancePct).toBe(66.7); // 2 present of 3 marked
    expect(r.summary.homeworkPct).toBe(50);     // 1 of 2 assessed
  });

  it("reports an empty period without inventing numbers", () => {
    const r = buildReport({ ...base, students, lessons: [], records: [] });
    expect(r.summary).toMatchObject({ lessons: 0, attendancePct: null, homeworkPct: null, avgTestPct: null, testsCount: 0 });
    expect(r.dates).toEqual([]);
  });

  it("respects the date range and the single-student filter", () => {
    const r = buildReport({
      ...base, from: "2026-10-10", students, lessons,
      records: [rec("l1", "a", { attendance: "present" }), rec("l2", "a", { attendance: "present" })],
      studentId: "a",
    });
    expect(r.dates).toEqual(["2026-10-12"]);
    expect(r.rows.map((x) => x.name)).toEqual(["Ali"]);
  });

  it("never mixes in other subjects or groups", () => {
    const r = buildReport({
      ...base,
      students: [...students, stu("h", "History kid", { subject: "history" }), stu("o", "Other", { group_id: "g2" })],
      lessons: [...lessons, les("lh", "2026-10-06", { subject: "history" }), les("lo", "2026-10-07", { group_id: "g2" })],
      records: [rec("lh", "h", { subject: "history", attendance: "present" })],
    });
    expect(r.rows.map((x) => x.name)).toEqual(["Ali", "Bobur", "Camila"]);
    expect(r.dates).toEqual(["2026-10-05", "2026-10-12"]);
    expect(r.summary.attendancePct).toBeNull();
  });

  it("does not report a disabled test but does not touch its stored scores", () => {
    const off = [les("l2", "2026-10-12", { has_test: false, test_max: 30 })];
    const r = buildReport({ ...base, students, lessons: off, records: [rec("l2", "a", { score: 26 })] });
    expect(r.tests).toEqual([]);
    expect(r.summary.testsCount).toBe(0);
    expect(r.summary.avgTestPct).toBeNull();
  });

  it("normalises tests with different maximums", () => {
    const ls = [
      les("t1", "2026-10-05", { has_test: true, test_max: 10 }),
      les("t2", "2026-10-12", { has_test: true, test_max: 50 }),
    ];
    const r = buildReport({ ...base, students: [students[0]], lessons: ls, records: [rec("t1", "a", { score: 5 }), rec("t2", "a", { score: 50 })] });
    expect(r.rows[0].avgTestPct).toBe(75); // mean(50%, 100%)
  });
});

describe("roster rules", () => {
  it("keeps an archived student only when they have records in the period", () => {
    const students = [stu("a", "Ali"), stu("z", "Zebo", { archived_at: "2026-10-20T00:00:00Z" }), stu("y", "Yodgor", { archived_at: "2026-10-20T00:00:00Z" })];
    const lessons = [les("l1", "2026-10-05")];
    const r = buildReport({ ...base, students, lessons, records: [rec("l1", "z", { attendance: "present" })] });
    expect(r.rows.map((x) => x.name)).toEqual(["Ali", "Zebo"]);
  });
});
