import { describe, expect, it } from "vitest";
import { buildPeople, candidatesByName, nameKey, personKey, personProgress } from "./people";
import type { SubjectGroup, SubjectLesson, SubjectRecord, SubjectStudent } from "./types";

const g = (id: string, name: string, archived = false): SubjectGroup => ({ id, subject: "math", name, archived_at: archived ? "2026-01-01" : null, created_at: "2026-01-01" });
const st = (id: string, group_id: string, name: string, extra: Partial<SubjectStudent> = {}): SubjectStudent => ({
  id, person_id: id, subject: "math", group_id, name, english_student_id: null, archived_at: null, created_at: `2026-01-0${id.length}`, ...extra,
});
const lesson = (id: string, group_id: string, date: string, extra: Partial<SubjectLesson> = {}): SubjectLesson => ({
  id, subject: "math", group_id, lesson_date: date, topic: null, homework: null, has_test: false, test_title: null, test_max: null, updated_at: "", ...extra,
});
const rec = (lesson_id: string, student_id: string, group_id: string, extra: Partial<SubjectRecord> = {}): SubjectRecord => ({
  id: `${lesson_id}-${student_id}`, subject: "math", group_id, lesson_id, student_id, attendance: null, homework: null, score: null, updated_at: "", ...extra,
});

describe("people", () => {
  const groups = [g("g1", "Mat 1"), g("g2", "Mat 2"), g("g3", "Eski", true)];

  it("identity is the permanent person_id, never the name", () => {
    expect(nameKey("  Ali   VALIYEV ")).toBe("ali valiyev");
    expect(personKey({ person_id: "p1" })).toBe("p1");
  });

  it("two different people with the same name stay two people", () => {
    const people = buildPeople([st("a", "g1", "Ali Valiyev", { person_id: "p1" }), st("bb", "g1", "Ali Valiyev", { person_id: "p2" })], groups);
    expect(people).toHaveLength(2);
    expect(people.map((p) => p.key).sort()).toEqual(["p1", "p2"]);
  });

  it("memberships of one person (same person_id) across groups are counted once, even if names differ", () => {
    const people = buildPeople([st("a", "g1", "Ali Valiyev", { person_id: "p1" }), st("bb", "g2", "Ali V.", { person_id: "p1" }), st("ccc", "g1", "Vali", { person_id: "p3" })], groups);
    expect(people).toHaveLength(2);
    expect(people.find((p) => p.key === "p1")?.memberships).toHaveLength(2);
    expect(people.find((p) => p.key === "p1")?.active).toHaveLength(2);
  });

  it("a membership in an archived group or archived row is not active", () => {
    const people = buildPeople([st("a", "g3", "Ali", { person_id: "p1" }), st("bb", "g1", "Ali", { person_id: "p1", archived_at: "2026-02-01" })], groups);
    expect(people).toHaveLength(1);
    expect(people[0].active).toHaveLength(0);
  });

  it("keeps the English link found on any membership", () => {
    const people = buildPeople([st("a", "g1", "Ali", { person_id: "p1" }), st("bb", "g2", "Ali", { person_id: "p1", english_student_id: "e1" })], groups);
    expect(people[0].englishStudentId).toBe("e1");
  });

  it("candidatesByName lists every same-name person so the caller must choose (no auto-merge)", () => {
    const people = buildPeople([st("a", "g1", "Ali Valiyev", { person_id: "p1" }), st("bb", "g2", "ali  valiyev", { person_id: "p2" }), st("ccc", "g1", "Vali", { person_id: "p3" })], groups);
    expect(candidatesByName("ALI valiyev", people).map((p) => p.key).sort()).toEqual(["p1", "p2"]);
    expect(candidatesByName("Yangi Bola", people)).toEqual([]);
    expect(candidatesByName("   ", people)).toEqual([]);
  });
});

describe("personProgress", () => {
  const groups = [g("g1", "Mat 1"), g("g2", "Mat 2")];
  const a = st("a", "g1", "Ali");
  const b = st("bb", "g2", "Ali");
  const lessons = [
    lesson("l1", "g1", "2026-03-01", { has_test: true, test_max: 20, test_title: "T1" }),
    lesson("l2", "g1", "2026-03-02"),
    lesson("l3", "g2", "2026-03-03", { has_test: true, test_max: 50 }),
    lesson("l4", "g2", "2026-03-04", { has_test: false, test_max: 10 }), // disabled test keeps stored scores but is not reported
  ];
  const records = [
    rec("l1", "a", "g1", { attendance: "present", homework: "submitted", score: 0 }),
    rec("l2", "a", "g1", { attendance: "absent", homework: "unchecked" }),
    rec("l3", "bb", "g2", { attendance: "present", homework: "not_submitted", score: 25 }),
    rec("l4", "bb", "g2", { attendance: null, score: 9 }),
  ];
  const p = personProgress({ memberships: [a, b] }, groups, lessons, records);

  it("never counts unmarked as absent, unchecked as not submitted", () => {
    expect(p.present).toBe(2);
    expect(p.absent).toBe(1);
    expect(p.attendancePct).toBe(66.7);
    expect(p.submitted).toBe(1);
    expect(p.notSubmitted).toBe(1);
    expect(p.homeworkPct).toBe(50);
  });

  it("keeps a real zero and normalises different maximums", () => {
    expect(p.tests.map((t) => [t.score, t.max, t.pct])).toEqual([[0, 20, 0], [25, 50, 50]]);
    expect(p.avgTestPct).toBe(25);
  });

  it("ignores scores of a disabled test and orders history newest first", () => {
    expect(p.history.map((h) => h.date)).toEqual(["2026-03-04", "2026-03-03", "2026-03-02", "2026-03-01"]);
    expect(p.history[0].score).toBeNull();
  });

  it("no data gives null, not 0%", () => {
    const e = personProgress({ memberships: [a] }, groups, lessons, []);
    expect(e.attendancePct).toBeNull();
    expect(e.avgTestPct).toBeNull();
    expect(e.history).toEqual([]);
  });

  it("does not mix in another person's records", () => {
    const other = st("zz", "g1", "Vali");
    const q = personProgress({ memberships: [other] }, groups, lessons, records);
    expect(q.history).toEqual([]);
  });
});
