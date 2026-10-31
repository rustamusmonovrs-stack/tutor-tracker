"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { getSupabase } from "../supabase/client";
import { useData } from "../data";
import {
  isSubjectKey,
  type SubjectGroup,
  type SubjectKey,
  type SubjectLesson,
  type SubjectRecord,
  type SubjectStudent,
} from "./types";

type Status = "loading" | "ready" | "error";

const GROUP_COLS = "id,subject,name,archived_at,created_at";
const STUDENT_COLS = "id,subject,group_id,name,english_student_id,archived_at,created_at";
const LESSON_COLS = "id,subject,group_id,lesson_date,topic,homework,has_test,test_title,test_max,updated_at";
const RECORD_COLS = "id,subject,group_id,lesson_id,student_id,attendance,homework,score,updated_at";

export interface LessonPatch {
  topic?: string;
  homework?: string;
  has_test?: boolean;
  test_title?: string;
  test_max?: number | null;
}
export interface RecordPatch {
  attendance?: SubjectRecord["attendance"];
  homework?: SubjectRecord["homework"];
  score?: number | null;
}

interface SubjectApi {
  status: Status;
  error: string | null;
  reload: () => Promise<void>;
  /** Everything loaded, ALL subjects. Pages must use useSubjectScope(), which filters by subject. */
  all: { groups: SubjectGroup[]; students: SubjectStudent[]; lessons: SubjectLesson[]; records: SubjectRecord[] };
  pendingWrites: number;
  lastSavedAt: number | null;

  addGroup: (subject: SubjectKey, name: string) => Promise<SubjectGroup | null>;
  renameGroup: (id: string, name: string) => Promise<boolean>;
  setGroupArchived: (id: string, archived: boolean) => Promise<boolean>;
  addStudent: (subject: SubjectKey, groupId: string, name: string, englishStudentId?: string | null) => Promise<SubjectStudent | null>;
  renameStudent: (id: string, name: string) => Promise<boolean>;
  /** Renames every membership row of one person in ONE statement, so a person can never end up half-renamed. */
  renameStudents: (ids: string[], name: string) => Promise<boolean>;
  setStudentArchived: (id: string, archived: boolean) => Promise<boolean>;
  saveLesson: (subject: SubjectKey, groupId: string, date: string, patch: LessonPatch) => Promise<boolean>;
  setRecord: (subject: SubjectKey, groupId: string, date: string, studentId: string, patch: RecordPatch) => Promise<boolean>;
  markAllPresent: (subject: SubjectKey, groupId: string, date: string, studentIds: string[]) => Promise<boolean>;
}

const Ctx = createContext<SubjectApi | null>(null);

export function useSubjectApi(): SubjectApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSubjectApi must be used inside <SubjectProvider>");
  return v;
}

function messageOf(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return "Noma'lum xatolik";
}

