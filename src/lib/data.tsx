"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getSupabase } from "./supabase/client";
import { groupByStudent } from "./scoring";
import { sortTopics } from "./progress";
import type { Attendance, Group, Homework, Lesson, LessonPlan, Student, Topic } from "./types";

type Status = "loading" | "ready" | "error";

export interface ToastState {
  id: number;
  message: string;
  kind: "ok" | "error";
  action?: { label: string; run: () => void };
}

/** Change one or both fields of a student's lesson; `undefined` keeps the current value, `null` clears it. */
export interface MarkArgs {
  student: Student;
  date: string;
  attendance?: Attendance | null;
  homework?: Homework | null;
  /** Used only when the lesson row is created. */
  topicId?: string | null;
  topicTitle?: string;
}

/** Partial update of a day's lesson info. `undefined` keeps the stored value, empty text clears it. */
export interface PlanPatch {
  topic?: string;
  homework?: string;
}

interface DataApi {
  status: Status;
  error: string | null;
  reload: () => Promise<void>;

  groups: Group[];
  students: Student[];
  topics: Topic[];
  lessons: Lesson[];
  plans: LessonPlan[];
  /** Groups that are not archived. */
  activeGroups: Group[];
  /** Students that are not archived and belong to a non-archived group. */
  activeStudents: Student[];
  lessonsByStudent: Map<string, Lesson[]>;
  topicsByStudent: Map<string, Topic[]>;

  toast: ToastState | null;
  notify: (message: string, opts?: Partial<Pick<ToastState, "kind" | "action">>) => void;
  dismissToast: () => void;
  isSaving: (studentId: string) => boolean;
  /** Number of writes in flight, and when the last one succeeded (for the "Saqlanmoqda / Saqlandi" chip). */
  pendingWrites: number;
  lastSavedAt: number | null;

  markLesson: (args: MarkArgs) => Promise<boolean>;
  /** Mark attendance for many students at once (one request). */
  markAttendanceBulk: (students: Student[], date: string, attendance: Attendance) => Promise<boolean>;
  /** Saves only the fields present in `patch` (empty string clears). Writes for one group/day run in order. */
  savePlan: (groupId: string, date: string, patch: PlanPatch) => Promise<boolean>;

  addGroup: (name: string) => Promise<boolean>;
  renameGroup: (id: string, name: string) => Promise<boolean>;
  setGroupArchived: (id: string, archived: boolean) => Promise<boolean>;
  deleteGroup: (id: string) => Promise<boolean>;

  addStudent: (name: string, groupId: string) => Promise<Student | null>;
  updateStudent: (id: string, patch: Partial<Pick<Student, "name" | "group_id">>) => Promise<boolean>;
  setStudentArchived: (id: string, archived: boolean) => Promise<boolean>;
  deleteStudent: (id: string) => Promise<boolean>;

  addTopics: (studentId: string, titles: string[]) => Promise<boolean>;
  renameTopic: (id: string, title: string) => Promise<boolean>;
  removeTopic: (id: string) => Promise<boolean>;
  moveTopic: (studentId: string, id: string, direction: -1 | 1) => Promise<boolean>;
}

const Ctx = createContext<DataApi | null>(null);

export function useData(): DataApi {
  const value = useContext(Ctx);
  if (!value) throw new Error("useData must be used inside <DataProvider>");
  return value;
}

const GROUP_COLS = "id,name,archived_at,created_at";
const STUDENT_COLS = "id,group_id,name,archived_at,created_at";
const TOPIC_COLS = "id,student_id,position,title";
const LESSON_COLS = "id,student_id,topic_id,topic_title,lesson_date,attendance,homework,created_at";
const PLAN_COLS = "id,group_id,lesson_date,topic,homework,updated_at";
const FALLBACK_TITLE = "Dars";

function messageOf(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return "Noma'lum xatolik";
}

