"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useData } from "./data";
import {
  taskCoinEvents,
  type Assessment,
  type Assignment,
  type CoinEvent,
  type HwTask,
  type TaskStatus,
  type WatchCase,
  type WatchNote,
} from "./homework";
import { getSupabase } from "./supabase/client";

type Status = "loading" | "ready" | "error";

export interface BulkResult {
  set: number;
  overwritten: number;
  kept: number;
  previous: unknown[];
  dry: boolean;
}

interface HomeworkApi {
  status: Status;
  error: string | null;
  reload: () => Promise<void>;
  tasks: HwTask[];
  assignments: Assignment[];
  assessments: Assessment[];
  cases: WatchCase[];
  notes: WatchNote[];
  /** `${taskId}|${studentId}` */
  assignedSet: Set<string>;
  assessMap: Map<string, Assessment>;
  coinEvents: CoinEvent[];
  /** Active (non-archived) tasks of a group's lesson day, in order. */
  tasksFor: (groupId: string, date: string) => HwTask[];
  addTask: (groupId: string, date: string, title: string, due: string | null, assignAll: boolean) => Promise<HwTask | null>;
  updateTask: (id: string, patch: { title?: string; due_date?: string | null }) => Promise<boolean>;
  archiveTask: (id: string) => Promise<boolean>;
  moveTask: (groupId: string, date: string, id: string, dir: -1 | 1) => Promise<boolean>;
  assign: (taskId: string, studentIds: string[] | null) => Promise<number | null>;
  unassign: (taskId: string, studentId: string) => Promise<boolean>;
  grade: (taskId: string, studentId: string, status: TaskStatus | null, late?: boolean) => Promise<boolean>;
  bulk: (groupId: string, date: string, taskId: string | null, overwrite: boolean, dry: boolean) => Promise<BulkResult | null>;
  restore: (items: unknown[]) => Promise<boolean>;
  addNote: (studentId: string, body: string) => Promise<boolean>;
  refreshCases: () => Promise<void>;
}

const Ctx = createContext<HomeworkApi | null>(null);

export function useHomework(): HomeworkApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useHomework must be used inside <HomeworkProvider>");
  return v;
}

const TASK_COLS = "id,group_id,lesson_date,title,due_date,position,archived_at,created_at";
const ASG_COLS = "task_id,student_id,assigned_at";
const ASS_COLS = "task_id,student_id,status,coins,graded_at,rewarded_on,completed_late,original_status,original_graded_at";
const CASE_COLS = "id,student_id,group_id,status,task_ids,opened_at,last_activity_on,resolved_at,resolve_reason";
const NOTE_COLS = "id,student_id,author_id,body,created_at";

function messageOf(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return "Noma'lum xatolik";
}

function friendly(e: unknown): string {
  const m = messageOf(e);
  if (m.includes("graded task cannot be deleted")) return "Baholangan vazifani o'chirib bo'lmaydi. Arxivlang.";
  if (m.includes("graded assignment cannot be removed")) return "Baholangan vazifani olib tashlab bo'lmaydi. Avval bahoni tozalang.";
  if (m.includes("not assigned")) return "O'quvchiga bu vazifa berilmagan.";
  if (m.includes("task is archived")) return "Vazifa arxivlangan.";
  return m;
}

async function fetchAll<T>(table: string, cols: string, order = "created_at"): Promise<T[]> {
  const sb = getSupabase();
  const size = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await sb.from(table).select(cols).order(order).range(from, from + size - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < size) break;
  }
  return rows;
}

const key = (t: string, s: string) => `${t}|${s}`;

