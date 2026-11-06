import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Assessment, CoinEvent, HwTask } from "../homework";
import { taskCoinEvents } from "../homework";
import { scoreLessons } from "../scoring";
import type { Lesson, LessonPlan, Student } from "../types";
import type { SubjectLesson, SubjectRecord, SubjectStudent } from "../subjects/types";
import type { GroupTransfer } from "../stages";
import { buildEnglishDaily, buildSubjectDaily, englishLessonDates, groupOnDate, subjectLessonDates } from "./build";
import { portraitDataUri, renderDailyHtml } from "./html";
import { buildDailyPdf } from "./pdf";
import { buildDailyView } from "./view";

const fonts = {
  regular: new Uint8Array(readFileSync("public/fonts/DejaVuSans.ttf")),
  bold: new Uint8Array(readFileSync("public/fonts/DejaVuSans-Bold.ttf")),
};
const portrait = new Uint8Array(readFileSync("public/brand/teacher-rustam-usmonov.jpg"));
const outDir = process.env.REPORT_OUT ?? mkdtempSync(join(tmpdir(), "daily-"));
const pdfText = (f: string) => execFileSync("pdftotext", ["-layout", f, "-"]).toString();
const pageCount = (f: string) => Number(/Pages:\s+(\d+)/.exec(execFileSync("pdfinfo", [f]).toString())![1]);

const DATE = "2026-11-04";
const TODAY = "2026-11-06";

// ---------------------------------------------------------------------------------------------
// Matematika / Tarix fixtures

function subjectData(subject: "math" | "history", n = 6) {
  const names = ["Oʻtkir Gʻaniyev", "Dilnoza Abdurahmonova-Qodirova", "Shoxrux Toshpoʻlatov", "<script>alert(1)</script> & “Q”", "Aziza", "Bobur"];
  const students: SubjectStudent[] = Array.from({ length: n }, (_, i) => ({
    id: `s${i}`, person_id: `s${i}`, subject, group_id: "g", name: i < names.length ? names[i] : `O‘quvchi ${i + 1} Familiyaev`,
    english_student_id: null, archived_at: null, created_at: "2026-09-01T05:00:00Z",
  }));
  const lesson = (over: Partial<SubjectLesson> = {}): SubjectLesson => ({
    id: "l1", subject, group_id: "g", lesson_date: DATE, topic: "Kvadrat tenglamalar", homework: "25-mashq", has_test: false, test_title: null, test_max: null, updated_at: "", ...over,
  });
  const rec = (studentId: string, over: Partial<SubjectRecord> = {}): SubjectRecord => ({
    id: `r-${studentId}`, subject, group_id: "g", lesson_id: "l1", student_id: studentId, attendance: null, homework: null, score: null, updated_at: "", ...over,
  });
  return { students, lesson, rec, group: { id: "g", name: subject === "math" ? "Matematika 1" : "Tarix 9-sinf" } };
}