/** Friendly Uzbek text for the database rules we expect users to hit. */
export function friendlyError(raw: string): string {
  if (/subject_groups_active_name_uq/.test(raw)) return "Bu nomdagi faol guruh allaqachon bor";
  if (/subject_students_group_name_uq/.test(raw)) return "Bu o'quvchi guruhda allaqachon bor";
  if (/relation "public\.subject_|Could not find the table|schema cache/.test(raw))
    return "Fan jadvallari bazada topilmadi (migratsiya qo'llanmagan)";
  return raw;
}

async function fetchAll<T>(table: string, columns: string, orderBy = "created_at"): Promise<T[]> {
  const sb = getSupabase();
  const pageSize = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await sb.from(table).select(columns).order(orderBy).order("id").range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

const normGroup = (g: SubjectGroup): SubjectGroup => ({ ...g, archived_at: g.archived_at ?? null });
const normStudent = (s: SubjectStudent): SubjectStudent => ({ ...s, archived_at: s.archived_at ?? null, english_student_id: s.english_student_id ?? null });
const normLesson = (l: SubjectLesson): SubjectLesson => ({
  ...l,
  topic: l.topic ?? null,
  homework: l.homework ?? null,
  has_test: Boolean(l.has_test),
  test_title: l.test_title ?? null,
  test_max: l.test_max ?? null,
});
const normRecord = (r: SubjectRecord): SubjectRecord => ({
  ...r,
  attendance: r.attendance ?? null,
  homework: r.homework ?? null,
  score: r.score ?? null,
});

export function SubjectProvider({ children }: { children: ReactNode }) {
  const { notify } = useData();
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<SubjectGroup[]>([]);
  const [students, setStudents] = useState<SubjectStudent[]>([]);
  const [lessons, setLessons] = useState<SubjectLesson[]>([]);
  const [records, setRecords] = useState<SubjectRecord[]>([]);
  const [pendingWrites, setPendingWrites] = useState(0);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  const lessonsRef = useRef(lessons);
  const recordsRef = useRef(records);
  const studentsRef = useRef(students);
  useEffect(() => {
    lessonsRef.current = lessons;
    recordsRef.current = records;
    studentsRef.current = students;
  });
  const lessonQueue = useRef(new Map<string, Promise<SubjectLesson | null>>());

  const reload = useCallback(async () => {
    setStatus((s) => (s === "ready" ? s : "loading"));
    try {
      const [g, s, l, r] = await Promise.all([
        fetchAll<SubjectGroup>("subject_groups", GROUP_COLS),
        fetchAll<SubjectStudent>("subject_students", STUDENT_COLS),
        fetchAll<SubjectLesson>("subject_lessons", LESSON_COLS),
        fetchAll<SubjectRecord>("subject_records", RECORD_COLS, "updated_at"),
      ]);
      setGroups(g.map(normGroup));
      setStudents(s.map(normStudent));
      setLessons(l.map(normLesson));
      setRecords(r.map(normRecord));
      setError(null);
      setStatus("ready");
    } catch (e) {
      setError(friendlyError(messageOf(e)));
      setStatus("error");
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);

  const fail = useCallback(
    (e: unknown, what: string) => {
      notify(`${what}: ${friendlyError(messageOf(e))}`, { kind: "error" });
      return false as const;
    },
    [notify],
  );
  const begin = () => setPendingWrites((n) => n + 1);
  const end = (ok: boolean) => {
    setPendingWrites((n) => Math.max(0, n - 1));
    if (ok) setLastSavedAt(Date.now());
  };

  // ---- groups ------------------------------------------------------------

  const addGroup = useCallback<SubjectApi["addGroup"]>(
    async (subject, name) => {
      begin();
      const { data, error: err } = await getSupabase().from("subject_groups").insert({ subject, name: name.trim() }).select(GROUP_COLS).single();
      end(!err);
      if (err || !data) {
        fail(err, "Guruh qo'shilmadi");
        return null;
      }
      const g = normGroup(data as SubjectGroup);
      setGroups((gs) => [...gs, g]);
      return g;
    },
    [fail],
  );

  const patchGroup = useCallback(
    async (id: string, patch: Partial<SubjectGroup>, what: string) => {
      begin();
      const { error: err } = await getSupabase().from("subject_groups").update(patch).eq("id", id);
      end(!err);
      if (err) return fail(err, what);
      setGroups((gs) => gs.map((g) => (g.id === id ? { ...g, ...patch } : g)));
      return true;
    },
    [fail],
  );
  const renameGroup = useCallback<SubjectApi["renameGroup"]>((id, name) => patchGroup(id, { name: name.trim() }, "Guruh nomi o'zgarmadi"), [patchGroup]);
  const setGroupArchived = useCallback<SubjectApi["setGroupArchived"]>(
    (id, archived) => patchGroup(id, { archived_at: archived ? new Date().toISOString() : null }, "Guruh holati o'zgarmadi"),
    [patchGroup],
  );

  // ---- students ----------------------------------------------------------

  const addStudent = useCallback<SubjectApi["addStudent"]>(
    async (subject, groupId, name, englishStudentId) => {
      begin();
      const { data, error: err } = await getSupabase()
        .from("subject_students")
        .insert({ subject, group_id: groupId, name: name.trim(), english_student_id: englishStudentId ?? null })
        .select(STUDENT_COLS)
        .single();
      end(!err);
      if (err || !data) {
        fail(err, "O'quvchi qo'shilmadi");
        return null;
      }
      const s = normStudent(data as SubjectStudent);
      setStudents((ss) => [...ss, s]);
      return s;
    },
    [fail],
  );

  const patchStudent = useCallback(
    async (id: string, patch: Partial<SubjectStudent>, what: string) => {
      begin();
      const { error: err } = await getSupabase().from("subject_students").update(patch).eq("id", id);
      end(!err);
      if (err) return fail(err, what);
      setStudents((ss) => ss.map((s) => (s.id === id ? { ...s, ...patch } : s)));
      return true;
    },
    [fail],
  );
  const renameStudent = useCallback<SubjectApi["renameStudent"]>((id, name) => patchStudent(id, { name: name.trim() }, "Ism o'zgarmadi"), [patchStudent]);
  const renameStudents = useCallback<SubjectApi["renameStudents"]>(
    async (ids, name) => {
      if (ids.length === 0) return true;
      const clean = name.trim();
      begin();
      const { error: err } = await getSupabase().from("subject_students").update({ name: clean }).in("id", ids);
      end(!err);
      if (err) return fail(err, "Ism o'zgarmadi");
      const set = new Set(ids);
      setStudents((ss) => ss.map((s) => (set.has(s.id) ? { ...s, name: clean } : s)));
      return true;
    },
    [fail],
  );
  const setStudentArchived = useCallback<SubjectApi["setStudentArchived"]>(
    (id, archived) => patchStudent(id, { archived_at: archived ? new Date().toISOString() : null }, "O'quvchi holati o'zgarmadi"),
    [patchStudent],
  );

  // ---- lessons + records -------------------------------------------------

  /** One lesson row per (group, date). Concurrent callers share one request, so a lesson is never created twice. */
  const ensureLesson = useCallback((subject: SubjectKey, groupId: string, date: string): Promise<SubjectLesson | null> => {
    const existing = lessonsRef.current.find((l) => l.group_id === groupId && l.lesson_date === date);
    if (existing) return Promise.resolve(existing);
    const key = `${groupId}|${date}`;
    const inflight = lessonQueue.current.get(key);
    if (inflight) return inflight;
    const p = (async () => {
      const { data, error: err } = await getSupabase()
        .from("subject_lessons")
        .upsert({ subject, group_id: groupId, lesson_date: date }, { onConflict: "group_id,lesson_date" })
        .select(LESSON_COLS)
        .single();
      if (err || !data) throw err ?? new Error("Dars yaratilmadi");
      const l = normLesson(data as SubjectLesson);
      lessonsRef.current = [...lessonsRef.current.filter((x) => x.id !== l.id), l];
      setLessons((ls) => [...ls.filter((x) => x.id !== l.id), l]);
      return l;
    })().finally(() => lessonQueue.current.delete(key));
    lessonQueue.current.set(key, p);
    return p;
  }, []);

  const saveLesson = useCallback<SubjectApi["saveLesson"]>(
    async (subject, groupId, date, patch) => {
      begin();
      try {
        const lesson = await ensureLesson(subject, groupId, date);
        if (!lesson) throw new Error("Dars topilmadi");
        const row: Record<string, unknown> = {};
        if (patch.topic !== undefined) row.topic = patch.topic.trim() || null;
        if (patch.homework !== undefined) row.homework = patch.homework.trim() || null;
        if (patch.test_title !== undefined) row.test_title = patch.test_title.trim() || null;
        // test_max first, so `has_test = true` never reaches the database without a maximum
        if (patch.test_max !== undefined) row.test_max = patch.test_max;
        if (patch.has_test !== undefined) row.has_test = patch.has_test;
        if (!Object.keys(row).length) {
          end(true);
          return true;
        }
        const { data, error: err } = await getSupabase().from("subject_lessons").update(row).eq("id", lesson.id).select(LESSON_COLS).single();
        if (err || !data) throw err ?? new Error("Saqlanmadi");
        const l = normLesson(data as SubjectLesson);
        lessonsRef.current = lessonsRef.current.map((x) => (x.id === l.id ? l : x));
        setLessons((ls) => ls.map((x) => (x.id === l.id ? l : x)));
        end(true);
        return true;
      } catch (e) {
        end(false);
        return fail(e, "Dars ma'lumoti saqlanmadi");
      }
    },
    [ensureLesson, fail],
  );

  const setRecord = useCallback<SubjectApi["setRecord"]>(
    async (subject, groupId, date, studentId, patch) => {
      begin();
      let lesson: SubjectLesson | null = null;
      try {
        lesson = await ensureLesson(subject, groupId, date);
      } catch (e) {
        end(false);
        return fail(e, "Saqlanmadi");
      }
      if (!lesson) {
        end(false);
        return false;
      }
      const lessonId = lesson.id;
      const before = recordsRef.current.find((r) => r.lesson_id === lessonId && r.student_id === studentId);
      const optimistic: SubjectRecord = {
        id: before?.id ?? `tmp-${crypto.randomUUID()}`,
        subject,
        group_id: groupId,
        lesson_id: lessonId,
        student_id: studentId,
        attendance: before?.attendance ?? null,
        homework: before?.homework ?? null,
        score: before?.score ?? null,
        updated_at: new Date().toISOString(),
        ...patch,
      };
      const put = (r: SubjectRecord) => {
        recordsRef.current = [...recordsRef.current.filter((x) => !(x.lesson_id === lessonId && x.student_id === studentId)), r];
        setRecords(recordsRef.current);
      };
      put(optimistic);
      // Only the changed columns are sent: ON CONFLICT updates just those, other marks stay as they were.
      const { data, error: err } = await getSupabase()
        .from("subject_records")
        .upsert(
          { subject, group_id: groupId, lesson_id: lessonId, student_id: studentId, ...patch },
          { onConflict: "lesson_id,student_id" },
        )
        .select(RECORD_COLS)
        .single();
      end(!(err || !data));
      if (err || !data) {
        if (before) put(before);
        else {
          recordsRef.current = recordsRef.current.filter((x) => x.id !== optimistic.id);
          setRecords(recordsRef.current);
        }
        return fail(err, "O'zgarish saqlanmadi");
      }
      put(normRecord({ ...optimistic, ...(data as SubjectRecord) }));
      return true;
    },
    [ensureLesson, fail],
  );

  const markAllPresent = useCallback<SubjectApi["markAllPresent"]>(
    async (subject, groupId, date, studentIds) => {
      // Never overwrite what the teacher already marked.
      const lesson = lessonsRef.current.find((l) => l.group_id === groupId && l.lesson_date === date);
      const todo = studentIds.filter(
        (id) => !lesson || !recordsRef.current.some((r) => r.lesson_id === lesson.id && r.student_id === id && r.attendance !== null),
      );
      let ok = true;
      for (const id of todo) ok = (await setRecord(subject, groupId, date, id, { attendance: "present" })) && ok;
      return ok;
    },
    [setRecord],
  );

  const value = useMemo<SubjectApi>(
    () => ({
      status, error, reload,
      all: { groups, students, lessons, records },
      pendingWrites, lastSavedAt,
      addGroup, renameGroup, setGroupArchived, addStudent, renameStudent, renameStudents, setStudentArchived,
      saveLesson, setRecord, markAllPresent,
    }),
    [status, error, reload, groups, students, lessons, records, pendingWrites, lastSavedAt, addGroup, renameGroup, setGroupArchived, addStudent, renameStudent, renameStudents, setStudentArchived, saveLesson, setRecord, markAllPresent],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The subject of the current URL (/math, /history). Validated; the route layout 404s anything else. */
export function useSubjectKey(): SubjectKey {
  const params = useParams<{ subject: string }>();
  if (!isSubjectKey(params.subject)) throw new Error("Noma'lum fan");
  return params.subject;
}

/** Data of ONE subject only. Every page reads through this, so nothing can leak across subjects. */
export function useSubjectScope() {
  const subject = useSubjectKey();
  const api = useSubjectApi();
  const { all } = api;
  return useMemo(() => {
    const groups = all.groups.filter((g) => g.subject === subject);
    const students = all.students.filter((s) => s.subject === subject);
    const lessons = all.lessons.filter((l) => l.subject === subject);
    const records = all.records.filter((r) => r.subject === subject);
    const activeGroups = groups.filter((g) => !g.archived_at);
    const activeStudents = students.filter((s) => !s.archived_at && activeGroups.some((g) => g.id === s.group_id));
    return { subject, api, groups, students, lessons, records, activeGroups, activeStudents };
  }, [subject, api, all]);
}
