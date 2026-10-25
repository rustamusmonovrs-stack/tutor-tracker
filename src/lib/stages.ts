import { addDays, diffDays } from "./dates";

export const LEVELS = [
  "Starter",
  "Beginner",
  "Elementary",
  "Pre-Intermediate",
  "Intermediate",
  "Upper-Intermediate",
  "Advanced",
] as const;
export type Level = (typeof LEVELS)[number];

export const PROGRAM_SIZE = 9;

export type Outcome = "next" | "repeat" | "program_done";

export interface Book {
  id: string;
  position: number;
  title: string;
  level: Level | null;
  avg_weeks: number | null;
  planned_lessons: number | null;
  active: boolean;
}

export interface Progress {
  id: string;
  student_id: string;
  level: Level | null;
  lessons_per_week: number | null;
  teacher_note: string | null;
  next_goal: string | null;
}

export interface BookStint {
  id: string;
  student_id: string;
  book_id: string;
  group_id: string | null;
  level: Level | null;
  started_on: string;
  finished_on: string | null;
  outcome: Outcome | null;
  created_at: string;
}

export interface GroupTransfer {
  id: string;
  student_id: string;
  from_group_id: string | null;
  to_group_id: string | null;
  transferred_at: string;
  note: string | null;
}

export function isLevel(v: unknown): v is Level {
  return typeof v === "string" && (LEVELS as readonly string[]).includes(v);
}

/** Books in program order. */
export function sortBooks(books: Book[]): Book[] {
  return [...books].sort((a, b) => a.position - b.position);
}

export function nextLevel(level: Level | null): Level | null {
  if (!level) return null;
  const i = LEVELS.indexOf(level);
  return i >= 0 && i < LEVELS.length - 1 ? LEVELS[i + 1] : null;
}

/** Student's stints, oldest first. */
export function sortStints(stints: BookStint[]): BookStint[] {
  return [...stints].sort(
    (a, b) => a.started_on.localeCompare(b.started_on) || a.created_at.localeCompare(b.created_at),
  );
}

export type StageState = "unset" | "active" | "done";

export interface StageView {
  state: StageState;
  active: BookStint | null;
  /** Finished stints, oldest first. */
  finished: BookStint[];
  /** First stint ever recorded = where the student actually joined the program. */
  placement: BookStint | null;
  /** Book ids finished with outcome "next" or "program_done" (a repeat does not count as a new completion). */
  completedBookIds: string[];
}

export function stageView(stints: BookStint[]): StageView {
  const sorted = sortStints(stints);
  const active = sorted.find((s) => s.finished_on === null) ?? null;
  const finished = sorted.filter((s) => s.finished_on !== null);
  const completed = new Set<string>();
  for (const s of finished) if (s.outcome !== "repeat") completed.add(s.book_id);
  const done = !active && finished.some((s) => s.outcome === "program_done");
  return {
    state: active ? "active" : done ? "done" : "unset",
    active,
    finished,
    placement: sorted[0] ?? null,
    completedBookIds: [...completed],
  };
}

/** Whole weeks (rounded to 0.1) between two dates. */
export function weeksBetween(from: string, to: string): number {
  return Math.round((diffDays(from, to) / 7) * 10) / 10;
}

/** Display text for a number of weeks: "taxminan 6 hafta" (at least 1 while anything remains). */
export function weeksText(weeks: number): string {
  if (weeks <= 0) return "0 hafta";
  return `${Math.max(1, Math.round(weeks))} hafta`;
}

/** "5 kun" below two weeks, otherwise "7 hafta". */
export function durationText(from: string, to: string): string {
  const days = Math.max(0, diffDays(from, to));
  return days < 14 ? `${days} kun` : weeksText(days / 7);
}

// ---------------------------------------------------------------- forecast

export type ForecastBasis = "lessons" | "duration";

export interface BookForecast {
  ok: boolean;
  /** Why there is no number (shown instead of a made-up date). */
  reason?: string;
  basis?: ForecastBasis;
  remainingWeeks?: number;
  /** Estimated finish date for the current book. */
  finishOn?: string;
  /** Planned time already passed but the teacher has not finished the book yet. */
  due?: boolean;
  /** Share of planned lessons attended (0..1); null when the book has no planned lesson count. */
  progress: number | null;
}

