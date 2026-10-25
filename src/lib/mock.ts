// Pure Mock logic: types, scoring, ranking, stats, validation. No I/O.

export type MockStatus = "draft" | "completed";
export type MockAttendance = "present" | "absent";
export type MockPayment = "paid" | "unpaid";

export interface Mock {
  id: string;
  group_id: string;
  name: string;
  mock_date: string;
  status: MockStatus;
  completed_at: string | null;
  created_at: string;
}

export interface MockSection {
  id: string;
  mock_id: string;
  position: number;
  name: string;
  total_questions: number;
}

export interface MockResult {
  id: string;
  mock_id: string;
  student_id: string;
  attendance: MockAttendance | null;
  payment: MockPayment | null;
}

export interface MockScore {
  id: string;
  result_id: string;
  section_id: string;
  correct: number;
}

export const SECTION_PRESETS = ["Reading", "Listening", "Grammar", "Vocabulary", "Writing", "Speaking"] as const;
export const MAX_SECTIONS = 12;
export const MAX_QUESTIONS = 1000;

/** Normalised key used to detect duplicate section names ("reading " == "Reading"). */
export function sectionKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export interface SectionDraft {
  name: string;
  total: string; // raw input
}

/** Returns a user-facing error, or null when the section list is valid. */
export function validateSections(drafts: SectionDraft[]): string | null {
  if (drafts.length === 0) return "Kamida bitta bo'lim kerak.";
  const seen = new Set<string>();
  for (const d of drafts) {
    const key = sectionKey(d.name);
    if (!key) return "Har bir bo'limning nomi bo'lishi kerak.";
    if (key.length > 40) return `"${d.name.trim()}" nomi juda uzun (40 belgigacha).`;
    if (seen.has(key)) return `"${d.name.trim()}" bo'limi takrorlangan.`;
    seen.add(key);
    const n = parseWhole(d.total);
    if (n === null || n < 1) return `"${d.name.trim()}": savollar soni musbat butun son bo'lishi kerak.`;
    if (n > MAX_QUESTIONS) return `"${d.name.trim()}": savollar soni ${MAX_QUESTIONS} dan oshmasin.`;
  }
  return null;
}

/** Strict non-negative integer from text; null when empty or not a plain whole number. */
export function parseWhole(raw: string): number | null {
  const t = raw.trim();
  if (!/^\d{1,6}$/.test(t)) return null;
  return Number(t);
}

export type ScoreCheck = { kind: "empty" } | { kind: "ok"; value: number } | { kind: "error"; message: string };

/** Validate one typed score against the section maximum. Empty stays empty (never 0). */
export function checkScore(raw: string, max: number): ScoreCheck {
  if (raw.trim() === "") return { kind: "empty" };
  if (/^-/.test(raw.trim())) return { kind: "error", message: "Manfiy bo'lmaydi" };
  const n = parseWhole(raw);
  if (n === null) return { kind: "error", message: "Faqat butun son" };
  if (n > max) return { kind: "error", message: `Maksimum ${max}` };
  return { kind: "ok", value: n };
}

/** Round to at most 2 decimals. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** "87.5%", "75%", "33.33%" — at most 2 decimals, no trailing zeros. */
export function formatPct(p: number): string {
  return `${round2(p)}%`;
}

export interface StudentTotals {
  /** Sum of correct answers over the sections that have a score. */
  correct: number;
  /** Sum of questions over ALL sections. */
  total: number;
  entered: number;
  sections: number;
  complete: boolean;
  /** Weighted overall percentage, only when every section has a score. */
  pct: number | null;
}

/** overall = sum(correct) / sum(total questions) * 100 — weighted, never an average of percentages. */
export function totalsFor(sections: MockSection[], scores: Map<string, number>): StudentTotals {
  const total = sections.reduce((a, s) => a + s.total_questions, 0);
  let correct = 0;
  let entered = 0;
  for (const s of sections) {
    const v = scores.get(s.id);
    if (v !== undefined) {
      correct += v;
      entered += 1;
    }
  }
  const complete = sections.length > 0 && entered === sections.length;
  return {
    correct,
    total,
    entered,
    sections: sections.length,
    complete,
    pct: complete && total > 0 ? round2((correct / total) * 100) : null,
  };
}

