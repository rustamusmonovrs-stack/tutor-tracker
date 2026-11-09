import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import type { Assessment, Assignment, HwTask } from "./homework";
import { checkDate, homeworkItems, homeworkWeeks, summarizeItems, type HwStatsInput } from "./homeworkStats";
import type { Lesson } from "./types";

const TODAY = "2026-11-09"; // Monday
const task = (id: string, lesson_date: string, over: Partial<HwTask> = {}): HwTask => ({
  id, group_id: "g", lesson_date, title: id, due_date: null, position: 1, archived_at: null, created_at: `${lesson_date}T05:00:00Z`, ...over,
});
const asg = (task_id: string, student_id: string): Assignment => ({ task_id, student_id, assigned_at: "2026-10-01T00:00:00Z" });
const grade = (task_id: string, student_id: string, status: Assessment["status"], graded_at = "2026-11-01T10:00:00Z"): Assessment => ({
  task_id, student_id, status, coins: status === "full" ? 1 : 0, graded_at, rewarded_on: null, completed_late: false, original_status: null, original_graded_at: null,
});
const lesson = (student_id: string, lesson_date: string, homework: Lesson["homework"]): Lesson => ({
  id: `${student_id}-${lesson_date}`, student_id, topic_id: null, topic_title: "Dars", lesson_date, attendance: "present", homework, created_at: `${lesson_date}T05:00:00Z`,
});
const map = (as: Assessment[]) => new Map(as.map((a) => [`${a.task_id}|${a.student_id}`, a]));

function input(over: Partial<HwStatsInput> = {}): HwStatsInput {
  return { studentIds: new Set(["a", "b", "c"]), lessons: [], tasks: [], assignments: [], assessments: new Map(), from: addDays(TODAY, -29), to: TODAY, ...over };
}
const weeksOf = (i: HwStatsInput) => homeworkWeeks(homeworkItems(i), i.from, i.to);
const compact = (i: HwStatsInput) => weeksOf(i).filter((w) => w.graded || w.pending).map((w) => [w.start, w.full, w.partial, w.notDone, w.pending]);

