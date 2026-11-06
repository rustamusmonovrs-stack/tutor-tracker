import { fmtP, fullDate } from "../subjects/reportTables";
import { pct } from "../subjects/report";
import type { IconName } from "./icons";
import { DAILY_SUBJECT_LABEL, REPORT_TEACHER, type DailyHomework, type DailyReport, type DailyRow, type SmartOverall, type TaskCell } from "./model";

/**
 * Turns a DailyReport into display strings. BOTH the PDF and the HTML render this one view, so the two files can
 * never disagree. `tone` and `icon` drive the coloured status badges in both files.
 */

export const DAILY_BRAND = "ARK Education";
export const DAILY_PDF_TITLE = "KUNLIK HISOBOT";
export const DAILY_HTML_TITLE = "KUNLIK HISOBOT";

export type Tone = "ok" | "bad" | "warn" | "muted" | "faint";

export interface Cell {
  text: string;
  /** Present = rendered as a coloured badge. */
  tone?: Tone;
  icon?: IconName;
}

export interface ViewColumn {
  header: string;
  sub?: string;
  align: "left" | "center" | "right";
  /** Relative width. */
  weight: number;
}

export interface InfoItem {
  label: string;
  value: string;
  /** Long values (the lesson topic) use the full width. */
  wide?: boolean;
  /** The lesson date: shown in its own prominent block. */
  kind?: "date";
}

export interface SummaryItem {
  label: string;
  value: string;
  sub?: string;
  tone?: Tone;
}

export interface ViewTable {
  title: string;
  /** Shown above the table (e.g. the numbered task list is passed as `intro`). */
  intro?: string[];
  legend?: string;
  columns: ViewColumn[];
  rows: Cell[][];
}

export interface DailyView {
  brand: string;
  teacher: string;
  pdfTitle: string;
  htmlTitle: string;
  info: InfoItem[];
  table: ViewTable;
  summaryTitle: string;
  summary: SummaryItem[];
  appendix: ViewTable | null;
  notes: string[];
  /** A genuinely wide table (many tasks): the PDF switches to landscape. */
  wide: boolean;
  fileBase: string;
  dateLabel: string;
  subjectLabel: string;
  groupName: string;
}

export const ATT_LABEL = { present: "Keldi", absent: "Kelmadi", none: "Belgilanmagan" } as const;
export const SIMPLE_HW_LABEL = { submitted: "Topshirdi", not_submitted: "Topshirmadi", unchecked: "Tekshirilmagan", none: "Kiritilmagan" } as const;
export const TASK_LABEL: Record<TaskCell, string> = {
  full: "To‘liq",
  partial: "Chala",
  not_done: "Qilmadi",
  ungraded: "Baholanmagan",
  unassigned: "Berilmagan",
};
const OVERALL_LABEL: Record<SmartOverall, string> = {
  full: "To‘liq",
  partial: "Chala",
  not_done: "Qilmadi",
  pending: "Qisman baholangan",
  ungraded: "Baholanmagan",
  none: "Berilmagan",
};
const TASK_TONE: Record<TaskCell, Tone> = { full: "ok", partial: "warn", not_done: "bad", ungraded: "muted", unassigned: "faint" };
const OVERALL_TONE: Record<SmartOverall, Tone> = { full: "ok", partial: "warn", not_done: "bad", pending: "muted", ungraded: "muted", none: "faint" };
const TASK_ICON: Record<TaskCell, IconName> = { full: "check", partial: "clock", not_done: "cross", ungraded: "pending", unassigned: "minus" };
const OVERALL_ICON: Record<SmartOverall, IconName> = { full: "check", partial: "clock", not_done: "cross", pending: "pending", ungraded: "pending", none: "minus" };

/** Wide tables switch the PDF to landscape beyond this many task columns. */
export const MAX_PORTRAIT_TASKS = 5;

