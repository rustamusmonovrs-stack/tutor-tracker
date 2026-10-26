import { describe, expect, it } from "vitest";
import {
  evaluateWatch,
  missedRun,
  studentProgress,
  taskCoinEvents,
  type Assessment,
  type Assignment,
  type HwTask,
  type TaskStatus,
} from "./homework";
import { buildStandings } from "./scoring";
import type { Student } from "./types";

const G = "g1";
const S = { id: "s1", group_id: G };
const task = (id: string, lesson_date: string, extra: Partial<HwTask> = {}): HwTask => ({
  id, group_id: G, lesson_date, title: id, due_date: null, position: 0, archived_at: null, created_at: lesson_date, ...extra,
});
const asg = (task_id: string, student_id = "s1"): Assignment => ({ task_id, student_id, assigned_at: "" });
const ass = (task_id: string, status: TaskStatus, extra: Partial<Assessment> = {}, student_id = "s1"): Assessment => ({
  task_id, student_id, status, coins: status === "full" ? 1 : 0, graded_at: "", rewarded_on: status === "full" ? "2026-09-01" : null,
  completed_late: false, original_status: null, original_graded_at: null, ...extra,
});
const base = { student: S, today: "2026-10-26", absentDates: new Set<string>(), mockDates: new Set<string>() };

describe("studentProgress", () => {
  const assigned = new Set(["a|s1", "b|s1"]); // task c is not assigned to s1
  it("excludes unassigned tasks from the denominator", () => {
    const m = new Map([["a|s1", ass("a", "full")], ["b|s1", ass("b", "full")]]);
    const p = studentProgress(["a", "b", "c"], "s1", assigned, m);
    expect(p).toMatchObject({ assigned: 2, full: 2, coins: 2, tone: "ok" });
  });
  it("ungraded is neutral, never red", () => {
    const p = studentProgress(["a", "b"], "s1", assigned, new Map());
    expect(p).toMatchObject({ assigned: 2, graded: 0, ungraded: 2, tone: "pending" });
  });
  it("1/2 is warning; partial-only is warning, not red; red only when all Qilmadi", () => {
    const one = new Map([["a|s1", ass("a", "full")], ["b|s1", ass("b", "not_done")]]);
    expect(studentProgress(["a", "b"], "s1", assigned, one).tone).toBe("warn");
    const partial = new Map([["a|s1", ass("a", "partial")], ["b|s1", ass("b", "not_done")]]);
    expect(studentProgress(["a", "b"], "s1", assigned, partial).tone).toBe("warn");
    const none = new Map([["a|s1", ass("a", "not_done")], ["b|s1", ass("b", "not_done")]]);
    expect(studentProgress(["a", "b"], "s1", assigned, none).tone).toBe("bad");
  });
  it("no assigned tasks -> none", () => {
    expect(studentProgress(["c"], "s1", assigned, new Map()).tone).toBe("none");
  });
});

describe("coins", () => {
  it("only To'liq earns exactly 1, dated by reward date", () => {
    const ev = taskCoinEvents([ass("a", "full", { rewarded_on: "2026-10-20" }), ass("b", "partial"), ass("c", "not_done")]);
    expect(ev).toEqual([{ student_id: "s1", date: "2026-10-20", coins: 1 }]);
  });
  it("is added to the existing standings, in range by reward date", () => {
    const students = [{ id: "s1", group_id: G, name: "A", archived_at: null, created_at: "" }] as Student[];
    const ev = [{ student_id: "s1", date: "2026-10-20", coins: 1 }, { student_id: "s1", date: "2026-09-01", coins: 1 }];
    expect(buildStandings(students, [], { from: "2026-10-19", to: "2026-10-25" }, ev)[0].coins).toBe(1);
    expect(buildStandings(students, [], { from: null, to: null }, ev)[0].coins).toBe(2);
  });
});

