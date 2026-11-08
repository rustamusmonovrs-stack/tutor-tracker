import { describe, expect, it } from "vitest";
import { blockerLines, groupDeleteBlockers } from "./groups";
import { earlierOpenTasks, lessonCheckTasks, taskCounts, type Assessment, type HwTask } from "./homework";

const mkTask = (id: string, lesson_date: string, over: Partial<HwTask> = {}): HwTask => ({
  id, group_id: "g1", lesson_date, title: id, due_date: null, position: 1, archived_at: null, created_at: `${lesson_date}T08:00:00Z`, ...over,
});
const grade = (task_id: string, student_id: string, status: Assessment["status"]): Assessment => ({
  task_id, student_id, status, coins: status === "full" ? 1 : 0, graded_at: "", rewarded_on: status === "full" ? "2026-11-02" : null,
  completed_late: false, original_status: null, original_graded_at: null,
});

describe("lessonCheckTasks", () => {
  const tasks = [
    mkTask("own", "2026-11-06"),
    mkTask("earlier-due", "2026-11-02", { due_date: "2026-11-06" }),
    mkTask("earlier-nodue", "2026-11-02"),
    mkTask("earlier-other-due", "2026-11-02", { due_date: "2026-11-09" }),
    mkTask("later", "2026-11-09", { due_date: "2026-11-06" }),
    mkTask("archived", "2026-11-06", { archived_at: "2026-11-06T10:00:00Z" }),
    mkTask("other-group", "2026-11-06", { group_id: "g2" }),
  ];
  it("keeps tasks entered at this lesson and earlier ones whose stored due date is this lesson", () => {
    expect(lessonCheckTasks(tasks, "g1", "2026-11-06").map((t) => t.id)).toEqual(["earlier-due", "own"]);
  });
  it("never infers a checking date for an earlier task that has none", () => {
    expect(lessonCheckTasks(tasks, "g1", "2026-11-06").some((t) => t.id === "earlier-nodue")).toBe(false);
  });
});

describe("taskCounts / earlierOpenTasks", () => {
  const assigned = new Set(["t|a", "t|b", "t|c"]);
  const assess = new Map([["t|a", grade("t", "a", "full")]]);
  it("counts only assigned students; ungraded is neither done nor failed", () => {
    expect(taskCounts("t", ["a", "b", "c", "d"], assigned, assess)).toEqual({ assigned: 3, graded: 1, pending: 2 });
  });
  it("lists earlier tasks with ungraded assigned students, never ones already checked today", () => {
    const tasks = [mkTask("t", "2026-11-02"), mkTask("done", "2026-11-02"), mkTask("due", "2026-11-03", { due_date: "2026-11-06" }), mkTask("now", "2026-11-06")];
    const asgSet = new Set([...assigned, "done|a", "due|a"]);
    const asm = new Map([...assess, ["done|a", grade("done", "a", "full")]]);
    expect(earlierOpenTasks(tasks, "g1", "2026-11-06", ["a", "b", "c"], asgSet, asm).map((t) => t.id)).toEqual(["t"]);
  });
});

describe("groupDeleteBlockers", () => {
  const empty = { groupId: "g1", students: [], lessonPlans: [], tasks: [], watchCases: [], saturdayPlans: [], transfers: [], stints: [] };
  it("an untouched group may be deleted", () => {
    const b = groupDeleteBlockers(empty);
    expect(b.total).toBe(0);
    expect(blockerLines(b)).toEqual([]);
  });
  it("blocks on anything the database would cascade away or detach", () => {
    const b = groupDeleteBlockers({
      ...empty,
      students: [{ group_id: "g1" }, { group_id: "g2" }],
      lessonPlans: [{ group_id: "g1" }],
      tasks: [{ group_id: "g1" }, { group_id: "g1" }],
      transfers: [{ from_group_id: "g1", to_group_id: "g2" }, { from_group_id: "g3", to_group_id: "g2" }],
      stints: [{ group_id: "g1" }],
    });
    expect(b).toMatchObject({ students: 1, lessonPlans: 1, tasks: 2, history: 2 });
    expect(blockerLines(b).length).toBe(4);
  });
});