describe("subject daily report (Matematika / Tarix)", () => {
  it("unmarked attendance is not absence; unchecked / missing homework is not 'not submitted'", () => {
    const { students, lesson, rec, group } = subjectData("math", 5);
    const r = buildSubjectDaily({
      subject: "math", group, date: DATE, students, lessons: [lesson()], generatedOn: TODAY,
      records: [
        rec("s0", { attendance: "present", homework: "submitted" }),
        rec("s1", { attendance: "absent", homework: "not_submitted" }),
        rec("s2", { attendance: "present", homework: "unchecked" }),
        // s3: no record at all, s4: record with nothing marked
        rec("s4"),
      ],
    });
    const s = r.summary;
    expect([s.students, s.present, s.absent, s.unmarked]).toEqual([5, 2, 1, 2]);
    expect(s.attendancePct).toBe(66.7); // 2 / (2 + 1): the 2 unmarked are NOT in the denominator
    expect(s.homework).toMatchObject({ kind: "simple", submitted: 1, notSubmitted: 1, unchecked: 1, notEntered: 2, pct: 50 });
    const view = buildDailyView(r);
    const attOf = (id: string) => view.table.rows[r.rows.findIndex((x) => x.studentId === id)][2].text;
    expect([attOf("s0"), attOf("s1"), attOf("s2"), attOf("s3"), attOf("s4")]).toEqual(["Keldi", "Kelmadi", "Keldi", "Belgilanmagan", "Belgilanmagan"]);
    expect(view.table.rows.map((row) => row[3].text)).toContain("Kiritilmagan");
  });

  it("test: a real 0 is a score, a missing score is not; the Natija column exists only when a test was held", () => {
    const { students, lesson, rec, group } = subjectData("history", 4);
    const withTest = buildSubjectDaily({
      subject: "history", group, date: DATE, students, generatedOn: TODAY,
      lessons: [lesson({ has_test: true, test_title: "Nazorat 1", test_max: 20 })],
      records: [rec("s0", { score: 0 }), rec("s1", { score: 20 }), rec("s2", { score: 10 }), rec("s3", { score: null })],
    });
    const t = withTest.summary.test!;
    expect(t).toMatchObject({ max: 20, entered: 3, missing: 1, zeros: 1, highest: 20, lowest: 0, avgScore: 10, avgPct: 50 });
    const v = buildDailyView(withTest);
    expect(v.table.columns.map((c) => c.header)).toContain("Natija");
    const natija = v.table.columns.findIndex((c) => c.header === "Natija");
    const cell = (i: number) => v.table.rows[i][natija].text;
    const byName = (n: string) => withTest.rows.findIndex((x) => x.name === n);
    expect(cell(byName(students[0].name))).toBe("0/20 • 0%"); // genuine zero
    expect(cell(byName(students[3].name))).toBe("—"); // missing
    expect(v.info.some((i) => i.label === "Test")).toBe(true);

    const noTest = buildSubjectDaily({ subject: "history", group, date: DATE, students, lessons: [lesson()], records: [rec("s0", { score: 7 })], generatedOn: TODAY });
    expect(noTest.test).toBeNull();
    expect(noTest.summary.test).toBeNull();
    expect(buildDailyView(noTest).table.columns.map((c) => c.header)).not.toContain("Natija");
  });

  it("a switched-off test is not reported even though its scores are stored", () => {
    const { students, lesson, rec, group } = subjectData("math", 2);
    const r = buildSubjectDaily({ subject: "math", group, date: DATE, students, generatedOn: TODAY, lessons: [lesson({ has_test: false, test_max: 30 })], records: [rec("s0", { score: 25 })] });
    expect(r.test).toBeNull();
    expect(r.rows.every((x) => x.score === null)).toBe(true);
  });

  it("scopes strictly to subject, group and date", () => {
    const { students, lesson, rec, group } = subjectData("math", 2);
    const other = subjectData("history", 2);
    const r = buildSubjectDaily({
      subject: "math", group, date: DATE, generatedOn: TODAY,
      students: [...students, ...other.students.map((s) => ({ ...s, id: `h-${s.id}` })), { ...students[0], id: "x", group_id: "other", name: "Boshqa guruh" }],
      lessons: [lesson(), lesson({ id: "l2", lesson_date: "2026-11-05", topic: "Boshqa kun" }), other.lesson({ id: "lh" })],
      records: [rec("s0", { attendance: "present" }), { ...rec("s1"), lesson_id: "l2", attendance: "absent" }],
    });
    expect(r.rows.map((x) => x.name).sort()).toEqual(students.map((s) => s.name).sort());
    expect(r.topic).toBe("Kvadrat tenglamalar");
    expect(r.summary.absent).toBe(0); // the 5-Nov absence is not part of the 4-Nov report
  });

  it("historical roster: students created later or archived earlier are not listed unless they have a record that day", () => {
    const { students, lesson, rec, group } = subjectData("math", 4);
    const roster = students.map((s, i) =>
      i === 1 ? { ...s, created_at: "2026-11-05T05:00:00Z" } // joined after the lesson
      : i === 2 ? { ...s, archived_at: "2026-11-02T05:00:00Z" } // left before the lesson
      : i === 3 ? { ...s, archived_at: "2026-11-02T05:00:00Z" } // left before, but has a record that day
      : s,
    );
    const r = buildSubjectDaily({ subject: "math", group, date: DATE, students: roster, lessons: [lesson()], records: [rec("s3", { attendance: "present" })], generatedOn: TODAY });
    expect(r.rows.map((x) => x.studentId).sort()).toEqual(["s0", "s3"]);
  });

  it("no lesson row and no records means there is nothing to export (hasData=false); dates list is the group's lessons", () => {
    const { students, lesson, group } = subjectData("math", 2);
    const r = buildSubjectDaily({ subject: "math", group, date: "2026-11-01", students, lessons: [lesson()], records: [], generatedOn: TODAY });
    expect(r.hasData).toBe(false);
    expect(subjectLessonDates("math", "g", [lesson(), lesson({ id: "l9", lesson_date: "2026-10-01" })])).toEqual([DATE, "2026-10-01"]);
  });
});