export function dailyFileBase(r: DailyReport): string {
  const slug = `${r.subject}-${r.groupName}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || r.subject;
  return `ark-kunlik-hisobot-${slug}-${r.date}`;
}

function attendanceCell(a: DailyRow["attendance"]): Cell {
  if (a === "present") return { text: ATT_LABEL.present, tone: "ok", icon: "check" };
  if (a === "absent") return { text: ATT_LABEL.absent, tone: "bad", icon: "cross" };
  return { text: ATT_LABEL.none, tone: "muted", icon: "dash" };
}

function homeworkCell(h: DailyHomework): Cell {
  if (h.kind === "simple") {
    if (h.status === "submitted") return { text: SIMPLE_HW_LABEL.submitted, tone: "ok", icon: "check" };
    if (h.status === "not_submitted") return { text: SIMPLE_HW_LABEL.not_submitted, tone: "bad", icon: "cross" };
    if (h.status === "unchecked") return { text: SIMPLE_HW_LABEL.unchecked, tone: "muted", icon: "pending" };
    return { text: SIMPLE_HW_LABEL.none, tone: "faint", icon: "minus" };
  }
  if (h.overall === "none") {
    // No Smart Homework task for this student: fall back to the old per-lesson grade if there is one.
    if (h.legacy) return { text: `${TASK_LABEL[h.legacy]} (umumiy baho)`, tone: TASK_TONE[h.legacy], icon: TASK_ICON[h.legacy] };
    return { text: OVERALL_LABEL.none, tone: "faint", icon: "minus" };
  }
  const progress = `${h.full}/${h.assigned}`;
  if (h.overall === "ungraded") return { text: `${OVERALL_LABEL.ungraded} · 0/${h.assigned}`, tone: "muted", icon: "pending" };
  if (h.overall === "pending") return { text: `${OVERALL_LABEL.pending} · ${h.graded}/${h.assigned}`, tone: "muted", icon: "pending" };
  return { text: `${OVERALL_LABEL[h.overall]} · ${progress}`, tone: OVERALL_TONE[h.overall], icon: OVERALL_ICON[h.overall] };
}

function scoreCell(score: number | null, max: number): Cell {
  if (score === null) return { text: "—", tone: "muted" };
  const p = pct(score, max);
  const tone: Tone = p === null ? "muted" : p >= 70 ? "ok" : p >= 40 ? "warn" : "bad";
  return { text: `${score}/${max} • ${fmtP(p)}`, tone };
}

const frac = (n: number, d: number) => (d === 0 ? "—" : `${n}/${d}`);

export function buildDailyView(r: DailyReport): DailyView {
  const subjectLabel = DAILY_SUBJECT_LABEL[r.subject];
  const dateLabel = fullDate(r.date);
  const smart = r.homeworkMode === "smart";

  // ---- header details -----------------------------------------------------------------------
  const info: InfoItem[] = [
    { label: "Fan", value: subjectLabel },
    { label: "Guruh", value: r.groupName },
    { label: "Sana", value: dateLabel, kind: "date" },
    { label: "O‘quvchilar soni", value: String(r.rows.length) },
    { label: "Mavzu", value: r.topic ?? "Kiritilmagan", wide: true },
  ];
  if (r.homeworkText) info.push({ label: smart ? "Uy vazifasi (matn)" : "Uy vazifasi", value: r.homeworkText, wide: true });
  if (r.test) info.push({ label: "Test", value: `${r.test.title ?? "Nomsiz test"} · maksimal ball ${r.test.max}`, wide: true });

  // ---- main table ---------------------------------------------------------------------------
  const columns: ViewColumn[] = [
    { header: "№", align: "center", weight: 6 },
    { header: "O‘quvchi F.I.Sh.", align: "left", weight: smart ? 28 : 34 },
    { header: "Davomat", align: "left", weight: 15 },
    { header: "Uy vazifasi", align: "left", weight: smart ? 33 : 18 },
  ];
  if (r.test) columns.push({ header: "Natija", sub: `/ ${r.test.max}`, align: "left", weight: 16 });
  if (smart) columns.push({ header: "Tanga", align: "center", weight: 9 });

  const rows: Cell[][] = r.rows.map((row, i) => {
    const cells: Cell[] = [{ text: String(i + 1) }, { text: row.name }, attendanceCell(row.attendance), homeworkCell(row.homework)];
    if (r.test) cells.push(scoreCell(row.score, r.test.max));
    if (smart) cells.push({ text: String(row.coins ?? 0) });
    return cells;
  });

  const table: ViewTable = {
    title: "O‘quvchilar jurnali",
    legend: r.test ? "Natija: — ball kiritilmagan (0 ball emas). 0/… — haqiqiy nol ball." : undefined,
    columns,
    rows,
  };

  // ---- summary -------------------------------------------------------------------------------
  const s = r.summary;
  const summary: SummaryItem[] = [
    { label: "Jami o‘quvchilar", value: String(s.students) },
    { label: "Kelganlar", value: String(s.present), sub: s.attendancePct === null ? undefined : `${fmtP(s.attendancePct)} (belgilanganlardan)`, tone: "ok" },
    { label: "Kelmaganlar", value: String(s.absent), tone: s.absent ? "bad" : undefined },
    { label: "Davomati belgilanmaganlar", value: String(s.unmarked), tone: "muted" },
  ];
  const h = s.homework;
  if (h.kind === "simple") {
    summary.push(
      { label: "Uy vazifasini topshirganlar", value: String(h.submitted), sub: h.pct === null ? undefined : `${fmtP(h.pct)} (baholanganlardan: ${h.submitted + h.notSubmitted})`, tone: "ok" },
      { label: "Uy vazifasini topshirmaganlar", value: String(h.notSubmitted), tone: h.notSubmitted ? "bad" : undefined },
      { label: "Baholanmagan vazifalar", value: String(h.unchecked + h.notEntered), sub: `tekshirilmagan ${h.unchecked}, kiritilmagan ${h.notEntered}`, tone: "muted" },
    );
  } else {
    summary.push(
      { label: "Vazifani to‘liq bajarganlar", value: String(h.full), sub: h.pct === null ? undefined : `vazifalarning ${fmtP(h.pct)} to‘liq (baholanganlardan: ${h.slotsGraded})`, tone: "ok" },
      { label: "Vazifani chala bajarganlar", value: String(h.partial), tone: h.partial ? "warn" : undefined },
      { label: "Vazifani bajarmaganlar (Qilmadi)", value: String(h.notDone), tone: h.notDone ? "bad" : undefined },
      { label: "Baholanmagan vazifalar", value: String(h.slotsUngraded), sub: `o‘quvchi-vazifa juftlari; baholash tugamagan o‘quvchilar: ${h.ungraded + h.pending}`, tone: "muted" },
      { label: "Vazifa berilmaganlar", value: String(h.none), tone: "muted" },
    );
  }
  if (s.test) {
    const t = s.test;
    summary.push(
      { label: "Test: ball kiritilgan", value: frac(t.entered, s.students), sub: t.missing ? `kiritilmagan: ${t.missing}` : undefined },
      { label: "Test: o‘rtacha natija", value: t.avgScore === null ? "—" : `${t.avgScore}/${t.max}`, sub: t.avgPct === null ? undefined : fmtP(t.avgPct) },
      { label: "Test: eng yuqori / eng past", value: t.highest === null ? "—" : `${t.highest} / ${t.lowest}`, sub: t.zeros ? `nol ball: ${t.zeros}` : undefined },
    );
  }
  if (s.coins !== null) summary.push({ label: "Shu kun uchun jami tanga", value: String(s.coins) });

  // ---- English appendix: assigned tasks and each student's statuses ----------------------------
  let appendix: ViewTable | null = null;
  if (smart && r.tasks.length > 0) {
    appendix = {
      title: "Ilova: berilgan vazifalar va bajarilish holati",
      intro: r.tasks.map((t, i) => `${i + 1}-vazifa: ${t.title}${t.archived ? " [arxivlangan]" : ""}${t.due ? ` (muddat: ${fullDate(t.due)})` : ""}`),
      legend: "Faqat o‘quvchiga berilgan vazifalar baholanadi. «Berilmagan» — bu vazifa o‘quvchiga berilmagan.",
      columns: [
        { header: "№", align: "center", weight: 6 },
        { header: "O‘quvchi F.I.Sh.", align: "left", weight: 30 },
        ...r.tasks.map((_, i) => ({ header: `${i + 1}-vazifa`, align: "center" as const, weight: Math.max(10, 64 / r.tasks.length) })),
      ],
      rows: r.rows.map((row, i) => [
        { text: String(i + 1) },
        { text: row.name },
        ...(row.homework.kind === "smart" ? row.homework.tasks : []).map((c): Cell => ({ text: TASK_LABEL[c], tone: TASK_TONE[c], icon: TASK_ICON[c] })),
      ]),
    };
  }

  const notes = [
    "Belgilanmagan davomat «Kelmadi» deb hisoblanmaydi; foizlar faqat belgilangan ma’lumotdan olinadi.",
    smart
      ? "Baholanmagan vazifa muvaffaqiyatsizlik deb hisoblanmaydi. Tangalar mavjud hisob-kitobdan olingan, hisobot ularni o‘zgartirmaydi."
      : "Tekshirilmagan yoki kiritilmagan vazifa «topshirmadi» deb hisoblanmaydi.",
  ];

  if (r.tasks.some((t) => t.archived)) notes.push("[arxivlangan] vazifalar keyin arxivlangan, lekin baholari saqlanib qolgani uchun hisobotga kiritilgan.");
  if (r.historical) {
    notes.push(
      smart
        ? "O‘quvchilar ro‘yxati guruh almashish tarixi va arxivlash sanalari bo‘yicha tiklangan (kun aniqligida: shu kuni guruhi almashgan o‘quvchi yangi guruhda hisoblanadi)."
        : "O‘quvchilar ro‘yxati qo‘shilgan va arxivlangan sanalar bo‘yicha tiklangan (kun aniqligida).",
    );
  }

  return {
    brand: DAILY_BRAND,
    teacher: REPORT_TEACHER,
    pdfTitle: DAILY_PDF_TITLE,
    htmlTitle: DAILY_HTML_TITLE,
    info,
    table,
    summaryTitle: "Dars xulosasi",
    summary,
    appendix,
    notes,
    wide: smart && r.tasks.length > MAX_PORTRAIT_TASKS,
    fileBase: dailyFileBase(r),
    dateLabel,
    subjectLabel,
    groupName: r.groupName,
  };
}
