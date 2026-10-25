"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useData } from "./data";
import {
  sortBooks,
  sortStints,
  PROGRAM_SIZE,
  type Book,
  type BookStint,
  type GroupTransfer,
  type Level,
  type Outcome,
  type Progress,
} from "./stages";
import { getSupabase } from "./supabase/client";

const BOOK_COLS = "id,position,title,level,avg_weeks,planned_lessons,active";
const PROGRESS_COLS = "id,student_id,level,lessons_per_week,teacher_note,next_goal";
const STINT_COLS = "id,student_id,book_id,group_id,level,started_on,finished_on,outcome,created_at";
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
}

export interface FinishArgs {
  stintId: string;
  finishedOn: string;
  outcome: Outcome;
  nextBookId?: string | null;
  nextLevel?: Level | null;
  nextStartedOn?: string | null;
}

interface StagesApi {
  status: "loading" | "ready" | "error";
  error: string | null;
  reload: () => Promise<void>;
  books: Book[];
  bookById: Map<string, Book>;
  progressByStudent: Map<string, Progress>;
  stintsByStudent: Map<string, BookStint[]>;
  transfersByStudent: Map<string, GroupTransfer[]>;

  seedBooks: () => Promise<boolean>;
  saveBook: (id: string, patch: BookPatch) => Promise<boolean>;
  moveBook: (id: string, direction: -1 | 1) => Promise<boolean>;
  deleteBook: (id: string) => Promise<boolean>;
  /** Book is referenced by history, so it may only be deactivated, never deleted. */
  bookInUse: (id: string) => boolean;

  setStage: (studentIds: string[], bookId: string, level: Level, startedOn: string, dates?: Record<string, string>) => Promise<boolean>;
  finishBook: (args: FinishArgs) => Promise<boolean>;
  transferStudent: (studentId: string, groupId: string, note?: string) => Promise<boolean>;
  saveSettings: (studentId: string, patch: { lessons_per_week?: number | null; teacher_note?: string | null; next_goal?: string | null }) => Promise<boolean>;
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
  const [books, setBooks] = useState<Book[]>([]);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [stints, setStints] = useState<BookStint[]>([]);
  const [transfers, setTransfers] = useState<GroupTransfer[]>([]);

  const reload = useCallback(async () => {
    try {
      const [b, p, h, t] = await Promise.all([
        fetchAll<Book>("curriculum_books", BOOK_COLS),
        fetchAll<Progress>("student_learning_progress", PROGRESS_COLS),
        fetchAll<BookStint>("student_book_history", STINT_COLS),
        fetchAll<GroupTransfer>("student_group_transfer_history", TRANSFER_COLS),
      ]);
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

  const seedBooks = useCallback<StagesApi["seedBooks"]>(async () => {
    if (books.length) return true;
    const rows = Array.from({ length: PROGRAM_SIZE }, (_, i) => ({ position: i + 1, title: `${i + 1}-kitob` }));
    const { error: err } = await getSupabase().from("curriculum_books").insert(rows);
    if (err) return fail(err, "O'quv dasturi yaratilmadi");
    await reload();
    return true;
  }, [books.length, fail, reload]);

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

  const moveBook = useCallback<StagesApi["moveBook"]>(
    async (id, direction) => {
      const list = sortBooks(books);
      const i = list.findIndex((b) => b.id === id);
      const j = i + direction;
      if (i < 0 || j < 0 || j >= list.length) return true;
      const a = list[i];
      const b = list[j];
      const prev = books;
      setBooks(sortBooks(books.map((x) => (x.id === a.id ? { ...x, position: b.position } : x.id === b.id ? { ...x, position: a.position } : x))));
      // One statement; the unique(position) constraint is deferred, so the swap is valid.
      const { error: err } = await getSupabase()
        .from("curriculum_books")
        .upsert([
          { id: a.id, title: a.title, position: b.position },
          { id: b.id, title: b.title, position: a.position },
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
        notify("Bu kitob o'quvchilar tarixida ishlatilgan, o'chirib bo'lmaydi. Uni nofaol qiling.", { kind: "error" });
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
    async (studentIds, bookId, level, startedOn, dates) => {
      const { error: err } = await getSupabase().rpc("set_students_stage", {
        p_students: studentIds,
        p_book: bookId,
        p_level: level,
        p_started_on: startedOn,
        p_dates: dates ?? {},
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

  const value: StagesApi = {
    status,
    error,
    reload,
    books,
    bookById,
    progressByStudent,
    stintsByStudent,
    transfersByStudent,
    seedBooks,
    saveBook,
    moveBook,
    deleteBook,
    bookInUse,
    setStage,
    finishBook,
    transferStudent,
    saveSettings,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