export function HomeworkProvider({ children }: { children: ReactNode }) {
  const { status: dataStatus, notify } = useData();
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<HwTask[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [cases, setCases] = useState<WatchCase[]>([]);
  const [notes, setNotes] = useState<WatchNote[]>([]);
  const tasksRef = useRef<HwTask[]>([]);
  useEffect(() => {
    tasksRef.current = tasks;
  });

  const loadCases = useCallback(async () => {
    const [c, n] = await Promise.all([
      fetchAll<WatchCase>("homework_watch_cases", CASE_COLS, "opened_at"),
      fetchAll<WatchNote>("homework_watch_notes", NOTE_COLS),
    ]);
    setCases(c);
    setNotes(n);
  }, []);

  const loadWork = useCallback(async () => {
    const [t, a, s] = await Promise.all([
      fetchAll<HwTask>("homework_tasks", TASK_COLS),
      fetchAll<Assignment>("student_task_assignments", ASG_COLS, "assigned_at"),
      fetchAll<Assessment>("student_task_assessments", ASS_COLS, "graded_at"),
    ]);
    setTasks(t);
    setAssignments(a);
    setAssessments(s);
  }, []);

  const reload = useCallback(async () => {
    try {
      await loadWork();
      // Re-evaluate due dates / attendance before reading cases (idempotent).
      await getSupabase().rpc("refresh_watch_cases");
      await loadCases();
      setError(null);
      setStatus("ready");
    } catch (e) {
      setError(messageOf(e));
      setStatus("error");
    }
  }, [loadWork, loadCases]);

  useEffect(() => {
    if (dataStatus === "ready") void reload();
  }, [dataStatus, reload]);

  const fail = useCallback(
    (e: unknown, what: string) => {
      notify(`${what}: ${friendly(e)}`, { kind: "error" });
      return false as const;
    },
    [notify],
  );

  const refreshCases = useCallback(async () => {
    try {
      await getSupabase().rpc("refresh_watch_cases");
      await loadCases();
    } catch {
      /* non-critical */
    }
  }, [loadCases]);

  const assignedSet = useMemo(() => new Set(assignments.map((a) => key(a.task_id, a.student_id))), [assignments]);
  const assessMap = useMemo(() => new Map(assessments.map((a) => [key(a.task_id, a.student_id), a])), [assessments]);
  const coinEvents = useMemo(() => taskCoinEvents(assessments), [assessments]);

  const tasksFor = useCallback(
    (groupId: string, date: string) =>
      tasks
        .filter((t) => t.group_id === groupId && t.lesson_date === date && !t.archived_at)
        .sort((a, b) => a.position - b.position || (a.created_at < b.created_at ? -1 : 1)),
    [tasks],
  );

  const assign = useCallback<HomeworkApi["assign"]>(
    async (taskId, studentIds) => {
      const { data, error: err } = await getSupabase().rpc("assign_task", { p_task: taskId, p_students: studentIds });
      if (err) {
        fail(err, "Vazifa berilmadi");
        return null;
      }
      await Promise.all([loadWork(), loadCases()]);
      return Number(data ?? 0);
    },
    [fail, loadWork, loadCases],
  );

  const addTask = useCallback<HomeworkApi["addTask"]>(
    async (groupId, date, title, due, assignAll) => {
      const clean = title.trim();
      if (!clean) return null;
      const position = tasksRef.current.filter((t) => t.group_id === groupId && t.lesson_date === date).reduce((m, t) => Math.max(m, t.position), 0) + 1;
      const { data, error: err } = await getSupabase()
        .from("homework_tasks")
        .insert({ group_id: groupId, lesson_date: date, title: clean.slice(0, 200), due_date: due || null, position })
        .select(TASK_COLS)
        .single();
      if (err || !data) {
        fail(err, "Vazifa qo'shilmadi");
        return null;
      }
      const task = data as HwTask;
      setTasks((ts) => [...ts, task]);
      if (assignAll) await assign(task.id, null);
      return task;
    },
    [fail, assign],
  );

  const updateTask = useCallback<HomeworkApi["updateTask"]>(
    async (id, patch) => {
      const prev = tasksRef.current.find((t) => t.id === id);
      const clean = { ...patch, ...(patch.title !== undefined ? { title: patch.title.trim().slice(0, 200) } : {}) };
      if (clean.title !== undefined && !clean.title) return false;
      setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, ...clean } : t)));
      const { error: err } = await getSupabase().from("homework_tasks").update(clean).eq("id", id);
      if (err) {
        if (prev) setTasks((ts) => ts.map((t) => (t.id === id ? prev : t)));
        return fail(err, "Vazifa saqlanmadi");
      }
      await refreshCases();
      return true;
    },
    [fail, refreshCases],
  );

  const archiveTask = useCallback<HomeworkApi["archiveTask"]>(
    async (id) => {
      const at = new Date().toISOString();
      setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, archived_at: at } : t)));
      const { error: err } = await getSupabase().from("homework_tasks").update({ archived_at: at }).eq("id", id);
      if (err) {
        setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, archived_at: null } : t)));
        return fail(err, "Vazifa arxivlanmadi");
      }
      await refreshCases();
      return true;
    },
    [fail, refreshCases],
  );

  const moveTask = useCallback<HomeworkApi["moveTask"]>(
    async (groupId, date, id, dir) => {
      const list = tasksRef.current
        .filter((t) => t.group_id === groupId && t.lesson_date === date && !t.archived_at)
        .sort((a, b) => a.position - b.position || (a.created_at < b.created_at ? -1 : 1));
      const i = list.findIndex((t) => t.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return true;
      [list[i], list[j]] = [list[j], list[i]];
      const pos = new Map(list.map((t, idx) => [t.id, idx + 1]));
      const before = tasksRef.current;
      setTasks((ts) => ts.map((t) => (pos.has(t.id) ? { ...t, position: pos.get(t.id)! } : t)));
      const results = await Promise.all(
        list.map((t, idx) => getSupabase().from("homework_tasks").update({ position: idx + 1 }).eq("id", t.id)),
      );
      const bad = results.find((r) => r.error);
      if (bad?.error) {
        setTasks(before);
        return fail(bad.error, "Tartib o'zgarmadi");
      }
      return true;
    },
    [fail],
  );

  const unassign = useCallback<HomeworkApi["unassign"]>(
    async (taskId, studentId) => {
      const { error: err } = await getSupabase().rpc("unassign_task", { p_task: taskId, p_student: studentId });
      if (err) return fail(err, "Vazifa olib tashlanmadi");
      await Promise.all([loadWork(), loadCases()]);
      return true;
    },
    [fail, loadWork, loadCases],
  );

  const grade = useCallback<HomeworkApi["grade"]>(
    async (taskId, studentId, st, late = false) => {
      const before = assessments;
      const k = key(taskId, studentId);
      const task = tasksRef.current.find((t) => t.id === taskId);
      // optimistic: coins follow the status (the server recomputes the same way)
      setAssessments((as) => {
        const rest = as.filter((a) => key(a.task_id, a.student_id) !== k);
        if (st === null) return rest;
        const prev = as.find((a) => key(a.task_id, a.student_id) === k);
        return [
          ...rest,
          {
            task_id: taskId,
            student_id: studentId,
            status: st,
            coins: st === "full" ? 1 : 0,
            graded_at: new Date().toISOString(),
            rewarded_on: st === "full" ? (late ? new Date().toISOString().slice(0, 10) : (prev?.status === "full" ? prev.rewarded_on : task?.lesson_date ?? null)) : null,
            completed_late: late && st === "full",
            original_status: prev?.original_status ?? (prev && prev.status !== "full" ? prev.status : null),
            original_graded_at: prev?.original_graded_at ?? null,
          },
        ];
      });
      const { error: err } = await getSupabase().rpc("grade_task", { p_task: taskId, p_student: studentId, p_status: st, p_late: late });
      if (err) {
        setAssessments(before);
        return fail(err, "Baho saqlanmadi");
      }
      await Promise.all([loadWork(), loadCases()]);
      return true;
    },
    [assessments, fail, loadWork, loadCases],
  );

  const bulk = useCallback<HomeworkApi["bulk"]>(
    async (groupId, date, taskId, overwrite, dry) => {
      const { data, error: err } = await getSupabase().rpc("grade_tasks_bulk", {
        p_group: groupId,
        p_date: date,
        p_task: taskId,
        p_overwrite: overwrite,
        p_dry: dry,
      });
      if (err || !data) {
        fail(err, "Ommaviy baholash bajarilmadi");
        return null;
      }
      if (!dry) await Promise.all([loadWork(), loadCases()]);
      return data as BulkResult;
    },
    [fail, loadWork, loadCases],
  );

  const restore = useCallback<HomeworkApi["restore"]>(
    async (items) => {
      const { error: err } = await getSupabase().rpc("restore_assessments", { p_items: items });
      if (err) return fail(err, "Bekor qilinmadi");
      await Promise.all([loadWork(), loadCases()]);
      return true;
    },
    [fail, loadWork, loadCases],
  );

  const addNote = useCallback<HomeworkApi["addNote"]>(
    async (studentId, body) => {
      const clean = body.trim();
      if (!clean) return false;
      const { data, error: err } = await getSupabase()
        .from("homework_watch_notes")
        .insert({ student_id: studentId, body: clean.slice(0, 1000) })
        .select(NOTE_COLS)
        .single();
      if (err || !data) return fail(err, "Izoh saqlanmadi");
      setNotes((ns) => [data as WatchNote, ...ns]);
      return true;
    },
    [fail],
  );

  const value: HomeworkApi = {
    status,
    error,
    reload,
    tasks,
    assignments,
    assessments,
    cases,
    notes,
    assignedSet,
    assessMap,
    coinEvents,
    tasksFor,
    addTask,
    updateTask,
    archiveTask,
    moveTask,
    assign,
    unassign,
    grade,
    bulk,
    restore,
    addNote,
    refreshCases,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
