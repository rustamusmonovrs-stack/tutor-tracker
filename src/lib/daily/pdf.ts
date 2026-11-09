import fontkit from "@pdf-lib/fontkit";
import {
  LineCapStyle,
  PDFDocument,
  appendBezierCurve,
  clip,
  closePath,
  endPath,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setCharacterSpacing,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";
import { ICON_GRID, ICON_PATH, type IconName } from "./icons";
import type { Cell, DailyView, InfoItem, Tone, ViewColumn, ViewTable } from "./view";

export interface DailyPdfFonts {
  regular: Uint8Array;
  /** Labels, names, status chips. Falls back to `bold` when absent. */
  semibold?: Uint8Array;
  bold: Uint8Array;
}

export interface DailyPdfAssets {
  fonts: DailyPdfFonts;
  /** The teacher portrait (JPEG or PNG), embedded as-is: never regenerated or recoloured; shown through a circular mask. */
  portrait: Uint8Array;
}

// ---------------------------------------------------------------------------------------------
// Design tokens (PDF only: the application CSS is not touched)

const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
type Color = ReturnType<typeof hex>;

const NAVY = hex("#183477");
const BLUE = hex("#2450D8");
const SOFT = hex("#F3F6FA");
const ROW_ALT = hex("#F8FAFC");
const LINE = hex("#E3E8F0");
const RULE = hex("#D5DCE8");
const INK = hex("#141B2D");
const GREY = hex("#667085");
const PALE = hex("#C9D4F2");
const WHITE = rgb(1, 1, 1);

/** Status colours: text colour (contrast-checked for small print), icon colour, chip tint. */
const TONE: Record<Tone, { fg: Color; icon: Color; bg: Color | null }> = {
  ok: { fg: hex("#16804D"), icon: hex("#16804D"), bg: hex("#E8F5EE") },
  bad: { fg: hex("#C7333A"), icon: hex("#C7333A"), bg: hex("#FCECEC") },
  warn: { fg: hex("#8F5E0C"), icon: hex("#B77913"), bg: hex("#FCF3E1") },
  muted: { fg: hex("#475467"), icon: hex("#667085"), bg: hex("#EEF1F5") },
  faint: { fg: hex("#8A93A5"), icon: hex("#A3ABBA"), bg: null },
};

const MM = 72 / 25.4;
/** Circular header portrait diameter. */
export const HEADER_PORTRAIT_MM = 21;

const SIDE = 40; // ≈14 mm side margins
const TOP = 34;
const FOOT_LINE = 36; // footer rule, measured from the page bottom
const BOTTOM = FOOT_LINE + 14; // nothing of the body goes below this

const T = {
  title: 21,
  teacher: 10.5,
  metaLabel: 7.5,
  metaValue: 11,
  date: 15,
  detailLabel: 9,
  detail: 10.5,
  head: 9.5,
  headSub: 8,
  name: 10.5,
  body: 10.5,
  index: 9.5,
  chip: 9.5,
  foot: 8.5,
};

const PAD = 5; // horizontal cell padding
const LEAD = 13; // body line height
const ROW_PAD = 4; // vertical cell padding
const MIN_ROW = 24;
const CHIP_LEAD = 12;
const CHIP_H = 16;
const CHIP_PAD_L = 4;
const CHIP_PAD_R = 6;
const ICON_R = 4.3;
const ICON_GAP = 4;
const CHIP_INSET = CHIP_PAD_L + 2 * ICON_R + ICON_GAP + CHIP_PAD_R;
/** The name column never gets narrower than this share of the table (other columns wrap first). */
const MIN_NAME_SHARE = 0.3;
/** A table continued on a new page carries at least this many rows there (no 1–2 row widows). */
const MIN_LAST_ROWS = 3;

const isPng = (b: Uint8Array) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;

/**
 * Real, vector A4 journal built from the shared DailyView (the HTML export renders the same view, so the data in both
 * files is identical). Compact header with a circular portrait (first page only), one metadata strip with a prominent
 * date, label/value lesson details, a student table with semantic status chips drawn as vector shapes (no emoji, no
 * browser SVG), a repeated table header and a small running header on continuation pages, and a "Sahifa X / Y" footer.
 */
export async function buildDailyPdf(view: DailyView, assets: DailyPdfAssets): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const R = await doc.embedFont(assets.fonts.regular, { subset: true });
  const B = await doc.embedFont(assets.fonts.bold, { subset: true });
  const S = assets.fonts.semibold ? await doc.embedFont(assets.fonts.semibold, { subset: true }) : B;
  const portrait = isPng(assets.portrait) ? await doc.embedPng(assets.portrait) : await doc.embedJpg(assets.portrait);

  const known = new Set(R.getCharacterSet());
  const safe = (s: string) => Array.from(s.replace(/[^\S\n]+/g, " ")).map((ch) => (ch === "\n" || known.has(ch.codePointAt(0)!) ? ch : "?")).join("");

  // Portrait A4. Only a genuinely wide per-task detail table (many tasks) is set on landscape pages of its own.
  const PORTRAIT: [number, number] = [595.28, 841.89];
  const LANDSCAPE: [number, number] = [841.89, 595.28];
  let [PW, PH] = PORTRAIT;
  let CW = PW - 2 * SIDE;

  const pages: PDFPage[] = [];
  let page!: PDFPage;
  let y = 0;

  // ---------- text helpers ----------
  const width = (s: string, font: PDFFont, size: number) => font.widthOfTextAtSize(s, size);

  /** Word wrap. Words are never split unless a single word is wider than the whole column. */
  function wrap(text: string, w: number, font: PDFFont, size: number): string[] {
    const out: string[] = [];
    for (const para of safe(text).split("\n")) {
      let line = "";
      for (const word of para.split(" ")) {
        const trial = line ? `${line} ${word}` : word;
        if (width(trial, font, size) <= w) {
          line = trial;
          continue;
        }
        if (line) out.push(line);
        let rest = word;
        while (width(rest, font, size) > w && rest.length > 1) {
          let n = rest.length;
          while (n > 1 && width(rest.slice(0, n), font, size) > w) n -= 1;
          out.push(rest.slice(0, n));
          rest = rest.slice(n);
        }
        line = rest;
      }
      out.push(line);
    }
    return out.length ? out : [""];
  }
  const longestWord = (text: string, font: PDFFont, size: number) => Math.max(0, ...safe(text).split(/\s+/).map((wd) => width(wd, font, size)));

  function text(s: string, x: number, baseline: number, font: PDFFont, size: number, color: Color) {
    page.drawText(s, { x, y: baseline, size, font, color });
  }
  /** Small uppercase label with letter spacing. */
  function label(s: string, x: number, baseline: number, size: number, color: Color) {
    page.pushOperators(setCharacterSpacing(0.6));
    page.drawText(safe(s.toUpperCase()), { x, y: baseline, size, font: S, color });
    page.pushOperators(setCharacterSpacing(0));
  }

  /** Rounded rectangle; `top` is the upper edge. */
  function roundRect(x: number, top: number, w: number, h: number, r: number, color: Color) {
    const k = Math.min(r, h / 2, w / 2);
    page.drawSvgPath(`M ${k} 0 H ${w - k} A ${k} ${k} 0 0 1 ${w} ${k} V ${h - k} A ${k} ${k} 0 0 1 ${w - k} ${h} H ${k} A ${k} ${k} 0 0 1 0 ${h - k} V ${k} A ${k} ${k} 0 0 1 ${k} 0 Z`, { x, y: top, color });
  }

  // ---------- status icons: vector shapes in a circle ----------
  function glyph(name: IconName, cx: number, cy: number, span: number, color: Color, weight: number) {
    const s = span / ICON_GRID;
    page.drawSvgPath(ICON_PATH[name], { x: cx - 4.5 * s, y: cy + 4.5 * s, scale: s, borderColor: color, borderWidth: weight / s, borderLineCap: LineCapStyle.Round });
  }
  function statusIcon(name: IconName, tone: Tone, cx: number, cy: number) {
    const c = TONE[tone].icon;
    const r = ICON_R;
    if (name === "check" || name === "cross") {
      // check-circle / x-circle: filled disc, white mark
      page.drawCircle({ x: cx, y: cy, size: r, color: c });
      glyph(name, cx, cy, name === "check" ? 2 * r * 0.78 : 2 * r * 0.66, WHITE, 1.15);
      return;
    }
    page.drawCircle({ x: cx, y: cy, size: r - 0.45, borderColor: c, borderWidth: 0.9 });
    if (name === "clock") {
      // half-filled disc: "partly done"
      page.drawSvgPath(`M 0 ${-r + 0.45} A ${r - 0.45} ${r - 0.45} 0 0 0 0 ${r - 0.45} Z`, { x: cx, y: cy, color: c });
    } else if (name === "pending") {
      for (const dx of [-1.85, 0, 1.85]) page.drawCircle({ x: cx + dx, y: cy, size: 0.62, color: c });
    } else {
      page.drawLine({ start: { x: cx - 2.1, y: cy }, end: { x: cx + 2.1, y: cy }, thickness: 1, color: c, lineCap: LineCapStyle.Round });
    }
  }

  // ---------- circular portrait (clipping path; the image keeps its own aspect ratio) ----------
  function circlePortrait(img: PDFImage, cx: number, cy: number, d: number) {
    const r = d / 2;
    const k = 0.5522847498 * r;
    // cover-fit the image into the circle's square without distortion
    const scale = Math.max(d / img.width, d / img.height);
    const iw = img.width * scale;
    const ih = img.height * scale;
    page.pushOperators(
      pushGraphicsState(),
      moveTo(cx + r, cy),
      appendBezierCurve(cx + r, cy + k, cx + k, cy + r, cx, cy + r),
      appendBezierCurve(cx - k, cy + r, cx - r, cy + k, cx - r, cy),
      appendBezierCurve(cx - r, cy - k, cx - k, cy - r, cx, cy - r),
      appendBezierCurve(cx + k, cy - r, cx + r, cy - k, cx + r, cy),
      closePath(),
      clip(),
      endPath(),
    );
    page.drawImage(img, { x: cx - iw / 2, y: cy - ih / 2, width: iw, height: ih });
    page.pushOperators(popGraphicsState());
    page.drawCircle({ x: cx, y: cy, size: r + 0.6, borderColor: RULE, borderWidth: 1.2 });
  }

  // ---------- pages ----------
  const running = [view.pdfTitle, view.subjectLabel, view.groupName].join("  ·  ");
  let landscape = false;
  function newPage(first = false, orient: "portrait" | "landscape" | null = null) {
    if (orient) landscape = orient === "landscape";
    [PW, PH] = landscape ? LANDSCAPE : PORTRAIT;
    CW = PW - 2 * SIDE;
    page = doc.addPage([PW, PH]);
    pages.push(page);
    if (first) {
      y = PH - TOP;
      return;
    }
    // small running header on continuation pages (no portrait, no large title)
    const base = PH - TOP + 4;
    const left = wrap(running, CW - 120, R, 8.5)[0];
    text(left, SIDE, base, R, 8.5, GREY);
    const date = safe(view.dateLabel);
    text(date, PW - SIDE - width(date, S, 9), base, S, 9, NAVY);
    page.drawLine({ start: { x: SIDE, y: base - 7 }, end: { x: PW - SIDE, y: base - 7 }, thickness: 0.5, color: RULE });
    y = base - 7 - 12;
  }
  const ensure = (h: number) => {
    if (y - h < BOTTOM) newPage();
  };

  // ---------- first-page header ----------
  function header() {
    const d = HEADER_PORTRAIT_MM * MM;
    const top = y;
    const cx = PW - SIDE - d / 2;
    const cy = top - d / 2;
    circlePortrait(portrait, cx, cy, d);

    const titleBase = cy + 2;
    text(safe(view.pdfTitle), SIDE, titleBase, B, T.title, NAVY);
    const tLabel = "Teacher: ";
    text(tLabel, SIDE, titleBase - 19, R, T.teacher, GREY);
    text(safe(view.teacher), SIDE + width(tLabel, R, T.teacher), titleBase - 19, S, T.teacher, INK);

    y = top - d - 8;
    page.drawLine({ start: { x: SIDE, y }, end: { x: PW - SIDE, y }, thickness: 0.9, color: BLUE });
    y -= 11;
  }

  // ---------- metadata strip: Fan | Guruh | Sana | O‘quvchilar soni ----------
  function metaStrip(items: InfoItem[]) {
    if (!items.length) return;
    const weights = items.map((it) => (it.kind === "date" ? 1.15 : it.label === "Guruh" ? 1.3 : it.label === "Fan" ? 1 : 0.95));
    const unit = CW / weights.reduce((a, b) => a + b, 0);
    const laid = items.map((it, i) => {
      const isDate = it.kind === "date";
      const font = isDate ? B : S;
      const size = isDate ? T.date : T.metaValue;
      return { it, font, size, isDate, w: weights[i] * unit, lines: wrap(it.value, weights[i] * unit - 24, font, size) };
    });
    const maxSize = Math.max(...laid.map((c) => c.size));
    const valueH = Math.max(...laid.map((c) => maxSize + (c.lines.length - 1) * (c.size + 3)));
    const h = 12 + T.metaLabel + 6 + valueH + 11;
    ensure(h);
    roundRect(SIDE, y, CW, h, 6, SOFT);
    let x = SIDE;
    laid.forEach((c, i) => {
      if (i > 0) page.drawLine({ start: { x, y: y - 9 }, end: { x, y: y - h + 9 }, thickness: 0.6, color: RULE });
      label(c.it.label, x + 12, y - 12 - T.metaLabel + 1.5, T.metaLabel, GREY);
      const first = y - 12 - T.metaLabel - 6 - maxSize + 2; // values share one baseline
      c.lines.forEach((ln, li) => text(ln, x + 12, first - li * (c.size + 3), c.font, c.size, c.isDate ? BLUE : INK));
      x += c.w;
    });
    y -= h + 11;
  }

  // ---------- label / value lines: Mavzu, Vazifalar, Uy vazifasi, Test ----------
  function details(items: InfoItem[]) {
    const labelW = 92;
    const vw = CW - labelW;
    for (const it of items) {
      const font = it.label === "Mavzu" ? S : R;
      const lines = wrap(it.value, vw, font, T.detail);
      const h = lines.length * 14;
      ensure(h + 6);
      text(safe(it.label), SIDE, y - 11, S, T.detailLabel, GREY);
      lines.forEach((ln, li) => text(ln, SIDE + labelW, y - 11 - li * 14, font, T.detail, INK));
      y -= h + 4;
    }
    if (items.length) y -= 8;
  }

  // ---------- tables ----------
  const chipW = (c: Cell, lines: string[]) => Math.max(...lines.map((l) => width(l, S, T.chip))) + (c.icon ? CHIP_INSET : CHIP_PAD_L + CHIP_PAD_R);

  /**
   * Column widths. Status/score/number columns get the width of their longest content on one line; the name column
   * takes the rest. If that leaves the names narrower than MIN_NAME_SHARE, status columns give up width (their chips
   * wrap at word boundaries) before the names do. Nothing is ever clipped.
   */
  function widths(cols: ViewColumn[], rows: Cell[][]): number[] {
    const nameIdx = cols.findIndex((c, i) => i === 1 && c.align === "left");
    const headNeed = (c: ViewColumn) => longestWord(c.header, S, T.head) + 2 * PAD;
    const need = cols.map((c, i) => {
      if (i === nameIdx) return 0;
      const body = Math.max(0, ...rows.map((r) => (r[i].tone ? chipW(r[i], [safe(r[i].text)]) : width(safe(r[i].text), i === 0 ? R : S, T.body))));
      return Math.max(headNeed(c), body + 2 * PAD + 1);
    });
    const floor = cols.map((c, i) => {
      if (i === nameIdx) return 0;
      const body = Math.max(0, ...rows.map((r) => (r[i].tone ? longestWord(r[i].text, S, T.chip) + (r[i].icon ? CHIP_INSET : CHIP_PAD_L + CHIP_PAD_R) : longestWord(r[i].text, S, T.body))));
      return Math.max(headNeed(c), body + 2 * PAD + 1);
    });
    if (nameIdx < 0) {
      const tot = need.reduce((a, b) => a + b, 0);
      return need.map((w) => (w * CW) / tot);
    }
    const minName = Math.max(CW * MIN_NAME_SHARE, longestWord(rows.map((r) => r[nameIdx].text).join(" "), S, T.name) + 2 * PAD);
    let w = [...need];
    // With room to spare, short headers (task titles) stay on one line instead of wrapping word by word.
    const nice = w.map((wd, i) => (i === nameIdx || i === 0 ? wd : Math.max(wd, Math.min(width(safe(cols[i].header), S, T.head), 120) + 2 * PAD)));
    const widestName = Math.max(0, ...rows.map((r) => width(safe(r[nameIdx].text), S, T.name))) + 2 * PAD + 1;
    if (CW - nice.reduce((a, b) => a + b, 0) >= Math.min(minName, widestName)) w = nice;
    let others = w.reduce((a, b) => a + b, 0);
    if (CW - others < minName) {
      // shrink the shrinkable columns proportionally towards their single-word floor
      const slack = w.reduce((a, wd, i) => a + (wd - floor[i]), 0);
      const want = Math.min(slack, minName - (CW - others));
      if (slack > 0) w = w.map((wd, i) => wd - ((wd - floor[i]) / slack) * want);
      others = w.reduce((a, b) => a + b, 0);
    }
    w[nameIdx] = Math.max(CW - others, 1);
    const tot = w.reduce((a, b) => a + b, 0);
    return tot > CW + 0.5 ? w.map((wd) => (wd * CW) / tot) : w;
  }

  interface Laid {
    lines: string[];
    chip: boolean;
    chipW: number;
    h: number;
  }

  function drawTable(t: ViewTable, opts: { title?: boolean; keepTogether?: boolean } = {}) {
    const w = widths(t.columns, t.rows);
    const tableW = w.reduce((a, b) => a + b, 0);
    const fontOf = (i: number) => (i === 0 ? R : i === 1 || t.columns[i].align === "right" ? S : R);
    const sizeOf = (i: number) => (i === 0 ? T.index : i === 1 ? T.name : T.body);

    const headLines = t.columns.map((c, i) => wrap(c.header, w[i] - 2 * PAD, S, T.head));
    const subLines = t.columns.map((c, i) => (c.sub ? wrap(c.sub, w[i] - 2 * PAD, R, T.headSub) : []));
    const headH = Math.max(24, Math.max(...t.columns.map((_, i) => headLines[i].length * 12 + subLines[i].length * 10)) + 12);

    const layout = (c: Cell, i: number): Laid => {
      if (c.tone) {
        const inner = w[i] - 2 * PAD - (c.icon ? CHIP_INSET : CHIP_PAD_L + CHIP_PAD_R);
        const lines = wrap(c.text, inner, S, T.chip);
        return { lines, chip: true, chipW: chipW(c, lines), h: CHIP_H + (lines.length - 1) * CHIP_LEAD };
      }
      const lines = wrap(c.text, w[i] - 2 * PAD, fontOf(i), sizeOf(i));
      return { lines, chip: false, chipW: 0, h: lines.length * LEAD };
    };
    const rowLayout = (row: Cell[]) => row.map(layout);
    const rowH = (ls: Laid[]) => Math.max(MIN_ROW, Math.max(...ls.map((l) => l.h)) + 2 * ROW_PAD);

    const xOf = (i: number, x: number, cw: number) => {
      const a = t.columns[i].align;
      if (a === "center") return x + (w[i] - cw) / 2;
      if (a === "right") return x + w[i] - PAD - cw;
      return x + PAD;
    };

    const drawHead = () => {
      roundRect(SIDE, y, tableW, headH, 4, NAVY);
      page.drawRectangle({ x: SIDE, y: y - headH, width: tableW, height: 4, color: NAVY }); // square bottom corners
      let x = SIDE;
      t.columns.forEach((_, i) => {
        const block = headLines[i].length * 12 + subLines[i].length * 10;
        let base = y - (headH - block) / 2 - 9.5;
        for (const ln of headLines[i]) {
          text(ln, xOf(i, x, width(ln, S, T.head)), base, S, T.head, WHITE);
          base -= 12;
        }
        for (const ln of subLines[i]) {
          text(ln, xOf(i, x, width(ln, R, T.headSub)), base + 1.5, R, T.headSub, PALE);
          base -= 10;
        }
        x += w[i];
      });
      y -= headH;
    };

    const heights = t.rows.map((r) => rowH(rowLayout(r)));
    const titleH = opts.title ? 22 : 0;
    // The legend sits between the title and the table, so it can never be left alone on a page of its own.
    const legendLines = t.legend ? wrap(t.legend, CW, R, 8.5) : [];
    const legendH = legendLines.length ? legendLines.length * 11 + 5 : 0;
    if (opts.keepTogether) {
      // A table that fits on one page starts on a fresh page rather than being cut after a few rows.
      const total = titleH + legendH + headH + heights.reduce((a, b) => a + b, 0);
      if (y - total < BOTTOM && total <= PH - TOP - 30 - BOTTOM) newPage();
    }
    // keep the title, legend and header with at least the first two rows
    ensure(titleH + legendH + headH + (heights[0] ?? 0) + (heights[1] ?? 0));
    if (opts.title) {
      text(safe(t.title), SIDE, y - 12, S, 11.5, NAVY);
      y -= titleH;
    }
    if (legendLines.length) {
      for (const ln of legendLines) {
        text(ln, SIDE, y - 8, R, 8.5, GREY);
        y -= 11;
      }
      y -= 5;
    }
    drawHead();

    t.rows.forEach((row, ri) => {
      const ls = rowLayout(row);
      const h = heights[ri];
      const rest = heights.length - ri;
      const restFits = y - heights.slice(ri).reduce((a, b) => a + b, 0) >= BOTTOM;
      const widow = rest === MIN_LAST_ROWS && ri >= MIN_LAST_ROWS && !restFits;
      if (y - h < BOTTOM || widow) {
        newPage();
        drawHead(); // repeated on every continuation page
      }
      if (ri % 2 === 1) page.drawRectangle({ x: SIDE, y: y - h, width: tableW, height: h, color: ROW_ALT });
      page.drawLine({ start: { x: SIDE, y: y - h }, end: { x: SIDE + tableW, y: y - h }, thickness: 0.5, color: LINE });
      let x = SIDE;
      row.forEach((c, i) => {
        const l = ls[i];
        if (l.chip && c.tone) {
          const tone = TONE[c.tone];
          const top = y - (h - l.h) / 2;
          const px = xOf(i, x, l.chipW) - (t.columns[i].align === "left" ? 1 : 0);
          if (tone.bg) roundRect(px, top, l.chipW, l.h, 4, tone.bg);
          let tx = px + CHIP_PAD_L;
          if (c.icon) {
            statusIcon(c.icon, c.tone, tx + ICON_R, top - CHIP_H / 2);
            tx += 2 * ICON_R + ICON_GAP;
          }
          l.lines.forEach((ln, li) => text(ln, tx, top - 11.4 - li * CHIP_LEAD, S, T.chip, tone.fg));
        } else {
          const block = l.lines.length * LEAD;
          const f = fontOf(i);
          const sz = sizeOf(i);
          l.lines.forEach((ln, li) => text(ln, xOf(i, x, width(ln, f, sz)), y - (h - block) / 2 - 10.2 - li * LEAD, f, sz, i === 0 ? GREY : INK));
        }
        x += w[i];
      });
      y -= h;
    });
    y -= 18;
  }

  /**
   * A per-task table with more status columns than fit next to a readable name column is split into several tables
   * over consecutive task groups (№ and name repeated). Names are never squeezed below MIN_NAME_SHARE.
   */
  function splitWide(t: ViewTable): ViewTable[] {
    const fixed = 2;
    const n = t.columns.length - fixed;
    if (n <= 1) return [t];
    const colNeed = (i: number) =>
      Math.max(
        longestWord(t.columns[i].header, S, T.head),
        ...t.rows.map((r) => (r[i].tone ? chipW(r[i], [safe(r[i].text)]) : width(safe(r[i].text), S, T.body))),
      ) + 2 * PAD + 1;
    const maxNeed = Math.max(...t.columns.slice(fixed).map((_, k) => colNeed(fixed + k)));
    const indexW = colNeed(0);
    const nameMin = Math.max(CW * MIN_NAME_SHARE, longestWord(t.rows.map((r) => r[1].text).join(" "), S, T.name) + 2 * PAD);
    const per = Math.max(1, Math.floor((CW - indexW - nameMin) / maxNeed));
    if (n <= per) return [t];
    const groups = Math.ceil(n / per);
    const size = Math.ceil(n / groups); // balanced groups
    const out: ViewTable[] = [];
    for (let g = 0; g < groups; g++) {
      const from = fixed + g * size;
      const to = Math.min(fixed + n, from + size);
      const pick = (arr: unknown[]) => [arr[0], arr[1], ...arr.slice(from, to)];
      out.push({
        ...t,
        title: `${t.title} (${from - fixed + 1}–${to - fixed}-vazifa)`,
        legend: g === 0 ? t.legend : undefined,
        columns: pick(t.columns) as ViewColumn[],
        rows: t.rows.map((r) => pick(r) as Cell[]),
      });
    }
    return out;
  }

  // ---------- document ----------
  newPage(true);
  header();
  metaStrip(view.info.filter((i) => !i.wide));
  details(view.info.filter((i) => i.wide));
  drawTable(view.table);
  if (view.appendix) {
    if (view.wide) newPage(false, "landscape");
    const parts = splitWide(view.appendix);
    parts.forEach((part) => drawTable(part, { title: true, keepTogether: true }));
  }

  // ---------- minimal footer: "Sahifa X / Y" only ----------
  pages.forEach((p, i) => {
    const pw = p.getWidth();
    p.drawLine({ start: { x: SIDE, y: FOOT_LINE }, end: { x: pw - SIDE, y: FOOT_LINE }, thickness: 0.5, color: RULE });
    const s = `Sahifa ${i + 1} / ${pages.length}`;
    p.drawText(s, { x: pw - SIDE - width(s, R, T.foot), y: FOOT_LINE - 13, size: T.foot, font: R, color: GREY });
  });

  doc.setTitle(`${view.pdfTitle} — ${view.subjectLabel} — ${view.groupName} — ${view.dateLabel}`);
  doc.setAuthor(view.teacher);
  doc.setProducer("Ark Progress");
  return doc.save();
}