/** PostgREST returns at most 1000 rows per request, so page through the table. */
async function fetchAll<T>(table: string, columns: string, orderBy = "created_at"): Promise<T[]> {
  const sb = getSupabase();
  const pageSize = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await sb
      .from(table)
      .select(columns)
      .order(orderBy)
      .order("id")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [plans, setPlans] = useState<LessonPlan[]>([]);
  const [pendingWrites, setPendingWrites] = useState(0);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [saving, setSaving] = useState<string[]>([]);

  const lessonsRef = useRef(lessons);
  const topicsRef = useRef(topics);
  const plansRef = useRef<LessonPlan[]>([]);
  const planQueue = useRef(new Map<string, Promise<unknown>>());
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastSeq = useRef(0);
  useEffect(() => {
    lessonsRef.current = lessons;
    topicsRef.current = topics;
  });

  const dismissToast = useCallback(() => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(null);
  }, []);

  const notify = useCallback<DataApi["notify"]>((message, opts) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastSeq.current += 1;
    setToast({ id: toastSeq.current, message, kind: opts?.kind ?? "ok", action: opts?.action });
    toastTimer.current = setTimeout(() => setToast(null), opts?.action ? 7000 : 4000);
  }, []);

  const fail = useCallback(
    (e: unknown, what: string) => {
      notify(`${what}: ${messageOf(e)}`, { kind: "error" });
      return false as const;
    },
    [notify],
  );

  const reload = useCallback(async () => {
    setStatus((s) => (s === "ready" ? s : "loading"));
    try {
      const [g, s, t, l, p] = await Promise.all([
        fetchAll<Group>("groups", GROUP_COLS),
        fetchAll<Student>("students", STUDENT_COLS),
        fetchAll<Topic>("topics", TOPIC_COLS),
        fetchAll<Lesson>("lessons", LESSON_COLS),
        fetchAll<LessonPlan>("lesson_plans", PLAN_COLS, "updated_at"),
      ]);
      setGroups(g);
      setStudents(s);
      setTopics(t);
      setLessons(l);
      plansRef.current = p.map((r) => ({ ...r, topic: r.topic ?? null, homework: r.homework ?? null }));
      setPlans(plansRef.current);
      setError(null);
      setStatus("ready");
    } catch (e) {
      setError(messageOf(e));
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const markSaving = (id: string, on: boolean) =>
    setSaving((ids) => (on ? [...ids, id] : ids.filter((x) => x !== id)));

  const beginWrite = () => setPendingWrites((n) => n + 1);
  const endWrite = (ok: boolean) => {
    setPendingWrites((n) => Math.max(0, n - 1));
    if (ok) setLastSavedAt(Date.now());
  };

  // ---- lessons -----------------------------------------------------------

  const markLesson = useCallback<DataApi["markLesson"]>(
    async ({ student, date, attendance, homework, topicId, topicTitle }) => {
      const sb = getSupabase();
      const existing = lessonsRef.current.find(
        (l) => l.student_id === student.id && l.lesson_date === date,
      );
      const nextAttendance = attendance === undefined ? (existing?.attendance ?? null) : attendance;
      const nextHomework = homework === undefined ? (existing?.homework ?? null) : homework;

      markSaving(student.id, true);
      beginWrite();

      // Nothing left on the row: remove it so "not marked" is the absence of a record.
      if (nextAttendance === null && nextHomework === null) {
        if (!existing) {
          markSaving(student.id, false);
          endWrite(true);
          return true;
        }
        setLessons((ls) => ls.filter((l) => l.id !== existing.id));
        const { error: err } = await sb.from("lessons").delete().eq("id", existing.id);
        markSaving(student.id, false);
        endWrite(!err);
        if (err) {
          setLessons((ls) => [...ls, existing]);
          return fail(err, `${student.name}: o'zgarish saqlanmadi`);
        }
        return true;
      }

      const optimistic: Lesson = existing
        ? { ...existing, attendance: nextAttendance, homework: nextHomework }
        : {
            id: `tmp-${crypto.randomUUID()}`,
            student_id: student.id,
            topic_id: topicId ?? null,
            topic_title: topicTitle?.trim() || FALLBACK_TITLE,
            lesson_date: date,
            attendance: nextAttendance,
            homework: nextHomework,
            created_at: new Date().toISOString(),
          };
      setLessons((ls) =>
        existing ? ls.map((l) => (l.id === existing.id ? optimistic : l)) : [...ls, optimistic],
      );

      const { data, error: err } = await sb
        .from("lessons")
        .upsert(
          {
            student_id: student.id,
            lesson_date: date,
            topic_id: optimistic.topic_id,
            topic_title: optimistic.topic_title,
            attendance: nextAttendance,
            homework: nextHomework,
          },
          { onConflict: "student_id,lesson_date" },
        )
        .select(LESSON_COLS)
        .single();
      markSaving(student.id, false);
      endWrite(!(err || !data));

      if (err || !data) {
        setLessons((ls) =>
          existing
            ? ls.map((l) => (l.id === optimistic.id ? existing : l))
            : ls.filter((l) => l.id !== optimistic.id),
        );
        return fail(err, `${student.name}: saqlanmadi`);
      }
      setLessons((ls) => ls.map((l) => (l.id === optimistic.id ? (data as Lesson) : l)));
      return true;
    },
    [fail],
  );

  const markAttendanceBulk = useCallback<DataApi["markAttendanceBulk"]>(
    async (list, date, attendance) => {
      const sb = getSupabase();
      // Only students with no record yet: never overwrite what the teacher already marked.
      const targets = list.filter(
        (s) => !lessonsRef.current.some((l) => l.student_id === s.id && l.lesson_date === date),
      );
      if (!targets.length) return true;
      const rows = targets.map((s) => ({
        student_id: s.id,
        lesson_date: date,
        topic_id: null,
        topic_title: FALLBACK_TITLE,
        attendance,
        homework: null,
      }));
      const tmpIds = new Set<string>();
      const optimistic: Lesson[] = rows.map((r) => {
        const id = `tmp-${crypto.randomUUID()}`;
        tmpIds.add(id);
        return { id, ...r, created_at: new Date().toISOString() } as Lesson;
      });
      targets.forEach((s) => markSaving(s.id, true));
      beginWrite();
      setLessons((ls) => [...ls, ...optimistic]);
      const { data, error: err } = await sb
        .from("lessons")
        .upsert(rows, { onConflict: "student_id,lesson_date", ignoreDuplicates: true })
        .select(LESSON_COLS);
      targets.forEach((s) => markSaving(s.id, false));
      endWrite(!err);
      if (err || !data) {
        setLessons((ls) => ls.filter((l) => !tmpIds.has(l.id)));
        return fail(err, "Davomat saqlanmadi");
      }
      setLessons((ls) => [...ls.filter((l) => !tmpIds.has(l.id)), ...(data as Lesson[])]);
      return true;
    },
    [fail],
  );

  const savePlan = useCallback<DataApi["savePlan"]>(
    (groupId, date, patch) => {
      const key = `${groupId}|${date}`;
      const norm = (v: string | undefined) => (v === undefined ? undefined : v.trim() || null);
      const run = async (): Promise<boolean> => {
        const sb = getSupabase();
        const prev = plansRef.current.find((p) => p.group_id === groupId && p.lesson_date === date);
        const t = norm(patch.topic);
        const h = norm(patch.homework);
        const nextTopic = t === undefined ? (prev?.topic ?? null) : t;
        const nextHw = h === undefined ? (prev?.homework ?? null) : h;
        beginWrite();
        if (nextTopic === null && nextHw === null) {
          if (!prev) {
            endWrite(true);
            return true;
          }
          const { error: err } = await sb.from("lesson_plans").delete().eq("id", prev.id);
          endWrite(!err);
          if (err) return fail(err, "Dars ma'lumoti saqlanmadi");
          plansRef.current = plansRef.current.filter((p) => p.id !== prev.id);
          setPlans(plansRef.current);
          return true;
        }
        const payload: Record<string, unknown> = { group_id: groupId, lesson_date: date, updated_at: new Date().toISOString() };
        if (t !== undefined) payload.topic = t;
        if (h !== undefined) payload.homework = h;
        const { data, error: err } = await sb
          .from("lesson_plans")
          .upsert(payload, { onConflict: "group_id,lesson_date" })
          .select(PLAN_COLS)
          .single();
        endWrite(!(err || !data));
        if (err || !data) return fail(err, "Dars ma'lumoti saqlanmadi");
        const row = { topic: null, homework: null, ...(data as object) } as LessonPlan;
        plansRef.current = [...plansRef.current.filter((p) => !(p.group_id === groupId && p.lesson_date === date)), row];
        setPlans(plansRef.current);
        return true;
      };
      // Writes for the same group+day run strictly in order, so an older request can never land after a newer one.
      const chained = (planQueue.current.get(key) ?? Promise.resolve()).then(run, run);
      planQueue.current.set(key, chained);
      return chained;
    },
    [fail],
  );

  // ---- groups ------------------------------------------------------------

  const addGroup = useCallback<DataApi["addGroup"]>(
    async (name) => {
      const { data, error: err } = await getSupabase()
        .from("groups")
        .insert({ name: name.trim() })
        .select(GROUP_COLS)
        .single();
      if (err || !data) return fail(err, "Guruh qo'shilmadi");
      setGroups((gs) => [...gs, data as Group]);
      return true;
    },
    [fail],
  );

  const patchGroup = useCallback(
    async (id: string, patch: Partial<Group>, what: string) => {
      const prev = groups.find((g) => g.id === id);
      setGroups((gs) => gs.map((g) => (g.id === id ? { ...g, ...patch } : g)));
      const { error: err } = await getSupabase().from("groups").update(patch).eq("id", id);
      if (err) {
        if (prev) setGroups((gs) => gs.map((g) => (g.id === id ? prev : g)));
        return fail(err, what);
      }
      return true;
    },
    [groups, fail],
  );

  const renameGroup = useCallback<DataApi["renameGroup"]>(
    (id, name) => patchGroup(id, { name: name.trim() }, "Guruh nomi o'zgarmadi"),
    [patchGroup],
  );

  const setGroupArchived = useCallback<DataApi["setGroupArchived"]>(
    (id, archived) =>
      patchGroup(
        id,
        { archived_at: archived ? new Date().toISOString() : null },
        archived ? "Guruh arxivlanmadi" : "Guruh qaytarilmadi",
      ),
    [patchGroup],
  );

  const deleteGroup = useCallback<DataApi["deleteGroup"]>(
    async (id) => {
      if (studentsHaveGroup(students, id)) {
        notify("Guruhda o'quvchilar bor. Avval ularni boshqa guruhga ko'chiring yoki o'chiring, yoki guruhni arxivlang.", {
          kind: "error",
        });
        return false;
      }
      const { error: err } = await getSupabase().from("groups").delete().eq("id", id);
      if (err) return fail(err, "Guruh o'chirilmadi");
      setGroups((gs) => gs.filter((g) => g.id !== id));
      return true;
    },
    [students, notify, fail],
  );

  // ---- students ----------------------------------------------------------

  const addStudent = useCallback<DataApi["addStudent"]>(
    async (name, groupId) => {
      const { data, error: err } = await getSupabase()
        .from("students")
        .insert({ name: name.trim(), group_id: groupId })
        .select(STUDENT_COLS)
        .single();
      if (err || !data) {
        fail(err, "O'quvchi qo'shilmadi");
        return null;
      }
      setStudents((ss) => [...ss, data as Student]);
      return data as Student;
    },
    [fail],
  );

  const patchStudent = useCallback(
    async (id: string, patch: Partial<Student>, what: string) => {
      const prev = students.find((s) => s.id === id);
      setStudents((ss) => ss.map((s) => (s.id === id ? { ...s, ...patch } : s)));
      const { error: err } = await getSupabase().from("students").update(patch).eq("id", id);
      if (err) {
        if (prev) setStudents((ss) => ss.map((s) => (s.id === id ? prev : s)));
        return fail(err, what);
      }
      return true;
    },
    [students, fail],
  );

  const updateStudent = useCallback<DataApi["updateStudent"]>(
    (id, patch) =>
      patchStudent(
        id,
        { ...patch, ...(patch.name !== undefined ? { name: patch.name.trim() } : {}) },
        "O'zgarishlar saqlanmadi",
      ),
    [patchStudent],
  );

  const setStudentArchived = useCallback<DataApi["setStudentArchived"]>(
    (id, archived) =>
      patchStudent(
        id,
        { archived_at: archived ? new Date().toISOString() : null },
        archived ? "O'quvchi arxivlanmadi" : "O'quvchi qaytarilmadi",
      ),
    [patchStudent],
  );

  const deleteStudent = useCallback<DataApi["deleteStudent"]>(
    async (id) => {
      const { error: err } = await getSupabase().from("students").delete().eq("id", id);
      if (err) return fail(err, "O'quvchi o'chirilmadi");
      setStudents((ss) => ss.filter((s) => s.id !== id));
      setTopics((ts) => ts.filter((t) => t.student_id !== id));
      setLessons((ls) => ls.filter((l) => l.student_id !== id));
      return true;
    },
    [fail],
  );

  // ---- topics ------------------------------------------------------------

  const addTopics = useCallback<DataApi["addTopics"]>(
    async (studentId, titles) => {
      const clean = titles.map((t) => t.trim()).filter(Boolean);
      if (!clean.length) return true;
      const last = topicsRef.current
        .filter((t) => t.student_id === studentId)
        .reduce((max, t) => Math.max(max, t.position), 0);
      const rows = clean.map((title, i) => ({
        student_id: studentId,
        title,
        position: last + i + 1,
      }));
      const { data, error: err } = await getSupabase()
        .from("topics")
        .insert(rows)
        .select(TOPIC_COLS);
      if (err || !data) return fail(err, "Mavzular qo'shilmadi");
      setTopics((ts) => [...ts, ...(data as Topic[])]);
      return true;
    },
    [fail],
  );

  const renameTopic = useCallback<DataApi["renameTopic"]>(
    async (id, title) => {
      const clean = title.trim();
      if (!clean) return false;
      const prev = topicsRef.current.find((t) => t.id === id);
      setTopics((ts) => ts.map((t) => (t.id === id ? { ...t, title: clean } : t)));
      const { error: err } = await getSupabase().from("topics").update({ title: clean }).eq("id", id);
      if (err) {
        if (prev) setTopics((ts) => ts.map((t) => (t.id === id ? prev : t)));
        return fail(err, "Mavzu nomi o'zgarmadi");
      }
      return true;
    },
    [fail],
  );

  const removeTopic = useCallback<DataApi["removeTopic"]>(
    async (id) => {
      const prev = topicsRef.current.find((t) => t.id === id);
      setTopics((ts) => ts.filter((t) => t.id !== id));
      const { error: err } = await getSupabase().from("topics").delete().eq("id", id);
      if (err) {
        if (prev) setTopics((ts) => [...ts, prev]);
        return fail(err, "Mavzu o'chirilmadi");
      }
      // lessons keep their title snapshot; the DB sets topic_id to null
      setLessons((ls) => ls.map((l) => (l.topic_id === id ? { ...l, topic_id: null } : l)));
      return true;
    },
    [fail],
  );

  const moveTopic = useCallback<DataApi["moveTopic"]>(
    async (studentId, id, direction) => {
      const before = topicsRef.current;
      const list = sortTopics(before.filter((t) => t.student_id === studentId));
      const i = list.findIndex((t) => t.id === id);
      const j = i + direction;
      if (i < 0 || j < 0 || j >= list.length) return true;
      [list[i], list[j]] = [list[j], list[i]];
      const renumbered = list.map((t, idx) => ({ ...t, position: idx + 1 }));

      setTopics((ts) => [...ts.filter((t) => t.student_id !== studentId), ...renumbered]);
      const { error: err } = await getSupabase()
        .from("topics")
        .upsert(renumbered.map(({ id: tid, student_id, title, position }) => ({ id: tid, student_id, title, position })));
      if (err) {
        setTopics(before);
        return fail(err, "Tartib o'zgarmadi");
      }
      return true;
    },
    [fail],
  );

  // ---- derived -----------------------------------------------------------

  const activeGroups = useMemo(() => groups.filter((g) => !g.archived_at), [groups]);
  const activeStudents = useMemo(() => {
    const ids = new Set(activeGroups.map((g) => g.id));
    return students.filter((s) => !s.archived_at && ids.has(s.group_id));
  }, [students, activeGroups]);
  const lessonsByStudent = useMemo(() => groupByStudent(lessons), [lessons]);
  const topicsByStudent = useMemo(() => {
    const map = new Map<string, Topic[]>();
    for (const t of topics) {
      const list = map.get(t.student_id);
      if (list) list.push(t);
      else map.set(t.student_id, [t]);
    }
    for (const [k, v] of map) map.set(k, sortTopics(v));
    return map;
  }, [topics]);

  const isSaving = useCallback((id: string) => saving.includes(id), [saving]);

  const value: DataApi = {
    status,
    error,
    reload,
    groups,
    students,
    topics,
    lessons,
    plans,
    activeGroups,
    activeStudents,
    lessonsByStudent,
    topicsByStudent,
    toast,
    notify,
    dismissToast,
    isSaving,
    pendingWrites,
    lastSavedAt,
    markLesson,
    markAttendanceBulk,
    savePlan,
    addGroup,
    renameGroup,
    setGroupArchived,
    deleteGroup,
    addStudent,
    updateStudent,
    setStudentArchived,
    deleteStudent,
    addTopics,
    renameTopic,
    removeTopic,
    moveTopic,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function studentsHaveGroup(students: Student[], groupId: string): boolean {
  return students.some((s) => s.group_id === groupId);
}
