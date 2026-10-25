import { describe, expect, it } from "vitest";
import {
  attendanceRate,
  attendedSince,
  buildOutlook,
  forecastBook,
  forecastProgram,
  isReadyForNext,
  NO_DATA,
  nextLevel,
  stageView,
  weeksText,
  type Book,
  type BookStint,
} from "./stages";

const book = (position: number, over: Partial<Book> = {}): Book => ({
  id: `b${position}`,
  position,
  title: `${position}-kitob`,
  level: null,
  avg_weeks: null,
  planned_lessons: null,
  active: true,
  ...over,
});

const stint = (over: Partial<BookStint>): BookStint => ({
  id: "h1",
  student_id: "s1",
  book_id: "b3",
  group_id: "g1",
  level: "Elementary",
  started_on: "2026-09-01",
  finished_on: null,
  outcome: null,
  created_at: "2026-09-01T00:00:00Z",
  ...over,
});

describe("stageView", () => {
  it("no history = unset (nobody is auto-placed)", () => {
    const v = stageView([]);
    expect(v.state).toBe("unset");
    expect(v.active).toBeNull();
    expect(v.completedBookIds).toEqual([]);
  });

  it("student who starts at book 3 has NO finished books 1-2", () => {
    const v = stageView([stint({})]);
    expect(v.state).toBe("active");
    expect(v.placement?.book_id).toBe("b3");
    expect(v.completedBookIds).toEqual([]);
    expect(v.finished).toHaveLength(0);
  });

  it("repeat does not count as a new completion; next does", () => {
    const v = stageView([
      stint({ id: "h1", book_id: "b3", finished_on: "2026-10-01", outcome: "repeat" }),
      stint({ id: "h2", book_id: "b3", started_on: "2026-10-01", finished_on: "2026-11-01", outcome: "next", created_at: "2026-10-01T00:00:00Z" }),
      stint({ id: "h3", book_id: "b4", started_on: "2026-11-01", created_at: "2026-11-01T00:00:00Z" }),
    ]);
    expect(v.active?.book_id).toBe("b4");
    expect(v.completedBookIds).toEqual(["b3"]);
    expect(v.finished).toHaveLength(2);
  });

  it("program_done without active stint = done", () => {
    const v = stageView([stint({ finished_on: "2026-10-01", outcome: "program_done" })]);
    expect(v.state).toBe("done");
  });
});

describe("forecastBook", () => {
  const base = { today: "2026-10-25", startedOn: "2026-09-27" };

  it("planned lessons / lessons per week", () => {
    const f = forecastBook({ ...base, book: book(1, { planned_lessons: 36, avg_weeks: 12 }), attendedSinceStart: 12, lessonsPerWeek: 3 });
    expect(f.ok).toBe(true);
    expect(f.basis).toBe("lessons");
    expect(f.remainingWeeks).toBe(8); // (36-12)/3
    expect(f.finishOn).toBe("2026-12-20"); // today + 56 days
    expect(f.progress).toBeCloseTo(12 / 36);
  });

  it("falls back to average duration minus elapsed weeks, and says so", () => {
    const f = forecastBook({ ...base, book: book(1, { avg_weeks: 12 }), attendedSinceStart: 0, lessonsPerWeek: null });
    expect(f.basis).toBe("duration");
    expect(f.remainingWeeks).toBe(8); // 12 - 4 weeks elapsed
    expect(f.progress).toBeNull(); // no planned lessons => no fake percentage
  });

  it("never adds the two bases together", () => {
    const f = forecastBook({ ...base, book: book(1, { planned_lessons: 24, avg_weeks: 8 }), attendedSinceStart: 12, lessonsPerWeek: 3 });
    expect(f.remainingWeeks).toBe(4); // lessons basis only, not 4 + 4
  });

  it("no usable numbers => no forecast and no date", () => {
    const f = forecastBook({ ...base, book: book(1), attendedSinceStart: 5, lessonsPerWeek: 3 });
    expect(f.ok).toBe(false);
    expect(f.reason).toBe(NO_DATA);
    expect(f.finishOn).toBeUndefined();
  });

  it("planned lessons without lessons/week and without weeks => no forecast", () => {
    const f = forecastBook({ ...base, book: book(1, { planned_lessons: 30 }), attendedSinceStart: 5, lessonsPerWeek: null });
    expect(f.ok).toBe(false);
    expect(f.progress).toBeCloseTo(5 / 30);
  });

  it("over-attended book is due (remaining 0) and ready for review", () => {
    const f = forecastBook({ ...base, book: book(1, { planned_lessons: 20 }), attendedSinceStart: 25, lessonsPerWeek: 2 });
    expect(f.remainingWeeks).toBe(0);
    expect(f.due).toBe(true);
    expect(f.progress).toBe(1);
    expect(isReadyForNext(f)).toBe(true);
  });

  it("missing book or start date => no forecast", () => {
    expect(forecastBook({ today: "2026-10-25", startedOn: null, book: book(1, { avg_weeks: 8 }), attendedSinceStart: 0, lessonsPerWeek: 2 }).ok).toBe(false);
    expect(forecastBook({ today: "2026-10-25", startedOn: "2026-10-01", book: null, attendedSinceStart: 0, lessonsPerWeek: 2 }).ok).toBe(false);
  });
});

