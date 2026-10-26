"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useData } from "./data";
import {
  DEFAULT_PROGRAMS,
  sortBooks,
  sortStints,
  type Book,
  type BookStint,
  type GroupTransfer,
  type Level,
  type Outcome,
  type Program,
  type Progress,
  type SaturdayPlan,
  type StudentProgram,
  type Track,
} from "./stages";
import { getSupabase } from "./supabase/client";

const PROGRAM_COLS = "id,key,name,position";
const BOOK_COLS = "id,program_id,position,title,level,avg_weeks,planned_lessons,active,archived_at";
const TRACK_COLS = "id,student_id,program_id,track";
const PLAN_COLS = "id,scope,program_id,group_id,student_id,on_date,mode,note";
const PROGRESS_COLS = "id,student_id,level,lessons_per_week,teacher_note,next_goal";
const STINT_COLS = "id,student_id,book_id,program_id,group_id,level,started_on,finished_on,outcome,created_at";
const TRANSFER_COLS = "id,student_id,from_group_id,to_group_id,transferred_at,note";

function messageOf(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return "Noma'lum xatolik";
}

/** Server-side guard messages -> friendly Uzbek. */
function friendly(e: unknown): string {
  const m = messageOf(e);
  if (m.includes("book already finished")) return "Bu kitob allaqachon tugatilgan (ikki marta bosilgan bo'lishi mumkin).";
  if (m.includes("finish date is before")) return "Tugatish sanasi boshlanish sanasidan oldin bo'lishi mumkin emas.";
  if (m.includes("finish date is in the future")) return "Tugatish sanasi kelajakda bo'lishi mumkin emas.";
  if (m.includes("next book start date")) return "Yangi kitob sanasi tugatish sanasidan oldin bo'lishi mumkin emas.";
  if (m.includes("next book is required")) return "Keyingi kitobni tanlang.";
  if (m.includes("next book must belong")) return "Keyingi kitob shu o'quv dasturidan bo'lishi kerak.";
  if (m.includes("already has another primary")) return "O'quvchining asosiy dasturi boshqa. Qo'shimcha yo'nalish sifatida biriktiring yoki avval eski dasturni yakunlang.";
  if (m.includes("needs a primary program")) return "Avval o'quvchiga asosiy dasturni biriktiring.";
  if (m.includes("already has an additional")) return "O'quvchida allaqachon qo'shimcha yo'nalish bor.";
  if (m.includes("already in this program as")) return "O'quvchi bu dasturda boshqa maqomda (asosiy/qo'shimcha).";
  if (m.includes("finish the active book first")) return "Avval shu dasturdagi faol kitobni tugating.";
  if (m.includes("remove the additional track")) return "Avval qo'shimcha yo'nalishni olib tashlang.";
  if (m.includes("book is archived") || m.includes("next book is archived")) return "Kitob arxivlangan.";
  if (m.includes("program cannot change")) return "Kitob tarixda ishlatilgan, dasturini o'zgartirib bo'lmaydi.";
  if (m.includes("already in this group")) return "O'quvchi allaqachon shu guruhda.";
  if (m.includes("already has a finished program")) return "Bu o'quvchi dasturni yakunlagan; qayta joylashtirib bo'lmaydi.";
  return m;
}