describe("watch rule", () => {
  const tasks = [task("t1", "2026-09-01"), task("t2", "2026-09-03"), task("t3", "2026-09-05")];
  const assignments = tasks.map((t) => asg(t.id));

  it("one missed lesson is not enough; two consecutive are", () => {
    const one = missedRun({ ...base, tasks, assignments, assessments: [ass("t1", "not_done")] });
    expect(one.lessons).toBe(1);
    const two = missedRun({ ...base, tasks, assignments, assessments: [ass("t1", "not_done"), ass("t2", "not_done")] });
    expect(two.lessons).toBe(2);
    expect(evaluateWatch(null, two, [], "s1").kind).toBe("open");
    expect(evaluateWatch(null, one, [], "s1").kind).toBe("none");
  });
  it("Chala or any To'liq in a lesson is not 'nothing done'", () => {
    const r = missedRun({ ...base, tasks, assignments, assessments: [ass("t1", "not_done"), ass("t2", "partial")] });
    expect(r.lessons).toBe(0);
  });
  it("ungraded lessons are skipped, not counted as missed and do not break the run", () => {
    const r = missedRun({ ...base, tasks, assignments, assessments: [ass("t1", "not_done"), ass("t3", "not_done")] });
    expect(r.lessons).toBe(2);
  });
  it("a lesson mixing Qilmadi with ungraded is not a missed lesson yet", () => {
    const ts = [task("a", "2026-09-01"), task("b", "2026-09-01"), task("c", "2026-09-03")];
    const r = missedRun({ ...base, tasks: ts, assignments: ts.map((t) => asg(t.id)), assessments: [ass("a", "not_done"), ass("c", "not_done")] });
    expect(r.lessons).toBe(1);
  });
  it("unassigned tasks and other groups do not count", () => {
    const other = task("o", "2026-09-03", { group_id: "g2" });
    const r = missedRun({ ...base, tasks: [...tasks, other], assignments: [asg("t1"), asg("o")], assessments: [ass("t1", "not_done"), ass("o", "not_done")] });
    expect(r.lessons).toBe(1);
  });
  it("absent and mock days are neutral", () => {
    const a = missedRun({ ...base, absentDates: new Set(["2026-09-03"]), tasks, assignments, assessments: [ass("t1", "not_done"), ass("t2", "not_done"), ass("t3", "not_done")] });
    expect(a.lessons).toBe(2);
    const m = missedRun({ ...base, mockDates: new Set(["2026-09-03"]), tasks, assignments, assessments: [ass("t1", "not_done"), ass("t2", "not_done")] });
    expect(m.lessons).toBe(1);
  });
  it("tasks not yet due are not counted", () => {
    const ts = [task("a", "2026-10-20", { due_date: "2026-10-30" }), task("b", "2026-10-22", { due_date: "2026-10-23" })];
    const r = missedRun({ ...base, tasks: ts, assignments: ts.map((t) => asg(t.id)), assessments: [ass("b", "not_done")] });
    expect(r.lessons).toBe(1);
  });
  it("case stays open until every causing task is done; then closes; new violation is a new case", () => {
    const active = { task_ids: ["t1", "t2"] };
    const run = { lessons: 0, taskIds: [] as string[] };
    const half = [ass("t1", "full"), ass("t2", "not_done")];
    expect(evaluateWatch(active, run, half, "s1").kind).toBe("none");
    const both = [ass("t1", "full"), ass("t2", "full")];
    expect(evaluateWatch(active, run, both, "s1")).toMatchObject({ kind: "resolve", reason: "completed" });
    // after resolving, a fresh pair of missed lessons opens a new case
    expect(evaluateWatch(null, { lessons: 2, taskIds: ["t4", "t5"] }, [], "s1").kind).toBe("open");
    // grade cleared by mistake -> corrected
    expect(evaluateWatch(active, run, [], "s1")).toMatchObject({ kind: "resolve", reason: "corrected" });
  });
  it("a third missed lesson extends the open case", () => {
    const active = { task_ids: ["t1", "t2"] };
    const out = evaluateWatch(active, { lessons: 3, taskIds: ["t3", "t2", "t1"] }, [ass("t1", "not_done"), ass("t2", "not_done"), ass("t3", "not_done")], "s1");
    expect(out).toMatchObject({ kind: "update" });
  });
});