// ---------------------------------------------------------------------------------------------
// Ingliz tili fixtures

function englishData() {
  const group = { id: "g", name: "Beginner A" };
  const mk = (id: string, name: string, extra: Partial<Student> = {}): Student => ({ id, group_id: "g", name, archived_at: null, created_at: "2026-09-01T05:00:00Z", ...extra });
  const students = [mk("a", "Aziza Karimova"), mk("b", "Bobur Aliyev"), mk("c", "Dilshod Rahimov"), mk("d", "Eldor Toshev")];
  const les = (id: string, student_id: string, lesson_date: string, attendance: Lesson["attendance"], homework: Lesson["homework"] = null): Lesson => ({
    id, student_id, topic_id: null, topic_title: "Dars", lesson_date, attendance, homework, created_at: `${lesson_date}T05:00:00Z`,
  });
  const lessons: Lesson[] = [
    les("l-a-1", "a", "2026-11-02", "present", "full"),
    les("l-a-2", "a", "2026-11-03", "present", "full"),
    les("l-a-3", "a", DATE, "present"),
    les("l-b", "b", DATE, "absent"),
    les("l-c", "c", DATE, "present"),
    // d: no lesson row at all on DATE
  ];
  const plans: LessonPlan[] = [{ id: "p", group_id: "g", lesson_date: DATE, topic: "Present Simple — Positive & Negative", homework: null, updated_at: "" }];
  const task = (id: string, position: number, title: string, over: Partial<HwTask> = {}): HwTask => ({
    id, group_id: "g", lesson_date: DATE, title, due_date: null, position, archived_at: null, created_at: `2026-11-04T0${position}:00:00Z`, ...over,
  });
  const tasks = [task("t1", 1, "Workbook p.12 ex. 1-3"), task("t2", 2, "Learn 10 words"), task("t3", 3, "Reading", { due_date: "2026-11-09" }), task("old", 4, "Archived task", { archived_at: "2026-11-05T00:00:00Z" })];
  const assigned = new Set(["t1|a", "t2|a", "t3|a", "t1|b", "t2|b", "t1|c", "t2|c", "t3|c", "old|a"]);
  const as = (task_id: string, student_id: string, status: Assessment["status"], rewarded_on: string | null = status === "full" ? DATE : null): Assessment => ({
    task_id, student_id, status, coins: status === "full" ? 1 : 0, graded_at: `${DATE}T10:00:00Z`, rewarded_on, completed_late: false, original_status: null, original_graded_at: null,
  });
  const assessments = [as("t1", "a", "full"), as("t2", "a", "full"), as("t3", "a", "partial"), as("t1", "b", "not_done"), as("t2", "b", "not_done"), as("t1", "c", "full")];
  const assessMap = new Map(assessments.map((x) => [`${x.task_id}|${x.student_id}`, x]));
  const coinEvents: CoinEvent[] = taskCoinEvents(assessments);
  return { group, students, lessons, plans, tasks, assigned, assessMap, coinEvents };
}

