import type { ReportModel } from "./report";
import { SUBJECTS } from "./types";

/**
 * Turns a ReportModel into display strings. BOTH the PDF and the HTML export render these tables,
 * so every exported figure comes from one calculation (report.ts) and one formatting step (here).
 */

export const REPORT_BRAND = "ARK Education";
export const REPORT_TITLE = "Ark Progress — O‘quvchilar hisoboti";

export interface TableColumn {
  header: string;
  sub?: string;
  align: "left" | "center" | "right";
}
export interface ReportTable {
  id: string;
  title: string;
  legend?: string;
  columns: TableColumn[];
  rows: string[][];
  /** Column 0 is the row label; the remaining columns may be split across pages / table blocks. */
  chunk?: boolean;
}

export const fmtP = (v: number | null): string => (v === null ? "—" : `${v.toLocaleString("en-US", { maximumFractionDigits: 1 })}%`);
const ratio = (n: number, d: number) => (d === 0 ? "—" : `${n}/${d}`);

export function dmy(iso: string, withYear: boolean): string {
  const [y, m, d] = iso.split("-");
  return withYear ? `${d}.${m}.${y.slice(2)}` : `${d}.${m}`;
}
export function fullDate(iso: string): string {
  return dmy(iso, false) + "." + iso.slice(0, 4);
}

export function reportFileBase(m: ReportModel): string {
  const slug = `${m.subject}-${m.groupName}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || m.subject;
  return `ark-progress-hisobot-${slug}-${m.from}_${m.to}`;
}

export function reportMeta(m: ReportModel) {
  return {
    brand: REPORT_BRAND,
    title: REPORT_TITLE,
    info: [
      ["Fan", SUBJECTS[m.subject].label],
      ["Guruh", m.groupName],
      ["Hisobot davri", `${fullDate(m.from)} – ${fullDate(m.to)}`],
      ["Yaratilgan sana", fullDate(m.generatedOn)],
    ] as [string, string][],
    summary: [
      ["O‘quvchilar", String(m.summary.students)],
      ["Darslar", String(m.summary.lessons)],
      ["Davomat", fmtP(m.summary.attendancePct)],
      ["Vazifa bajarilishi", fmtP(m.summary.homeworkPct)],
      ["Testlar soni", String(m.summary.testsCount)],
      ["O‘rtacha test foizi", fmtP(m.summary.avgTestPct)],
    ] as [string, string][],
  };
}

const ATT = { present: "+", absent: "−" } as const;
const HW = { submitted: "T", not_submitted: "Tm", unchecked: "Tk" } as const;

export function reportTables(m: ReportModel): ReportTable[] {
  const yearSpan = new Set(m.dates.map((d) => d.slice(0, 4))).size > 1;
  const tables: ReportTable[] = [];

  if (m.dates.length === 0) return tables;

  tables.push({
    id: "lessons",
    title: "Darslar",
    columns: [
      { header: "Sana", align: "left" },
      { header: "O‘tilgan mavzu", align: "left" },
    ],
    rows: m.dates.map((d) => [dmy(d, true), m.topicByDate[d] ?? "—"]),
  });

  const dateCols: TableColumn[] = m.dates.map((d) => ({ header: dmy(d, yearSpan), align: "center" }));
  tables.push({
    id: "attendance",
    title: "Davomat",
    legend: "+ Keldi    − Kelmadi    · Belgilanmagan",
    columns: [{ header: "O‘quvchi", align: "left" }, ...dateCols],
    rows: m.rows.map((r) => [r.name, ...m.dates.map((d) => (r.attendance[d] ? ATT[r.attendance[d]!] : "·"))]),
    chunk: true,
  });
  tables.push({
    id: "homework",
    title: "Uy vazifasi",
    legend: "T Topshirdi    Tm Topshirmadi    Tk Tekshirilmagan    · Kiritilmagan",
    columns: [{ header: "O‘quvchi", align: "left" }, ...dateCols],
    rows: m.rows.map((r) => [r.name, ...m.dates.map((d) => (r.homework[d] ? HW[r.homework[d]!] : "·"))]),
    chunk: true,
  });

  if (m.tests.length) {
    tables.push({
      id: "scores",
      title: "Test ballari",
      legend: "— ball kiritilmagan (0 ball emas). 0 — haqiqiy nol ball.",
      columns: [
        { header: "O‘quvchi", align: "left" },
        ...m.tests.map((t) => ({ header: dmy(t.date, yearSpan), sub: `/${t.max}${t.title ? ` ${t.title}` : ""}`, align: "center" as const })),
      ],
      rows: m.rows.map((r) => [r.name, ...m.tests.map((t) => (r.scores[t.lessonId] === null ? "—" : `${r.scores[t.lessonId]}/${t.max}`))]),
      chunk: true,
    });
    tables.push({
      id: "test-summary",
      title: "Testlar bo‘yicha guruh natijasi",
      columns: [
        { header: "Test", align: "left" },
        { header: "Maks. ball", align: "right" },
        { header: "Kiritilgan", align: "right" },
        { header: "Kiritilmagan", align: "right" },
        { header: "O‘rtacha", align: "right" },
        { header: "Eng yuqori", align: "right" },
        { header: "Eng past", align: "right" },
      ],
      rows: m.testSummaries.map((t) => [
        `${dmy(t.date, true)}${t.title ? ` ${t.title}` : ""}`,
        String(t.max),
        String(t.entered),
        String(t.missing),
        fmtP(t.avgPct),
        t.highest === null ? "—" : `${t.highest}/${t.max}`,
        t.lowest === null ? "—" : `${t.lowest}/${t.max}`,
      ]),
    });
  }

  tables.push({
    id: "students",
    title: "O‘quvchilar bo‘yicha yakuniy ko‘rsatkichlar",
    legend: "Foizlar faqat belgilangan ma’lumotdan hisoblanadi: belgilanmagan davomat va tekshirilmagan vazifa hisobga olinmaydi.",
    columns: [
      { header: "O‘quvchi", align: "left" },
      { header: "Davomat", sub: "keldi / belgilangan", align: "right" },
      { header: "Davomat %", align: "right" },
      { header: "Vazifa", sub: "topshirdi / baholangan", align: "right" },
      { header: "Vazifa %", align: "right" },
      { header: "Testlar", sub: "ball kiritilgan", align: "right" },
      { header: "O‘rtacha test %", align: "right" },
    ],
    rows: [
      ...m.rows.map((r) => [
        r.name,
        ratio(r.present, r.present + r.absent),
        fmtP(r.attendancePct),
        ratio(r.submitted, r.submitted + r.notSubmitted),
        fmtP(r.homeworkPct),
        m.tests.length ? `${r.testsTaken}/${m.tests.length}` : "—",
        fmtP(r.avgTestPct),
      ]),
      ["Guruh bo‘yicha", "", fmtP(m.summary.attendancePct), "", fmtP(m.summary.homeworkPct), String(m.summary.testsCount), fmtP(m.summary.avgTestPct)],
    ],
  });
  return tables;
}