// Production shape (read-only check on 09.11.2026): old per-lesson grades only in the week of 19.10,
// Smart Homework grades in the weeks of 26.10 and 02.11 that the old chart ignored.
describe("weekly homework statistics", () => {
  it("regression: Smart Homework weeks are no longer empty when old grades exist in only one week", () => {
    const tasks = [task("t1", "2026-10-28"), task("t2", "2026-11-04")];
    const i = input({
      lessons: [lesson("a", "2026-10-21", "full"), lesson("b", "2026-10-21", "not_done")],
      tasks,
      assignments: [asg("t1", "a"), asg("t1", "b"), asg("t2", "a")],
      assessments: map([grade("t1", "a", "full"), grade("t1", "b", "partial"), grade("t2", "a", "full")]),
    });
    expect(compact(i)).toEqual([
      ["2026-10-19", 1, 0, 1, 0],
      ["2026-10-26", 1, 1, 0, 0],
      ["2026-11-02", 1, 0, 0, 0],
    ]);
  });

  it("only one week with results: other weeks are present and exactly zero (no artificial values)", () => {
    const i = input({ lessons: [lesson("a", "2026-10-21", "full")] });
    const weeks = weeksOf(i);
    expect(weeks.map((w) => w.start)).toEqual(["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02", "2026-11-09"]);
    expect(weeks.map((w) => w.graded)).toEqual([0, 0, 1, 0, 0, 0]);
  });

  it("no homework records: every week is zero, summary is zero", () => {
    const i = input();
    expect(weeksOf(i).every((w) => w.graded === 0 && w.pending === 0)).toBe(true);
    expect(summarizeItems(homeworkItems(i))).toEqual({ full: 0, partial: 0, notDone: 0, graded: 0, pending: 0 });
  });

  it("assigned but ungraded tasks are pending, never Qilmadi", () => {
    const i = input({ tasks: [task("t", "2026-11-04")], assignments: [asg("t", "a"), asg("t", "b")], assessments: map([grade("t", "a", "full")]) });
    expect(summarizeItems(homeworkItems(i))).toEqual({ full: 1, partial: 0, notDone: 0, graded: 1, pending: 1 });
  });

  it("archived tasks: grades still count (they and their coins exist), ungraded archived assignments are not expected", () => {
    const archived = task("old", "2026-10-28", { archived_at: "2026-11-01T00:00:00Z" });
    const i = input({ tasks: [archived], assignments: [asg("old", "a"), asg("old", "b")], assessments: map([grade("old", "a", "partial")]) });
    expect(summarizeItems(homeworkItems(i))).toMatchObject({ partial: 1, graded: 1, pending: 0 });
  });

  it("task given earlier and checked later: counted once, in the checking lesson's week (not the given week, not the click time)", () => {
    const earlier = task("bbc", "2026-10-30", { due_date: "2026-11-03" }); // Friday given, Tuesday checked
    const i = input({ tasks: [earlier], assignments: [asg("bbc", "a")], assessments: map([grade("bbc", "a", "full", "2026-11-05T15:00:00Z")]) });
    expect(checkDate(earlier)).toBe("2026-11-03");
    expect(compact(i)).toEqual([["2026-11-02", 1, 0, 0, 0]]);
    expect(homeworkItems(i)).toHaveLength(1);
  });

  it("re-grading a task replaces its status, never adds a second item", () => {
    const t = task("t", "2026-11-04");
    let m = map([grade("t", "a", "partial")]);
    m = new Map(m).set("t|a", grade("t", "a", "full", "2026-11-05T10:00:00Z")); // updated grade, same key
    const i = input({ tasks: [t], assignments: [asg("t", "a"), asg("t", "a")], assessments: m });
    expect(summarizeItems(homeworkItems(i))).toEqual({ full: 1, partial: 0, notDone: 0, graded: 1, pending: 0 });
  });

  it("a lesson that has both an old grade and Smart Homework grades is counted once (Smart Homework wins)", () => {
    const i = input({ lessons: [lesson("a", "2026-11-04", "full")], tasks: [task("t", "2026-11-04")], assignments: [asg("t", "a")], assessments: map([grade("t", "a", "not_done")]) });
    expect(summarizeItems(homeworkItems(i))).toMatchObject({ full: 0, notDone: 1, graded: 1 });
  });

  it("group filter: only the selected students count", () => {
    const i = input({ studentIds: new Set(["a"]), tasks: [task("t", "2026-11-04")], assignments: [asg("t", "a"), asg("t", "b")], assessments: map([grade("t", "a", "full"), grade("t", "b", "not_done")]), lessons: [lesson("b", "2026-11-04", "full")] });
    expect(summarizeItems(homeworkItems(i))).toEqual({ full: 1, partial: 0, notDone: 0, graded: 1, pending: 0 });
  });

  it("7 / 30 / 90-day periods are independent and cut items exactly at the first day", () => {
    const tasks = [task("t1", "2026-11-03"), task("t2", "2026-10-20"), task("t3", "2026-08-20")];
    const base = { tasks, assignments: tasks.map((t) => asg(t.id, "a")), assessments: map(tasks.map((t) => grade(t.id, "a", "full"))) };
    const count = (days: number) => summarizeItems(homeworkItems(input({ ...base, from: addDays(TODAY, -(days - 1)) }))).graded;
    expect([count(7), count(30), count(90)]).toEqual([1, 2, 3]);
    expect(summarizeItems(homeworkItems(input({ ...base, from: "2026-11-04" }))).graded).toBe(0); // 03.11 is outside
  });

  it("week boundary: Sunday belongs to the week before, Monday starts a new week (date strings, no UTC shift)", () => {
    // graded late in the evening Tashkent time (UTC timestamp on the previous day) must not move the item
    const i = input({ tasks: [task("sun", "2026-11-08"), task("mon", "2026-11-09")], assignments: [asg("sun", "a"), asg("mon", "a")], assessments: map([grade("sun", "a", "full", "2026-11-08T18:30:00Z"), grade("mon", "a", "full", "2026-11-08T19:30:00Z")]) });
    expect(compact(i)).toEqual([["2026-11-02", 1, 0, 0, 0], ["2026-11-09", 1, 0, 0, 0]]);
  });

  it("To'liq / Chala / Qilmadi totals and the summary card equal the sum of the weekly columns", () => {
    const tasks = Array.from({ length: 6 }, (_, k) => task(`t${k}`, addDays("2026-10-14", k * 5)));
    const sts: Assessment["status"][] = ["full", "partial", "not_done"];
    const assessments = map(tasks.flatMap((t, k) => ["a", "b", "c"].map((s, j) => grade(t.id, s, sts[(k + j) % 3]))));
    const i = input({ tasks, assignments: tasks.flatMap((t) => ["a", "b", "c"].map((s) => asg(t.id, s))), assessments, lessons: [lesson("a", "2026-10-12", "full")] });
    const sum = summarizeItems(homeworkItems(i));
    const weeks = weeksOf(i);
    for (const k of ["full", "partial", "notDone", "graded", "pending"] as const) expect(weeks.reduce((n, w) => n + w[k], 0)).toBe(sum[k]);
    expect(sum).toEqual({ full: 7, partial: 6, notDone: 6, graded: 19, pending: 0 });
  });

  it("refresh after a successful save: new state (as the hook sets it) is reflected immediately, nothing is cached", () => {
    const t = task("t", "2026-11-04");
    const before = input({ tasks: [t], assignments: [asg("t", "a")] });
    expect(summarizeItems(homeworkItems(before))).toMatchObject({ graded: 0, pending: 1 });
    const after = { ...before, assessments: map([grade("t", "a", "full")]) };
    expect(summarizeItems(homeworkItems(after))).toMatchObject({ full: 1, graded: 1, pending: 0 });
  });

  it("is read-only: inputs are not mutated", () => {
    const i = input({ tasks: [task("t", "2026-11-04")], assignments: [asg("t", "a")], assessments: map([grade("t", "a", "full")]), lessons: [lesson("b", "2026-11-04", "full")] });
    const snap = JSON.stringify([i.tasks, i.assignments, [...i.assessments], i.lessons]);
    homeworkWeeks(homeworkItems(i), i.from, i.to);
    expect(JSON.stringify([i.tasks, i.assignments, [...i.assessments], i.lessons])).toBe(snap);
  });
});