describe("forecastProgram", () => {
  const today = "2026-10-25";
  const cur = { ok: true, remainingWeeks: 4, progress: null } as const;

  it("current remaining + later books' planned weeks (no double counting)", () => {
    const books = [book(1, { avg_weeks: 10 }), book(2, { avg_weeks: 12 }), book(3, { planned_lessons: 24 })];
    const p = forecastProgram(books, "b1", cur, 3, today);
    expect(p.ok).toBe(true);
    expect(p.remainingWeeks).toBe(4 + 12 + 8); // 24 lessons / 3 per week = 8
    expect(p.futureBooks).toBe(2);
    expect(p.finishOn).toBe("2027-04-11"); // today + 24 weeks (168 days)
  });

  it("a later book without duration blocks the program forecast", () => {
    const books = [book(1, { avg_weeks: 10 }), book(2), book(3, { avg_weeks: 8 })];
    expect(forecastProgram(books, "b1", cur, 3, today).ok).toBe(false);
  });

  it("inactive books are skipped", () => {
    const books = [book(1, { avg_weeks: 10 }), book(2, { avg_weeks: 12, active: false }), book(3, { avg_weeks: 8 })];
    expect(forecastProgram(books, "b1", cur, null, today).remainingWeeks).toBe(4 + 8);
  });

  it("last book => only the current remainder", () => {
    const books = [book(8, { avg_weeks: 10 }), book(9, { avg_weeks: 10 })];
    const p = forecastProgram(books, "b9", cur, null, today);
    expect(p.remainingWeeks).toBe(4);
    expect(p.futureBooks).toBe(0);
  });

  it("no current forecast => none", () => {
    expect(forecastProgram([book(1)], "b1", { ok: false, progress: null }, 3, today).ok).toBe(false);
  });
});

describe("helpers", () => {
  it("nextLevel follows the order and ends at Advanced", () => {
    expect(nextLevel("Starter")).toBe("Beginner");
    expect(nextLevel("Upper-Intermediate")).toBe("Advanced");
    expect(nextLevel("Advanced")).toBeNull();
    expect(nextLevel(null)).toBeNull();
  });

  it("weeksText", () => {
    expect(weeksText(0)).toBe("0 hafta");
    expect(weeksText(0.3)).toBe("1 hafta");
    expect(weeksText(5.6)).toBe("6 hafta");
  });

  it("attendance from real lesson rows", () => {
    const ls = [
      { lesson_date: "2026-09-01", attendance: "present" as const },
      { lesson_date: "2026-10-01", attendance: "present" as const },
      { lesson_date: "2026-10-02", attendance: "absent" as const },
      { lesson_date: "2026-10-03", attendance: null },
    ];
    expect(attendedSince(ls, "2026-09-15")).toBe(1);
    expect(attendanceRate(ls)).toBe(67);
    expect(attendanceRate([])).toBeNull();
  });
});

describe("buildOutlook", () => {
  const ok = { ok: true, remainingWeeks: 6, finishOn: "2026-12-06", progress: 0.5, basis: "lessons" as const };

  it("uses the computed weeks and never guarantees a result", () => {
    const t = buildOutlook({ stage: "active", bookTitle: "Family and Friends 2", attendanceRate: 92, book: ok, program: { ok: true, remainingWeeks: 30, finishOn: "2027-05-23", futureBooks: 3 } });
    expect(t).toContain("taxminan 6 haftada");
    expect(t).toContain("o'qituvchining yakuniy baholashiga bog'liq");
    expect(t).toContain("2027-yil may");
    expect(t).toContain("kafolatlamaydi");
    expect(t).not.toMatch(/albatta|kafolatlanadi|IELTS \d/);
  });

  it("mentions low attendance only when it is low", () => {
    const low = buildOutlook({ stage: "active", bookTitle: "A", attendanceRate: 60, book: ok, program: null });
    const high = buildOutlook({ stage: "active", bookTitle: "A", attendanceRate: 90, book: ok, program: null });
    expect(low).toContain("60%");
    expect(high).not.toContain("davomat");
  });

  it("insufficient data => honest message, no invented numbers", () => {
    const t = buildOutlook({ stage: "active", bookTitle: "A", attendanceRate: 90, book: { ok: false, reason: NO_DATA, progress: null }, program: null });
    expect(t).toContain("Prognoz uchun ma'lumot yetarli emas");
    expect(t).not.toMatch(/\d+ hafta/);
  });

  it("unset and done stages", () => {
    expect(buildOutlook({ stage: "unset", bookTitle: null, attendanceRate: null, book: null, program: null })).toContain("belgilanmagan");
    expect(buildOutlook({ stage: "done", bookTitle: null, attendanceRate: null, book: null, program: null })).toContain("yakunlagan");
  });

  it("due book says the planned time is ending, not a negative number", () => {
    const t = buildOutlook({ stage: "active", bookTitle: "A", attendanceRate: 90, book: { ...ok, remainingWeeks: 0, due: true }, program: null });
    expect(t).toContain("yakuniga yetmoqda");
  });
});