describe("english daily report (Smart Homework, existing coins)", () => {
  const e = englishData();
  const report = () =>
    buildEnglishDaily({ group: e.group, date: DATE, students: e.students, lessons: e.lessons, plans: e.plans, tasks: e.tasks, assignedSet: e.assigned, assessMap: e.assessMap, coinEvents: e.coinEvents, transfersByStudent: new Map(), generatedOn: TODAY });

  it("assesses each student only against tasks actually assigned to them; archived tasks are not part of the day", () => {
    const r = report();
    expect(r.tasks.map((t) => t.id)).toEqual(["t1", "t2", "t3"]);
    const hw = (name: string) => r.rows.find((x) => x.name === name)!.homework;
    expect(hw("Aziza Karimova")).toMatchObject({ assigned: 3, graded: 3, full: 2, partial: 1, overall: "partial", tasks: ["full", "full", "partial"] });
    expect(hw("Bobur Aliyev")).toMatchObject({ assigned: 2, graded: 2, notDone: 2, overall: "not_done", tasks: ["not_done", "not_done", "unassigned"] });
    expect(hw("Dilshod Rahimov")).toMatchObject({ assigned: 3, graded: 1, full: 1, overall: "pending", tasks: ["full", "ungraded", "ungraded"] });
    expect(hw("Eldor Toshev")).toMatchObject({ assigned: 0, overall: "none" });
  });

  it("coins equal the existing Bugun calculation (lesson coins + Smart Homework coins of that date) and nothing is recalculated", () => {
    const r = report();
    const coinsOf = (id: string) => r.rows.find((x) => x.studentId === id)!.coins;
    // Aziza: lesson 4 Nov has no homework grade -> 0 base; her 3-lesson full streak is NOT on this day; 2 task coins on DATE
    const azLessons = e.lessons.filter((l) => l.student_id === "a");
    const todays = scoreLessons(azLessons).find((s) => s.lesson.lesson_date === DATE)!.coins;
    expect(coinsOf("a")).toBe(todays + 2);
    expect(coinsOf("b")).toBe(0);
    expect(coinsOf("c")).toBe(1);
    expect(r.summary.coins).toBe(todays + 2 + 0 + 1 + 0);
  });

  it("attendance: no lesson row = Belgilanmagan, never Kelmadi", () => {
    const r = report();
    expect(r.rows.map((x) => [x.name, x.attendance])).toEqual([
      ["Aziza Karimova", "present"], ["Bobur Aliyev", "absent"], ["Dilshod Rahimov", "present"], ["Eldor Toshev", null],
    ]);
    expect(r.summary).toMatchObject({ present: 2, absent: 1, unmarked: 1, attendancePct: 66.7 });
  });

  it("summary counts students and task slots with the right denominators", () => {
    const h = report().summary.homework;
    expect(h).toMatchObject({ kind: "smart", full: 0, partial: 1, notDone: 1, pending: 1, none: 1, slotsAssigned: 8, slotsGraded: 6, slotsFull: 3, slotsUngraded: 2 });
    expect(h.pct).toBe(50); // 3 full of 6 graded slots, ungraded slots are not failures
  });

  it("view: progress like 2/3, the five statuses, appendix with the numbered task list, topic and coins column", () => {
    const v = buildDailyView(report());
    const col = v.table.columns.map((c) => c.header);
    expect(col).toEqual(["№", "O‘quvchi F.I.Sh.", "Davomat", "Uy vazifasi", "Tanga"]);
    const texts = v.table.rows.map((r) => r[3].text);
    expect(texts[0]).toBe("Chala · 2/3");
    expect(texts[1]).toBe("Qilmadi · 0/2");
    expect(texts[2]).toContain("Qisman baholangan");
    expect(texts[3]).toBe("Berilmagan");
    expect(v.info.find((i) => i.label === "Mavzu")!.value).toBe("Present Simple — Positive & Negative");
    expect(v.appendix!.intro).toHaveLength(3);
    expect(v.appendix!.rows[2].map((c) => c.text)).toEqual(["3", "Dilshod Rahimov", "To‘liq", "Baholanmagan", "Baholanmagan"]);
    expect(v.appendix!.rows[1].map((c) => c.text).slice(2)).toEqual(["Qilmadi", "Qilmadi", "Berilmagan"]);
    expect(v.wide).toBe(false);
  });

  it("legacy per-lesson homework grade shows only when the student has no tasks", () => {
    const lessons = [...e.lessons.filter((l) => l.id !== "l-c"), { ...e.lessons.find((l) => l.id === "l-c")!, homework: "partial" as const }];
    const r = buildEnglishDaily({ group: e.group, date: DATE, students: e.students, lessons, plans: e.plans, tasks: [], assignedSet: new Set(), assessMap: new Map(), coinEvents: [], transfersByStudent: new Map(), generatedOn: TODAY });
    const v = buildDailyView(r);
    expect(v.table.rows.find((x) => x[1].text === "Dilshod Rahimov")![3].text).toBe("Chala (umumiy baho)");
    expect(v.appendix).toBeNull();
  });

  it("many tasks switch the PDF to landscape; previous dates are listed", () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ ...e.tasks[0], id: `m${i}`, position: i + 10, title: `Vazifa ${i}` }));
    const r = buildEnglishDaily({ group: e.group, date: DATE, students: e.students, lessons: e.lessons, plans: e.plans, tasks: many, assignedSet: new Set(many.map((t) => `${t.id}|a`)), assessMap: new Map(), coinEvents: [], transfersByStudent: new Map(), generatedOn: TODAY });
    expect(buildDailyView(r).wide).toBe(true);
    expect(englishLessonDates("g", e.students, e.lessons, e.plans, e.tasks)).toEqual([DATE, "2026-11-03", "2026-11-02"]);
  });

  it("is read-only: inputs are not mutated", () => {
    const snap = JSON.stringify([e.lessons, e.tasks, [...e.assessMap], e.coinEvents, e.students]);
    report();
    expect(JSON.stringify([e.lessons, e.tasks, [...e.assessMap], e.coinEvents, e.students])).toBe(snap);
  });
});