export interface ProgramForecast {
  ok: boolean;
  reason?: string;
  remainingWeeks?: number;
  finishOn?: string;
  /** Books after the current one included in the sum. */
  futureBooks?: number;
}

export const NO_DATA = "Prognoz uchun ma'lumot yetarli emas";

interface ForecastInput {
  book: Book | null;
  startedOn: string | null;
  today: string;
  /** Lessons the student actually attended since the book was started (real data, not a guess). */
  attendedSinceStart: number;
  lessonsPerWeek: number | null;
}

/**
 * Current-book forecast.
 *  - planned lessons + lessons/week known: remaining weeks = (planned - attended) / lessons per week
 *  - otherwise, average duration known: remaining weeks = avg weeks - weeks elapsed (explicitly an estimate)
 *  - otherwise: no forecast. The two bases are never added together.
 */
export function forecastBook(i: ForecastInput): BookForecast {
  const { book, startedOn, today, attendedSinceStart, lessonsPerWeek } = i;
  if (!book || !startedOn) return { ok: false, reason: NO_DATA, progress: null };
  const progress =
    book.planned_lessons && book.planned_lessons > 0
      ? Math.min(1, Math.max(0, attendedSinceStart / book.planned_lessons))
      : null;

  let basis: ForecastBasis | null = null;
  let remaining = 0;
  if (book.planned_lessons && lessonsPerWeek && lessonsPerWeek > 0) {
    basis = "lessons";
    remaining = Math.max(0, book.planned_lessons - attendedSinceStart) / lessonsPerWeek;
  } else if (book.avg_weeks) {
    basis = "duration";
    remaining = Math.max(0, book.avg_weeks - Math.max(0, weeksBetween(startedOn, today)));
  }
  if (!basis) return { ok: false, reason: NO_DATA, progress };
  return {
    ok: true,
    basis,
    remainingWeeks: remaining,
    finishOn: addDays(today, Math.ceil(remaining * 7)),
    due: remaining === 0,
    progress,
  };
}

/** Planned duration of a later (not yet started) book, in weeks: average weeks, else planned lessons / lessons per week. */
export function plannedWeeks(book: Book, lessonsPerWeek: number | null): number | null {
  if (book.avg_weeks) return book.avg_weeks;
  if (book.planned_lessons && lessonsPerWeek && lessonsPerWeek > 0) return book.planned_lessons / lessonsPerWeek;
  return null;
}

/**
 * Time until the last active book: remaining time of the current book + planned time of every later book.
 * If any of those numbers is missing, there is no forecast (a date is never invented).
 */
export function forecastProgram(
  books: Book[],
  currentBookId: string | null,
  current: BookForecast,
  lessonsPerWeek: number | null,
  today: string,
): ProgramForecast {
  if (!currentBookId || !current.ok || current.remainingWeeks === undefined) {
    return { ok: false, reason: NO_DATA };
  }
  const ordered = sortBooks(books.filter((b) => b.active));
  const idx = ordered.findIndex((b) => b.id === currentBookId);
  if (idx < 0) return { ok: false, reason: NO_DATA };
  const later = ordered.slice(idx + 1);
  let total = current.remainingWeeks;
  for (const b of later) {
    const w = plannedWeeks(b, lessonsPerWeek);
    if (w === null) return { ok: false, reason: NO_DATA };
    total += w;
  }
  return { ok: true, remainingWeeks: total, finishOn: addDays(today, Math.ceil(total * 7)), futureBooks: later.length };
}

/** Teacher-facing flag: the planned time of the current book is used up, so a level-up review is due. */
export function isReadyForNext(f: BookForecast): boolean {
  return f.ok && f.due === true;
}

// ---------------------------------------------------------------- report text

const MONTHS_FULL = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];

/** "2026 yil noyabr" — month precision only, because the forecast is approximate. */
export function approxMonth(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return `${y}-yil ${MONTHS_FULL[m - 1]}`;
}

export interface OutlookInput {
  stage: StageState;
  bookTitle: string | null;
  attendanceRate: number | null; // 0..100, null when nothing is marked
  book: BookForecast | null;
  program: ProgramForecast | null;
}

