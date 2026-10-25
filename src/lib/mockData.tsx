"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useData } from "./data";
import type { Mock, MockAttendance, MockPayment, MockResult, MockScore, MockSection } from "./mock";
import { getSupabase } from "./supabase/client";

const MOCK_COLS = "id,group_id,name,mock_date,status,completed_at,created_at";
const SECTION_COLS = "id,mock_id,position,name,total_questions";
const RESULT_COLS = "id,mock_id,student_id,attendance,payment";
const SCORE_COLS = "id,result_id,section_id,correct";

function messageOf(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return "Noma'lum xatolik";
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

export interface CreateMockArgs {
  groupId: string;
  name: string;
  date: string;
  sections: { name: string; total: number }[];
  studentIds: string[];
}

/** Mock data + writes. Reads/writes only the four mock_* tables; never touches journal tables. */
export function useMockStore() {
  const { notify } = useData();
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [mocks, setMocks] = useState<Mock[]>([]);
  const [sections, setSections] = useState<MockSection[]>([]);
  const [results, setResults] = useState<MockResult[]>([]);
  const [scores, setScores] = useState<MockScore[]>([]);
  const [pending, setPending] = useState(0);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const scoresRef = useRef(scores);
  useEffect(() => {
    scoresRef.current = scores;
  });

  const reload = useCallback(async () => {
    setStatus((s) => (s === "ready" ? s : "loading"));
    try {
      const [m, s, r, sc] = await Promise.all([
        fetchAll<Mock>("mocks", MOCK_COLS),
        fetchAll<MockSection>("mock_sections", SECTION_COLS),
        fetchAll<MockResult>("mock_student_results", RESULT_COLS),
        fetchAll<MockScore>("mock_section_scores", SCORE_COLS),
      ]);
      setMocks(m);
      setSections(s);
      setResults(r);
      setScores(sc);
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

  /** Wraps a write: counts it for the save chip and reports failures. */
  const track = useCallback(
    async (what: string, fn: () => Promise<unknown>): Promise<boolean> => {
      setPending((n) => n + 1);
      try {
        await fn();
        setLastSavedAt(Date.now());
        return true;
      } catch (e) {
        notify(`${what}: ${messageOf(e)}`, { kind: "error" });
        return false;
      } finally {
        setPending((n) => Math.max(0, n - 1));
      }
    },
    [notify],
  );

  const createMock = useCallback(
    async (a: CreateMockArgs): Promise<string | null> => {
      const sb = getSupabase();
      let mockId: string | null = null;
      const ok = await track("Mock yaratilmadi", async () => {
        const { data: m, error: e1 } = await sb
          .from("mocks")
          .insert({ group_id: a.groupId, name: a.name, mock_date: a.date })
          .select(MOCK_COLS)
          .single();
        if (e1) throw e1;
        mockId = (m as Mock).id;
        try {
          const { data: s, error: e2 } = await sb
            .from("mock_sections")
            .insert(a.sections.map((x, i) => ({ mock_id: mockId, position: i + 1, name: x.name, total_questions: x.total })))
            .select(SECTION_COLS);
          if (e2) throw e2;
          let r: MockResult[] = [];
          if (a.studentIds.length) {
            const { data, error: e3 } = await sb
              .from("mock_student_results")
              .insert(a.studentIds.map((id) => ({ mock_id: mockId, student_id: id })))
              .select(RESULT_COLS);
            if (e3) throw e3;
            r = (data ?? []) as MockResult[];
          }
          setMocks((ms) => [m as Mock, ...ms]);
          setSections((ss) => [...ss, ...((s ?? []) as MockSection[])]);
          setResults((rs) => [...rs, ...r]);
        } catch (e) {
          // Roll back the half-created mock (children cascade) so nothing is left behind.
          await sb.from("mocks").delete().eq("id", mockId);
          mockId = null;
          throw e;
        }
      });
      return ok ? mockId : null;
    },
    [track],
  );

  const patchResult = useCallback(
    async (id: string, patch: Partial<Pick<MockResult, "attendance" | "payment">>, what: string) => {
      const prev = results.find((r) => r.id === id);
      if (!prev) return false;
      setResults((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
      const ok = await track(what, async () => {
        const { error: err } = await getSupabase().from("mock_student_results").update(patch).eq("id", id);
        if (err) throw err;
      });
      if (!ok) setResults((rs) => rs.map((r) => (r.id === id ? prev : r)));
      return ok;
    },
    [results, track],
  );

  const setAttendance = useCallback(
    (id: string, v: MockAttendance | null) => patchResult(id, { attendance: v }, "Qatnashuv saqlanmadi"),
    [patchResult],
  );
  const setPayment = useCallback(
    (id: string, v: MockPayment | null) => patchResult(id, { payment: v }, "To'lov saqlanmadi"),
    [patchResult],
  );

  /** value = null removes the score (back to "not entered"). */
  const saveScore = useCallback(
    async (resultId: string, sectionId: string, value: number | null): Promise<boolean> => {
      const sb = getSupabase();
      const prev = scoresRef.current.find((s) => s.result_id === resultId && s.section_id === sectionId);
      if (value === null) {
        if (!prev) return true;
        setScores((ss) => ss.filter((s) => s.id !== prev.id));
        const ok = await track("Ball o'chirilmadi", async () => {
          const { error: err } = await sb.from("mock_section_scores").delete().eq("id", prev.id);
          if (err) throw err;
        });
        if (!ok) setScores((ss) => [...ss, prev]);
        return ok;
      }
      if (prev?.correct === value) return true;
      setScores((ss) =>
        prev
          ? ss.map((s) => (s.id === prev.id ? { ...s, correct: value } : s))
          : [...ss, { id: `tmp-${resultId}-${sectionId}`, result_id: resultId, section_id: sectionId, correct: value }],
      );
      const ok = await track("Ball saqlanmadi", async () => {
        const { data, error: err } = await sb
          .from("mock_section_scores")
          .upsert({ result_id: resultId, section_id: sectionId, correct: value }, { onConflict: "result_id,section_id" })
          .select(SCORE_COLS)
          .single();
        if (err) throw err;
        setScores((ss) =>
          ss.map((s) => (s.result_id === resultId && s.section_id === sectionId ? (data as MockScore) : s)),
        );
      });
      if (!ok) {
        setScores((ss) =>
          prev
            ? ss.map((s) => (s.id === prev.id ? prev : s))
            : ss.filter((s) => !(s.result_id === resultId && s.section_id === sectionId)),
        );
      }
      return ok;
    },
    [track],
  );

  const finish = useCallback(
    async (mockId: string): Promise<boolean> => {
      const stamp = new Date().toISOString();
      const ok = await track("Mock yakunlanmadi", async () => {
        const { error: err } = await getSupabase()
          .from("mocks")
          .update({ status: "completed", completed_at: stamp, updated_at: stamp })
          .eq("id", mockId);
        if (err) throw err;
      });
      if (ok) setMocks((ms) => ms.map((m) => (m.id === mockId ? { ...m, status: "completed", completed_at: stamp } : m)));
      return ok;
    },
    [track],
  );

  const renameMock = useCallback(
    async (mockId: string, name: string, date: string): Promise<boolean> => {
      const ok = await track("O'zgarish saqlanmadi", async () => {
        const { error: err } = await getSupabase()
          .from("mocks")
          .update({ name, mock_date: date, updated_at: new Date().toISOString() })
          .eq("id", mockId);
        if (err) throw err;
      });
      if (ok) setMocks((ms) => ms.map((m) => (m.id === mockId ? { ...m, name, mock_date: date } : m)));
      return ok;
    },
    [track],
  );

  /** Adds students of the group that are not in this mock yet (draft only). */
  const addStudents = useCallback(
    async (mockId: string, studentIds: string[]): Promise<boolean> => {
      if (!studentIds.length) return true;
      return track("O'quvchilar qo'shilmadi", async () => {
        const { data, error: err } = await getSupabase()
          .from("mock_student_results")
          .insert(studentIds.map((id) => ({ mock_id: mockId, student_id: id })))
          .select(RESULT_COLS);
        if (err) throw err;
        setResults((rs) => [...rs, ...((data ?? []) as MockResult[])]);
      });
    },
    [track],
  );

  const deleteMock = useCallback(
    async (mockId: string): Promise<boolean> => {
      const ok = await track("Mock o'chirilmadi", async () => {
        const { error: err } = await getSupabase().from("mocks").delete().eq("id", mockId);
        if (err) throw err;
      });
      if (ok) {
        const resIds = new Set(results.filter((r) => r.mock_id === mockId).map((r) => r.id));
        setMocks((ms) => ms.filter((m) => m.id !== mockId));
        setSections((ss) => ss.filter((s) => s.mock_id !== mockId));
        setResults((rs) => rs.filter((r) => r.mock_id !== mockId));
        setScores((ss) => ss.filter((s) => !resIds.has(s.result_id)));
      }
      return ok;
    },
    [results, track],
  );

  const sortedMocks = useMemo(
    () => [...mocks].sort((a, b) => b.mock_date.localeCompare(a.mock_date) || b.created_at.localeCompare(a.created_at)),
    [mocks],
  );

  return {
    status,
    error,
    reload,
    mocks: sortedMocks,
    sections,
    results,
    scores,
    pending,
    lastSavedAt,
    createMock,
    setAttendance,
    setPayment,
    saveScore,
    finish,
    renameMock,
    addStudents,
    deleteMock,
  };
}

export type MockStore = ReturnType<typeof useMockStore>;
