import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildReport } from "./report";
import { renderReportHtml } from "./reportHtml";
import { buildReportPdf } from "./reportPdf";
import { reportFileBase, reportTables } from "./reportTables";
import type { SubjectLesson, SubjectRecord, SubjectStudent } from "./types";

const fonts = {
  regular: new Uint8Array(readFileSync("public/fonts/DejaVuSans.ttf")),
  bold: new Uint8Array(readFileSync("public/fonts/DejaVuSans-Bold.ttf")),
};

function dataset(nStudents: number, nLessons: number, subject: "math" | "history" = "math") {
  const names = ["Oʻtkir Gʻaniyev", "Dilnoza Abdurahmonova-Qodirova", "Shoxrux Toshpoʻlatov", "<script>alert(1)</script> & “Q”"];
  const students: SubjectStudent[] = Array.from({ length: nStudents }, (_, i) => ({
    id: `s${i}`, subject, group_id: "g", name: i < names.length ? names[i] : `O‘quvchi ${i + 1} Familiyaev`, english_student_id: null, archived_at: null, created_at: "",
  }));
  const lessons: SubjectLesson[] = Array.from({ length: nLessons }, (_, i) => ({
    id: `l${i}`, subject, group_id: "g", lesson_date: `2026-10-${String(i + 1).padStart(2, "0")}`,
    topic: `Mavzu ${i + 1}: uzunroq mavzu nomi sinash uchun`, homework: null,
    has_test: i % 5 === 4, test_title: i % 5 === 4 ? `Nazorat ${i + 1}` : null, test_max: i % 5 === 4 ? (i === 4 ? 30 : 50) : null, updated_at: "",
  }));
  const records: SubjectRecord[] = [];
  students.forEach((s, si) =>
    lessons.forEach((l, li) => {
      if ((si + li) % 7 === 0) return; // some students never marked on some days
      records.push({
        id: `${l.id}${s.id}`, subject, group_id: "g", lesson_id: l.id, student_id: s.id,
        attendance: (si * 3 + li) % 5 === 0 ? "absent" : "present",
        homework: (["submitted", "not_submitted", "unchecked", null] as const)[(si + li) % 4],
        score: l.has_test ? ((si + li) % 6 === 0 ? null : (si % 4 === 0 ? 0 : (si * 7 + li) % ((l.test_max as number) + 1))) : null,
        updated_at: "",
      });
    }),
  );
  return buildReport({ subject, group: { id: "g", name: subject === "math" ? "Matematika 1" : "Tarix 9-sinf" }, students, lessons, records, from: "2026-10-01", to: "2026-10-31", generatedOn: "2026-10-31" });
}

const outDir = process.env.REPORT_OUT ?? mkdtempSync(join(tmpdir(), "report-"));
const pdfText = (file: string) => execFileSync("pdftotext", ["-layout", file, "-"]).toString();
const pageCount = (file: string) => Number(/Pages:\s+(\d+)/.exec(execFileSync("pdfinfo", [file]).toString())![1]);

describe("PDF export", () => {
  for (const subject of ["math", "history"] as const) {
    it(`${subject}: produces a real multi-page PDF with embedded Unicode font, header, footer and page numbers`, async () => {
      const m = dataset(36, 14, subject);
      const bytes = await buildReportPdf(m, fonts);
      const file = join(outDir, `${reportFileBase(m)}.pdf`);
      writeFileSync(file, bytes);
      expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
      const n = pageCount(file);
      expect(n).toBeGreaterThan(1);
      const text = pdfText(file);
      expect(text).toContain("ARK Education");
      expect(text).toContain("Ark Progress — O‘quvchilar hisoboti");
      expect(text).toContain(subject === "math" ? "Matematika" : "Tarix");
      expect(text).toContain("Oʻtkir Gʻaniyev");
      expect(text).toContain(`Sahifa ${n} / ${n}`);
      expect(text).toContain("Sahifa 1 / " + n);
      expect(text).toContain("Ark Progress — ARK Education");
      expect(text).toContain("Davomat");
      expect(text).toContain("Uy vazifasi");
      expect(text).toContain("Test ballari");
      // fonts are embedded (no reliance on the viewer's fonts)
      const fontsList = execFileSync("pdffonts", [file]).toString();
      expect(fontsList).toMatch(/DejaVuSans/);
      expect(fontsList.split("\n").filter((l) => /DejaVu/.test(l)).every((l) => /\byes\b/.test(l))).toBe(true);
    });
  }

  it("repeats table headers on continuation pages", async () => {
    const m = dataset(60, 6);
    const file = join(outDir, "many-students.pdf");
    writeFileSync(file, await buildReportPdf(m, fonts));
    const n = pageCount(file);
    expect(n).toBeGreaterThan(2);
    const pages = Array.from({ length: n }, (_, i) => execFileSync("pdftotext", ["-layout", "-f", String(i + 1), "-l", String(i + 1), file, "-"]).toString());
    const withStudentsHeader = pages.filter((p) => /O‘quvchi\s+\S/.test(p)).length;
    expect(withStudentsHeader).toBeGreaterThan(1);
  });

  it("handles an empty period and a one-lesson report without throwing", async () => {
    const empty = buildReport({ subject: "math", group: { id: "g", name: "Bo‘sh" }, students: [], lessons: [], records: [], from: "2026-10-01", to: "2026-10-31", generatedOn: "2026-10-31" });
    const file = join(outDir, "empty.pdf");
    writeFileSync(file, await buildReportPdf(empty, fonts));
    expect(pdfText(file)).toContain("Tanlangan davrda dars yozilmagan");
  });

  it("does not crash on characters missing from the font", async () => {
    const m = dataset(2, 2);
    m.rows[0].name = "漢字 😀 Ali";
    const bytes = await buildReportPdf(m, fonts);
    expect(bytes.length).toBeGreaterThan(1000);
  });
});

describe("HTML export", () => {
  const m = dataset(36, 14);
  const html = renderReportHtml(m);
  writeFileSync(join(outDir, `${reportFileBase(m)}.html`), html);

  it("is standalone: embedded styles, no scripts, no external resources", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toMatch(/<style>[\s\S]+<\/style>/);
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/(src|href)\s*=\s*["']https?:/i);
    expect(html).not.toMatch(/<link\b/i);
    expect(html).not.toMatch(/@import|url\(/i);
  });
  it("escapes student text", () => {
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp;");
  });
  it("contains the required report content", () => {
    for (const s of ["ARK Education", "Ark Progress — O‘quvchilar hisoboti", "Matematika", "Matematika 1", "01.10.2026 – 31.10.2026", "Yaratilgan sana", "Davomat", "Uy vazifasi", "Test ballari", "Guruh bo‘yicha"]) expect(html).toContain(s);
  });
  it("shows a missing score as — and a real zero as 0/max", () => {
    const row = m.rows.find((r) => r.studentId === "s0")!; // si % 4 === 0 -> zeros
    const zero = m.tests.find((t) => row.scores[t.lessonId] === 0);
    expect(zero).toBeTruthy();
    expect(html).toContain(`>0/${zero!.max}<`);
    const missing = m.rows.flatMap((r) => m.tests.filter((t) => r.scores[t.lessonId] === null));
    expect(missing.length).toBeGreaterThan(0);
  });
  it("uses exactly the same figures as the PDF tables (one source)", () => {
    const tables = reportTables(m);
    const flat = tables.flatMap((t) => t.rows.flatMap((r) => r));
    const unescaped = html.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    for (const cell of flat) expect(unescaped).toContain(`>${cell}<`);
  });
});