/** Natural Uzbek summary built only from computed numbers. Never promises a result or an exam score. */
export function buildOutlook(i: OutlookInput): string {
  if (i.stage === "unset") {
    return "O'quvchining bosqichi hali belgilanmagan, shu sababli prognoz hisoblanmadi.";
  }
  if (i.stage === "done") {
    return "O'quvchi 9 kitoblik dasturni yakunlagan. Keyingi o'quv maqsadi o'qituvchi bilan birgalikda belgilanadi.";
  }
  if (!i.book || !i.book.ok) {
    return `${NO_DATA}. O'qituvchi kitob muddati va haftalik darslar sonini kiritgach, bu yerda taxminiy muddat paydo bo'ladi.`;
  }
  const parts: string[] = [];
  const title = i.bookTitle ? `“${i.bookTitle}”` : "joriy kitob";
  if (i.book.due) {
    parts.push(
      `Agar farzandingiz darslarga muntazam qatnashib, mavzularni hozirgi sur'atda o'zlashtirishda davom etsa, ${title} bo'yicha rejalashtirilgan muddat yakuniga yetmoqda. Keyingi bosqichga o'tish o'qituvchining yakuniy baholashiga bog'liq.`,
    );
  } else {
    parts.push(
      `Agar farzandingiz darslarga muntazam qatnashib, mavzularni hozirgi sur'atda o'zlashtirishda davom etsa, ${title} ni taxminan ${weeksText(i.book.remainingWeeks ?? 0)}da yakunlashi mumkin. Keyingi bosqichga o'tish o'qituvchining yakuniy baholashiga bog'liq.`,
    );
  }
  if (i.attendanceRate !== null && i.attendanceRate < 75) {
    parts.push(
      `Hozirgi davomat ${i.attendanceRate}%: darslarni qoldirmaslik rejalashtirilgan muddatga amal qilishga yordam beradi.`,
    );
  }
  if (i.program?.ok && i.program.finishOn && (i.program.futureBooks ?? 0) > 0) {
    parts.push(
      `Dasturning oxirgi kitobigacha taxminan ${weeksText(i.program.remainingWeeks ?? 0)} (taxminan ${approxMonth(i.program.finishOn)}) ketishi mumkin. Bu taxmin bo'lib, o'quvchi sur'atiga qarab o'zgaradi.`,
    );
  }
  parts.push("Hisobot natija yoki xalqaro imtihon balini kafolatlamaydi.");
  return parts.join(" ");
}

/** Attended lessons since a date, from the journal's existing lesson rows. */
export function attendedSince(
  lessons: { lesson_date: string; attendance: "present" | "absent" | null }[],
  from: string,
): number {
  return lessons.filter((l) => l.attendance === "present" && l.lesson_date >= from).length;
}

export function attendanceRate(
  lessons: { attendance: "present" | "absent" | null }[],
): number | null {
  const present = lessons.filter((l) => l.attendance === "present").length;
  const absent = lessons.filter((l) => l.attendance === "absent").length;
  return present + absent ? Math.round((present / (present + absent)) * 100) : null;
}

// ---------------------------------------------------------------- per-student summary

export interface StageSummary {
  view: StageView;
  book: Book | null;
  level: Level | null;
  lessonsPerWeek: number | null;
  attended: number;
  attendance: number | null;
  forecast: BookForecast | null;
  program: ProgramForecast | null;
  ready: boolean;
}

/** One place that turns raw rows into everything the pages and the parent report show. */
export function summarizeStudent(i: {
  stints: BookStint[];
  progress: Progress | null;
  books: Book[];
  lessons: { lesson_date: string; attendance: "present" | "absent" | null }[];
  today: string;
}): StageSummary {
  const view = stageView(i.stints);
  const book = view.active ? (i.books.find((b) => b.id === view.active!.book_id) ?? null) : null;
  const level = i.progress?.level ?? view.active?.level ?? null;
  const lessonsPerWeek = i.progress?.lessons_per_week ?? null;
  const attended = view.active ? attendedSince(i.lessons, view.active.started_on) : 0;
  const forecast = view.active
    ? forecastBook({ book, startedOn: view.active.started_on, today: i.today, attendedSinceStart: attended, lessonsPerWeek })
    : null;
  const program = forecast && book ? forecastProgram(i.books, book.id, forecast, lessonsPerWeek, i.today) : null;
  return {
    view,
    book,
    level,
    lessonsPerWeek,
    attended,
    attendance: attendanceRate(i.lessons),
    forecast,
    program,
    ready: forecast ? isReadyForNext(forecast) : false,
  };
}