export interface Row {
  result: MockResult;
  name: string;
  scores: Map<string, number>;
  totals: StudentTotals;
}

export interface Ranked extends Row {
  rank: number;
}

export interface Ranking {
  ranked: Ranked[];
  /** Present, but not every section scored yet (draft only). No rank. */
  incomplete: Row[];
  /** Marked absent. No rank, no points. */
  absent: Row[];
  /** Attendance not marked yet. */
  unmarked: Row[];
}

/** Standard competition ranking (1, 1, 3): equal percentages share a place. */
export function buildRanking(rows: Row[]): Ranking {
  const byName = (a: Row, b: Row) => a.name.localeCompare(b.name, "uz");
  const present = rows.filter((r) => r.result.attendance === "present");
  const done = present
    .filter((r) => r.totals.complete && r.totals.pct !== null)
    .sort((a, b) => (b.totals.pct as number) - (a.totals.pct as number) || byName(a, b));
  const ranked: Ranked[] = [];
  done.forEach((r, i) => {
    const prev = ranked[i - 1];
    const rank = prev && prev.totals.pct === r.totals.pct ? prev.rank : i + 1;
    ranked.push({ ...r, rank });
  });
  return {
    ranked,
    incomplete: present.filter((r) => !r.totals.complete).sort(byName),
    absent: rows.filter((r) => r.result.attendance === "absent").sort(byName),
    unmarked: rows.filter((r) => r.result.attendance === null).sort(byName),
  };
}

export interface MockStats {
  total: number;
  present: number;
  absent: number;
  attendanceUnmarked: number;
  paid: number;
  unpaid: number;
  paymentUnmarked: number;
  /** Average overall % over present students who have ALL sections scored; null when nobody qualifies. */
  avgPct: number | null;
  topPct: number | null;
  topNames: string[];
}

export function buildStats(rows: Row[]): MockStats {
  const complete = rows.filter((r) => r.result.attendance === "present" && r.totals.complete && r.totals.pct !== null);
  const pcts = complete.map((r) => r.totals.pct as number);
  const top = pcts.length ? Math.max(...pcts) : null;
  return {
    total: rows.length,
    present: rows.filter((r) => r.result.attendance === "present").length,
    absent: rows.filter((r) => r.result.attendance === "absent").length,
    attendanceUnmarked: rows.filter((r) => r.result.attendance === null).length,
    paid: rows.filter((r) => r.result.payment === "paid").length,
    unpaid: rows.filter((r) => r.result.payment === "unpaid").length,
    paymentUnmarked: rows.filter((r) => r.result.payment === null).length,
    avgPct: pcts.length ? round2(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null,
    topPct: top,
    topNames: top === null ? [] : complete.filter((r) => r.totals.pct === top).map((r) => r.name),
  };
}

export interface FinishProblems {
  unmarked: number;
  incomplete: number;
}

/** What blocks finishing: attendance not marked, or a present student without every score. */
export function finishProblems(rows: Row[]): FinishProblems {
  return {
    unmarked: rows.filter((r) => r.result.attendance === null).length,
    incomplete: rows.filter((r) => r.result.attendance === "present" && !r.totals.complete).length,
  };
}

/** Auto name when the teacher leaves it empty: "Mock 3" (count of the group's mocks + 1). */
export function defaultMockName(existingInGroup: number): string {
  return `Mock ${existingInGroup + 1}`;
}

/** One row per student in this mock, with their scores and totals. Names come from the student id (never matched by name). */
export function buildRows(
  sections: MockSection[],
  results: MockResult[],
  scores: MockScore[],
  nameOf: (studentId: string) => string,
): Row[] {
  const byResult = new Map<string, Map<string, number>>();
  for (const s of scores) {
    let m = byResult.get(s.result_id);
    if (!m) byResult.set(s.result_id, (m = new Map()));
    m.set(s.section_id, s.correct);
  }
  return results.map((result) => {
    const map = byResult.get(result.id) ?? new Map<string, number>();
    const norm: MockResult = { ...result, attendance: result.attendance ?? null, payment: result.payment ?? null };
    return { result: norm, name: nameOf(result.student_id), scores: map, totals: totalsFor(sections, map) };
  });
}