async function fetchAll<T>(table: string, columns: string): Promise<T[]> {
  const sb = getSupabase();
  const pageSize = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await sb
      .from(table)
      .select(columns)
      .order("id")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

export interface BookPatch {
  title?: string;
  level?: Level | null;
  avg_weeks?: number | null;
  planned_lessons?: number | null;
  active?: boolean;
  archived_at?: string | null;
}

export interface NewBook {
  title: string;
  level: Level | null;
  avg_weeks: number | null;
  planned_lessons: number | null;
  active: boolean;
}

export interface FinishArgs {
  stintId: string;
  finishedOn: string;
  outcome: Outcome;
  nextBookId?: string | null;
  nextLevel?: Level | null;
  nextStartedOn?: string | null;
}

export interface PlanInput {
  scope: SaturdayPlan["scope"];
  program_id?: string | null;
  group_id?: string | null;
  student_id?: string | null;
  on_date?: string | null;
  mode: SaturdayPlan["mode"];
  note?: string | null;
}

/** One program a student studies in: the program, its books and the student's stints inside it. */
export interface TrackScope {
  track: Track;
  program: Program;
  books: Book[];
  stints: BookStint[];
}

interface StagesApi {
  status: "loading" | "ready" | "error";
  error: string | null;
  reload: () => Promise<void>;
  programs: Program[];
  programById: Map<string, Program>;
  books: Book[];
  bookById: Map<string, Book>;
  booksOf: (programId: string) => Book[];
  progressByStudent: Map<string, Progress>;
  stintsByStudent: Map<string, BookStint[]>;
  transfersByStudent: Map<string, GroupTransfer[]>;
  tracksByStudent: Map<string, StudentProgram[]>;
  plans: SaturdayPlan[];
  /** Primary track first, then the additional one. Students with no program have none. */
  scopesOf: (studentId: string) => TrackScope[];

  addBook: (programId: string, input: NewBook) => Promise<boolean>;
  saveBook: (id: string, patch: BookPatch) => Promise<boolean>;
  moveBook: (id: string, direction: -1 | 1) => Promise<boolean>;
  archiveBook: (id: string, archived: boolean) => Promise<boolean>;
  deleteBook: (id: string) => Promise<boolean>;
  /** Book is referenced by history, so it may only be deactivated / archived, never deleted. */
  bookInUse: (id: string) => boolean;

  setStage: (studentIds: string[], bookId: string, level: Level, startedOn: string, dates?: Record<string, string>, track?: Track) => Promise<boolean>;
  finishBook: (args: FinishArgs) => Promise<boolean>;
  removeProgram: (studentId: string, programId: string) => Promise<boolean>;
  transferStudent: (studentId: string, groupId: string, note?: string) => Promise<boolean>;
  saveSettings: (studentId: string, patch: { lessons_per_week?: number | null; teacher_note?: string | null; next_goal?: string | null }) => Promise<boolean>;

  savePlan: (input: PlanInput) => Promise<boolean>;
  deletePlan: (id: string) => Promise<boolean>;
}

const Ctx = createContext<StagesApi | null>(null);

export function useStages(): StagesApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStages must be used inside <StagesProvider>");
  return v;
}