// ---------------------------------------------------------------------------------------------
// Files

describe("HTML export", () => {
  const { students, lesson, rec, group } = subjectData("math", 4);
  const r = buildSubjectDaily({
    subject: "math", group, date: DATE, students, generatedOn: TODAY,
    lessons: [lesson({ topic: "<img src=x onerror=alert(1)> Mavzu & “qavs”", has_test: true, test_title: "<b>Nazorat</b>", test_max: 20 })],
    records: [rec("s0", { attendance: "present", homework: "submitted", score: 0 }), rec("s3", { attendance: "absent", homework: "not_submitted", score: 12 })],
  });
  const html = renderDailyHtml(buildDailyView(r), portraitDataUri(portrait));

  it("is standalone: no remote resources, no external scripts, portrait embedded as a data URI", () => {
    expect(html).not.toMatch(/(src|href)\s*=\s*["']?https?:/i);
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/@import|url\(\s*["']?https?:/i);
    expect(html).toMatch(/<img class="portrait" src="data:image\/jpeg;base64,[A-Za-z0-9+/=]{1000,}"/);
    expect(html).toContain("Chop etish");
    expect(html).toContain("KUNLIK HISOBOT");
    expect(html).toContain("Teacher: Rustam Usmonov");
    expect(html).toContain("@media print");
    expect(html).toContain('<html lang="uz">');
  });

  it("escapes every user-entered value", () => {
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<b>Nazorat");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; “Q”");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("keeps Uzbek Unicode and shows the zero score as a score", () => {
    expect(html).toContain("O‘quvchi F.I.Sh.");
    expect(html).toContain("0/20 • 0%");
    expect(html).toContain("Oʻtkir Gʻaniyev");
  });
});

describe("PDF export", () => {
  async function pdf(report: ReturnType<typeof buildSubjectDaily>, name: string) {
    const bytes = await buildDailyPdf(buildDailyView(report), { fonts, portrait });
    const file = join(outDir, `${name}.pdf`);
    writeFileSync(file, bytes);
    return file;
  }

  it("math with a test: real A4 PDF, embedded Unicode font, header with top-right portrait, minimal footer, page numbers, no substituted characters", async () => {
    const { students, lesson, rec, group } = subjectData("math", 6);
    const file = await pdf(
      buildSubjectDaily({
        subject: "math", group, date: DATE, students, generatedOn: TODAY,
        lessons: [lesson({ has_test: true, test_title: "Nazorat 1", test_max: 20 })],
        records: students.map((s, i) => rec(s.id, { attendance: i === 4 ? null : i === 1 ? "absent" : "present", homework: (["submitted", "not_submitted", "unchecked", null] as const)[i % 4], score: i === 0 ? 0 : i === 5 ? null : 10 + i })),
      }),
      "math-test",
    );
    expect(pageCount(file)).toBe(1);
    const info = execFileSync("pdfinfo", [file]).toString();
    expect(info).toMatch(/Page size:\s+595\.\d+ x 841\.\d+/); // A4 portrait
    expect(execFileSync("pdffonts", [file]).toString()).toMatch(/DejaVu/);
    const imgs = execFileSync("pdfimages", ["-list", file]).toString();
    expect(imgs).toMatch(/\b480\s+480\b/); // portrait: square, aspect ratio untouched
    expect(imgs).toMatch(/\brgb\b/); // the original colour portrait, not a recoloured copy
    const text = pdfText(file);
    for (const s of ["KUNLIK HISOBOT", "Teacher: Rustam Usmonov", "FAN", "Matematika", "GURUH", "Matematika 1", "04.11.2026", "Kvadrat tenglamalar", "O‘QUVCHILAR SONI", "ARK Education", "Sahifa 1 / 1", "Natija", "Belgilanmagan", "Oʻtkir Gʻaniyev"]) {
      expect(text, s).toContain(s);
    }
    expect(text).not.toContain("?");
    // removed from the PDF only: no summary block, no explanatory bullets, no photo/teacher card in the footer
    for (const s of ["ARK EDUCATION", "KUNLIK DARS", "Dars xulosasi", "Jami o‘quvchilar", "Kelganlar", "Shu kun uchun jami tanga", "Belgilanmagan davomat «Kelmadi»"]) expect(text, s).not.toContain(s);
    expect(text).not.toMatch(/^\s*•\s/m); // score separators ("18/20 • 90%") are fine; bullet-point notes are not
    expect(imgs.trim().split("\n").length - 2).toBe(1); // the portrait appears once (header), never in the footer
    expect(text.split("Teacher: Rustam Usmonov").length - 1).toBe(1); // header only
  });

  it("long names, long topic and a large group paginate: header repeated, footer and numbering on every page, nothing clipped", async () => {
    const { students, lesson, rec, group } = subjectData("history", 70);
    const long = students.map((s, i) => (i % 9 === 0 ? { ...s, name: `Abdurahmonovich-Qodirxonovich Muhammadjonbekzoda Ismoilov ${i}` } : s));
    const file = await pdf(
      buildSubjectDaily({
        subject: "history", group, date: DATE, students: long, generatedOn: TODAY,
        lessons: [lesson({ topic: "Amir Temur davlatining tashkil topishi, ichki va tashqi siyosati, madaniy hayoti va uning jahon tarixidagi o‘rni haqida uzoq mavzu nomi ".repeat(3), has_test: true, test_max: 100 })],
        records: long.map((s, i) => rec(s.id, { attendance: i % 5 === 0 ? "absent" : "present", homework: i % 3 === 0 ? "not_submitted" : "submitted", score: i % 11 === 0 ? null : (i * 7) % 101 })),
      }),
      "history-large",
    );
    const n = pageCount(file);
    expect(n).toBeGreaterThanOrEqual(3);
    const text = pdfText(file);
    for (let p = 1; p <= n; p++) expect(text).toContain(`Sahifa ${p} / ${n}`);
    expect(execFileSync("pdfimages", ["-list", file]).toString().trim().split("\n").length - 2).toBe(1); // portrait only on the first page
    // every page that carries student rows repeats the table header
    const tablePages = text.split("\f").filter((pg) => /\b(Keldi|Kelmadi)\b/.test(pg));
    expect(tablePages.length).toBeGreaterThanOrEqual(2);
    for (const pg of tablePages) expect(pg).toContain("O‘quvchi F.I.Sh.");
    expect(text).not.toContain("?");
  });

  it("english with several tasks: statuses, progress and appendix are in the PDF", async () => {
    const e = englishData();
    const r = buildEnglishDaily({ group: e.group, date: DATE, students: e.students, lessons: e.lessons, plans: e.plans, tasks: e.tasks, assignedSet: e.assigned, assessMap: e.assessMap, coinEvents: e.coinEvents, transfersByStudent: new Map(), generatedOn: TODAY });
    const file = join(outDir, "english.pdf");
    writeFileSync(file, await buildDailyPdf(buildDailyView(r), { fonts, portrait }));
    const text = pdfText(file);
    for (const s of ["Ingliz tili", "Beginner A", "Present Simple", "Chala · 2/3", "Qilmadi · 0/2", "Qisman baholangan", "Berilmagan", "Ilova: berilgan vazifalar", "1-vazifa", "Tanga"]) {
      expect(text, s).toContain(s);
    }
    expect(text).not.toContain("?");
    writeFileSync(join(outDir, "english.html"), renderDailyHtml(buildDailyView(r), portraitDataUri(portrait)));
  });

  it("6 students and 1 task fit ONE A4 page: no summary, task details kept under the main table, photo top right only", async () => {
    const names = ["Aliyev Vali", "Karimova Madina", "Qodirov Jasur", "Rahimova Nigora", "Tursunov Sardor", "Yusupova Dilnoza"];
    const students: Student[] = names.map((name, i) => ({ id: `s${i}`, group_id: "g", name, archived_at: null, created_at: "2026-09-01T05:00:00Z" }));
    const lessons: Lesson[] = students.map((s, i) => ({ id: `l${i}`, student_id: s.id, topic_id: null, topic_title: "Dars", lesson_date: DATE, attendance: i === 3 ? "absent" : "present", homework: null, created_at: `${DATE}T05:00:00Z` }));
    const tasks: HwTask[] = [{ id: "t1", group_id: "g", lesson_date: DATE, title: "Workbook p.12 ex. 1-3", due_date: null, position: 1, archived_at: null, created_at: `${DATE}T01:00:00Z` }];
    const assignedSet = new Set(students.map((s) => `t1|${s.id}`));
    const ass: Assessment[] = students.slice(0, 5).map((s, i) => ({ task_id: "t1", student_id: s.id, status: i % 2 ? "partial" : "full", coins: i % 2 ? 0 : 1, graded_at: `${DATE}T10:00:00Z`, rewarded_on: i % 2 ? null : DATE, completed_late: false, original_status: null, original_graded_at: null }));
    const r = buildEnglishDaily({ group: { id: "g", name: "Grop 1 404" }, date: DATE, students, lessons, plans: [{ id: "p", group_id: "g", lesson_date: DATE, topic: "Present Simple", homework: "12-mashq", updated_at: "" }], tasks, assignedSet, assessMap: new Map(ass.map((x) => [`${x.task_id}|${x.student_id}`, x])), coinEvents: taskCoinEvents(ass), transfersByStudent: new Map(), generatedOn: TODAY });
    const file = join(outDir, "english-6x1.pdf");
    writeFileSync(file, await buildDailyPdf(buildDailyView(r), { fonts, portrait }));
    expect(pageCount(file)).toBe(1);
    const text = pdfText(file);
    for (const s of ["O‘quvchilar jurnali", "Ilova: berilgan vazifalar", "1-vazifa", "Workbook p.12 ex. 1-3", "Aliyev Vali", "Yusupova Dilnoza", "ARK Education", "Sahifa 1 / 1", "Tanga"]) expect(text, s).toContain(s);
    for (const s of ["Dars xulosasi", "Jami o‘quvchilar"]) expect(text, s).not.toContain(s);
    expect(execFileSync("pdfimages", ["-list", file]).toString().trim().split("\n").length - 2).toBe(1);
  });

  it("writes sample HTML files for manual inspection", () => {
    const { students, lesson, rec, group } = subjectData("history", 8);
    const r = buildSubjectDaily({ subject: "history", group, date: DATE, students, generatedOn: TODAY, lessons: [lesson({ has_test: true, test_title: "Nazorat", test_max: 30 })], records: students.map((s, i) => rec(s.id, { attendance: i === 2 ? "absent" : i === 5 ? null : "present", homework: (["submitted", "not_submitted", "unchecked", null] as const)[i % 4], score: i === 1 ? 0 : i === 3 ? null : 12 + i })) });
    writeFileSync(join(outDir, "history.html"), renderDailyHtml(buildDailyView(r), portraitDataUri(portrait)));
  });
});

// ---------------------------------------------------------------------------------------------
// Historical correctness (old dates): group transfers, archived graded tasks

describe("old-date reports do not invent or lose history", () => {
  const tr = (student_id: string, from: string | null, to: string | null, at: string): GroupTransfer => ({ id: `${student_id}${at}`, student_id, from_group_id: from, to_group_id: to, transferred_at: at, note: null });

  it("groupOnDate: before / same day / after a transfer; no history = current group; deleted group is never guessed", () => {
    const t = [tr("c", "g", "g2", "2026-11-05T05:00:00Z")]; // 5 Nov 10:00 Tashkent
    expect(groupOnDate("g2", t, "2026-11-04")).toBe("g");
    expect(groupOnDate("g2", t, "2026-11-05")).toBe("g2"); // same day counts as moved (day granularity)
    expect(groupOnDate("g2", t, "2026-11-06")).toBe("g2");
    expect(groupOnDate("g", undefined, "2026-01-01")).toBe("g");
    expect(groupOnDate("g2", [tr("c", null, "g2", "2026-11-05T05:00:00Z")], "2026-11-04")).toBeNull();
    const two = [tr("c", "g", "g2", "2026-11-05T05:00:00Z"), tr("c", "g2", "g3", "2026-11-08T05:00:00Z")];
    expect([groupOnDate("g3", two, "2026-11-04"), groupOnDate("g3", two, "2026-11-06"), groupOnDate("g3", two, "2026-11-09")]).toEqual(["g", "g2", "g3"]);
  });

  it("a student moved to another group appears only in the group they were in on that date", () => {
    const e = englishData();
    const students = e.students.map((s) => (s.id === "c" ? { ...s, group_id: "g2" } : s)); // c is in g2 today
    const transfers = new Map([["c", [tr("c", "g", "g2", "2026-11-05T05:00:00Z")]]]);
    const base = { date: DATE, students, lessons: e.lessons, plans: e.plans, tasks: e.tasks, assignedSet: e.assigned, assessMap: e.assessMap, coinEvents: e.coinEvents, transfersByStudent: transfers, generatedOn: TODAY };
    const old = buildEnglishDaily({ ...base, group: { id: "g", name: "Beginner A" } });
    expect(old.rows.map((r) => r.studentId)).toContain("c"); // on 4 Nov c was still in g
    const other = buildEnglishDaily({ ...base, group: { id: "g2", name: "Beginner B" } });
    expect(other.rows.map((r) => r.studentId)).not.toContain("c"); // not in g2 yet
    const later = buildEnglishDaily({ ...base, date: "2026-11-06", group: { id: "g", name: "Beginner A" } });
    expect(later.rows.map((r) => r.studentId)).not.toContain("c"); // gone from g after the move
    // lesson dates follow the same history
    expect(englishLessonDates("g2", students, e.lessons, e.plans, [], transfers)).toEqual([]);
    expect(englishLessonDates("g", students, e.lessons, e.plans, [], transfers)).toContain(DATE);
  });

  it("archived tasks: kept when graded (their assessments and coins still exist), dropped when never graded", () => {
    const e = englishData();
    const archivedGraded: HwTask = { ...e.tasks[0], id: "arch", title: "Eski vazifa", position: 9, archived_at: "2026-11-05T00:00:00Z" };
    const gradedKey = "arch|a";
    const assessMap = new Map(e.assessMap);
    assessMap.set(gradedKey, { ...[...e.assessMap.values()][0], task_id: "arch", student_id: "a", status: "full" });
    const r = buildEnglishDaily({ group: e.group, date: DATE, students: e.students, lessons: e.lessons, plans: e.plans, tasks: [...e.tasks, archivedGraded], assignedSet: new Set([...e.assigned, gradedKey]), assessMap, coinEvents: e.coinEvents, transfersByStudent: new Map(), generatedOn: TODAY });
    expect(r.tasks.map((t) => [t.id, t.archived])).toEqual([["t1", false], ["t2", false], ["t3", false], ["arch", true]]); // "old" (archived, never graded) is not there
    const v = buildDailyView(r);
    expect(v.appendix!.intro!.some((l) => l.includes("[arxivlangan]"))).toBe(true);
    expect(v.notes.some((n) => n.includes("arxivlangan"))).toBe(true);
  });

  it("past dates carry an honest note about how the roster was reconstructed; today's report does not", () => {
    const { students, lesson, rec, group } = subjectData("math", 2);
    const past = buildDailyView(buildSubjectDaily({ subject: "math", group, date: DATE, students, lessons: [lesson()], records: [rec("s0")], generatedOn: TODAY }));
    expect(past.notes.some((n) => n.includes("tiklangan"))).toBe(true);
    const same = buildDailyView(buildSubjectDaily({ subject: "math", group, date: DATE, students, lessons: [lesson()], records: [rec("s0")], generatedOn: DATE }));
    expect(same.notes.some((n) => n.includes("tiklangan"))).toBe(false);
  });
});