export function StagesProvider({ children }: { children: ReactNode }) {
  const { notify, reload: reloadJournal } = useData();
  const [status, setStatus] = useState<StagesApi["status"]>("loading");
  const [error, setError] = useState<string | null>(null);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [tracks, setTracks] = useState<StudentProgram[]>([]);
  const [plans, setPlans] = useState<SaturdayPlan[]>([]);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [stints, setStints] = useState<BookStint[]>([]);
  const [transfers, setTransfers] = useState<GroupTransfer[]>([]);

  const reload = useCallback(async () => {
    try {
      let progs = await fetchAll<Program>("curriculum_programs", PROGRAM_COLS);
      const missing = DEFAULT_PROGRAMS.filter((d) => !progs.some((p) => p.key === d.key));
      if (missing.length) {
        // The three programs exist for every owner; a duplicate-insert race is harmless (unique owner+key).
        await getSupabase().from("curriculum_programs").insert(missing);
        progs = await fetchAll<Program>("curriculum_programs", PROGRAM_COLS);
      }
      const [b, p, h, t, tr, pl] = await Promise.all([
        fetchAll<Book>("curriculum_books", BOOK_COLS),
        fetchAll<Progress>("student_learning_progress", PROGRESS_COLS),
        fetchAll<BookStint>("student_book_history", STINT_COLS),
        fetchAll<GroupTransfer>("student_group_transfer_history", TRANSFER_COLS),
        fetchAll<StudentProgram>("student_programs", TRACK_COLS),
        fetchAll<SaturdayPlan>("saturday_plans", PLAN_COLS),
      ]);
      setPrograms([...progs].sort((x, y) => x.position - y.position));
      setTracks(tr);
      setPlans(pl);
      setBooks(sortBooks(b));
      setProgress(p);
      setStints(h);
      setTransfers(t);
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

  const fail = useCallback(
    (e: unknown, what: string) => {
      notify(`${what}: ${friendly(e)}`, { kind: "error" });
      return false as const;
    },
    [notify],
  );

  // ---- curriculum ----------------------------------------------------------

  const addBook = useCallback<StagesApi["addBook"]>(
    async (programId, input) => {
      const title = input.title.trim();
      if (!title) {
        notify("Kitob nomini kiriting.", { kind: "error" });
        return false;
      }
      const position = books.filter((b) => b.program_id === programId).reduce((m, b) => Math.max(m, b.position), 0) + 1;
      const { error: err } = await getSupabase()
        .from("curriculum_books")
        .insert({ program_id: programId, position, title, level: input.level, avg_weeks: input.avg_weeks, planned_lessons: input.planned_lessons, active: input.active });
      if (err) return fail(err, "Kitob qo'shilmadi");
      await reload();
      return true;
    },
    [books, notify, fail, reload],
  );

  const saveBook = useCallback<StagesApi["saveBook"]>(
    async (id, patch) => {
      const clean = { ...patch, ...(patch.title !== undefined ? { title: patch.title.trim() } : {}), updated_at: new Date().toISOString() };
      const prev = books;
      setBooks((bs) => bs.map((b) => (b.id === id ? { ...b, ...clean } : b)));
      const { error: err } = await getSupabase().from("curriculum_books").update(clean).eq("id", id);
      if (err) {
        setBooks(prev);
        return fail(err, "Kitob saqlanmadi");
      }
      return true;
    },
    [books, fail],
  );

  const archiveBook = useCallback<StagesApi["archiveBook"]>(
    (id, archived) => saveBook(id, { archived_at: archived ? new Date().toISOString() : null }),
    [saveBook],
  );

  const moveBook = useCallback<StagesApi["moveBook"]>(
    async (id, direction) => {
      const self = books.find((b) => b.id === id);
      if (!self) return true;
      // neighbours inside the same program only (archived books stay out of the way)
      const list = sortBooks(books.filter((b) => b.program_id === self.program_id && !b.archived_at));
      const i = list.findIndex((b) => b.id === id);
      const j = i + direction;
      if (i < 0 || j < 0 || j >= list.length) return true;
      const a = list[i];
      const b = list[j];
      const prev = books;
      setBooks(sortBooks(books.map((x) => (x.id === a.id ? { ...x, position: b.position } : x.id === b.id ? { ...x, position: a.position } : x))));
      // One statement; unique(program_id, position) is deferred, so the swap is valid.
      const { error: err } = await getSupabase()
        .from("curriculum_books")
        .upsert([
          { id: a.id, program_id: a.program_id, title: a.title, position: b.position },
          { id: b.id, program_id: b.program_id, title: b.title, position: a.position },
        ]);
      if (err) {
        setBooks(prev);
        return fail(err, "Tartib o'zgarmadi");
      }
      return true;
    },
    [books, fail],
  );

  const bookInUse = useCallback((id: string) => stints.some((s) => s.book_id === id), [stints]);

  const deleteBook = useCallback<StagesApi["deleteBook"]>(
    async (id) => {
      if (stints.some((s) => s.book_id === id)) {
        notify("Bu kitob o'quvchilar tarixida ishlatilgan, o'chirib bo'lmaydi. Uni arxivlang.", { kind: "error" });
        return false;
      }
      const { error: err } = await getSupabase().from("curriculum_books").delete().eq("id", id);
      if (err) return fail(err, "Kitob o'chirilmadi");
      setBooks((bs) => bs.filter((b) => b.id !== id));
      return true;
    },
    [stints, notify, fail],
  );

  // ---- student stages (atomic RPCs) -----------------------------------------

  const setStage = useCallback<StagesApi["setStage"]>(
    async (studentIds, bookId, level, startedOn, dates, track = "primary") => {
      const { error: err } = await getSupabase().rpc("set_students_stage", {
        p_students: studentIds,
        p_book: bookId,
        p_level: level,
        p_started_on: startedOn,
        p_dates: dates ?? {},
        p_track: track,
      });
      if (err) return fail(err, "Bosqich saqlanmadi");
      await reload();
      return true;
    },
    [fail, reload],
  );

  const finishBook = useCallback<StagesApi["finishBook"]>(
    async (a) => {
      const { error: err } = await getSupabase().rpc("finish_student_book", {
        p_history: a.stintId,
        p_finished_on: a.finishedOn,
        p_outcome: a.outcome,
        p_next_book: a.nextBookId ?? null,
        p_next_level: a.nextLevel ?? null,
        p_next_started_on: a.nextStartedOn ?? null,
      });
      if (err) {
        // The row may have been finished by an earlier click: refresh so the UI shows the truth.
        await reload();
        return fail(err, "Kitob tugatilmadi");
      }
      await reload();
      return true;
    },
    [fail, reload],
  );

  const removeProgram = useCallback<StagesApi["removeProgram"]>(
    async (studentId, programId) => {
      const { error: err } = await getSupabase().rpc("remove_student_program", { p_student: studentId, p_program: programId });
      if (err) return fail(err, "Dastur olib tashlanmadi");
      await reload();
      return true;
    },
    [fail, reload],
  );

  const transferStudent = useCallback<StagesApi["transferStudent"]>(
    async (studentId, groupId, note) => {
      const { error: err } = await getSupabase().rpc("transfer_student", {
        p_student: studentId,
        p_group: groupId,
        p_note: note ?? null,
      });
      if (err) return fail(err, "Guruh o'zgarmadi");
      await Promise.all([reload(), reloadJournal()]);
      return true;
    },
    [fail, reload, reloadJournal],
  );

  const saveSettings = useCallback<StagesApi["saveSettings"]>(
    async (studentId, patch) => {
      const norm = (v: string | null | undefined) => (v == null ? v : v.trim() || null);
      const row: Record<string, unknown> = { student_id: studentId, updated_at: new Date().toISOString() };
      if (patch.lessons_per_week !== undefined) row.lessons_per_week = patch.lessons_per_week;
      if (patch.teacher_note !== undefined) row.teacher_note = norm(patch.teacher_note);
      if (patch.next_goal !== undefined) row.next_goal = norm(patch.next_goal);
      const { error: err } = await getSupabase().from("student_learning_progress").upsert(row, { onConflict: "student_id" });
      if (err) return fail(err, "Saqlanmadi");
      await reload();
      return true;
    },
    [fail, reload],
  );

  const savePlan = useCallback<StagesApi["savePlan"]>(
    async (input) => {
      const row = {
        scope: input.scope,
        program_id: input.program_id ?? null,
        group_id: input.group_id ?? null,
        student_id: input.student_id ?? null,
        on_date: input.on_date ?? null,
        mode: input.mode,
        note: input.note?.trim() || null,
      };
      const existing = plans.find(
        (p) => p.scope === row.scope && p.program_id === row.program_id && p.group_id === row.group_id && p.student_id === row.student_id && p.on_date === row.on_date,
      );
      const sb = getSupabase();
      const { error: err } = existing
        ? await sb.from("saturday_plans").update({ mode: row.mode, note: row.note, updated_at: new Date().toISOString() }).eq("id", existing.id)
        : await sb.from("saturday_plans").insert(row);
      if (err) return fail(err, "Shanba rejimi saqlanmadi");
      await reload();
      return true;
    },
    [plans, fail, reload],
  );

  const deletePlan = useCallback<StagesApi["deletePlan"]>(
    async (id) => {
      const { error: err } = await getSupabase().from("saturday_plans").delete().eq("id", id);
      if (err) return fail(err, "Qoida o'chirilmadi");
      setPlans((ps) => ps.filter((p) => p.id !== id));
      return true;
    },
    [fail],
  );

  const programById = useMemo(() => new Map(programs.map((p) => [p.id, p])), [programs]);
  const booksOf = useCallback((programId: string) => sortBooks(books.filter((b) => b.program_id === programId)), [books]);
  const tracksByStudent = useMemo(() => {
    const map = new Map<string, StudentProgram[]>();
    for (const t of tracks) {
      const l = map.get(t.student_id);
      if (l) l.push(t);
      else map.set(t.student_id, [t]);
    }
    return map;
  }, [tracks]);
  const bookById = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);
  const progressByStudent = useMemo(() => new Map(progress.map((p) => [p.student_id, p])), [progress]);
  const stintsByStudent = useMemo(() => {
    const map = new Map<string, BookStint[]>();
    for (const s of stints) {
      const l = map.get(s.student_id);
      if (l) l.push(s);
      else map.set(s.student_id, [s]);
    }
    for (const [k, v] of map) map.set(k, sortStints(v));
    return map;
  }, [stints]);
  const transfersByStudent = useMemo(() => {
    const map = new Map<string, GroupTransfer[]>();
    for (const t of [...transfers].sort((a, b) => a.transferred_at.localeCompare(b.transferred_at))) {
      const l = map.get(t.student_id);
      if (l) l.push(t);
      else map.set(t.student_id, [t]);
    }
    return map;
  }, [transfers]);

  const scopesOf = useCallback(
    (studentId: string): TrackScope[] => {
      let rows = tracksByStudent.get(studentId) ?? [];
      const mine = stintsByStudent.get(studentId) ?? [];
      if (!rows.length && mine.length) {
        // history without an explicit track row: its program is the primary one
        rows = [{ id: "derived", student_id: studentId, program_id: mine[0].program_id, track: "primary" }];
      }
      return [...rows]
        .sort((a, b) => (a.track === b.track ? 0 : a.track === "primary" ? -1 : 1))
        .flatMap((r) => {
          const program = programById.get(r.program_id);
          return program ? [{ track: r.track, program, books: booksOf(program.id), stints: mine.filter((s) => s.program_id === program.id) }] : [];
        });
    },
    [tracksByStudent, stintsByStudent, programById, booksOf],
  );

  const value: StagesApi = {
    status,
    error,
    reload,
    programs,
    programById,
    books,
    bookById,
    booksOf,
    tracksByStudent,
    plans,
    scopesOf,
    progressByStudent,
    stintsByStudent,
    transfersByStudent,
    addBook,
    saveBook,
    moveBook,
    archiveBook,
    deleteBook,
    bookInUse,
    setStage,
    finishBook,
    removeProgram,
    transferStudent,
    saveSettings,
    savePlan,
    deletePlan,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
