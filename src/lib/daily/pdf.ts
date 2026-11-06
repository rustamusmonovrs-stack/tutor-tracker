import fontkit from "@pdf-lib/fontkit";
import { LineCapStyle, PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { PdfFonts } from "../subjects/reportPdf";
import { ICON_GRID, ICON_PATH, type IconName } from "./icons";
import type { Cell, DailyView, Tone, ViewColumn, ViewTable } from "./view";

export interface DailyPdfAssets {
  fonts: PdfFonts;
  /** The teacher portrait (JPEG or PNG), embedded as-is: never regenerated, cropped or recoloured. */
  portrait: Uint8Array;
}

const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
type Color = ReturnType<typeof hex>;

const NAVY = hex("#14307a");
const BLUE = hex("#1d4ed8");
const ACCENT = hex("#2f6bff");
const SKY = hex("#eaf1ff");
const ZEBRA = hex("#f5f8fe");
const LINE = hex("#d3dcee");
const INK = hex("#0f1b3d");
const GREY = hex("#5b6785");
const PALE = hex("#cfdcff");
const WHITE = rgb(1, 1, 1);
const TONE: Record<Tone, { fg: Color; bg: Color }> = {
  ok: { fg: hex("#0e7a4d"), bg: hex("#dff4e8") },
  bad: { fg: hex("#b3302b"), bg: hex("#fbe3e1") },
  warn: { fg: hex("#8a5a00"), bg: hex("#fdf0c8") },
  muted: { fg: hex("#4f5a76"), bg: hex("#e8ecf4") },
  faint: { fg: hex("#8590a8"), bg: hex("#f1f3f8") },
};

const MM = 72 / 25.4;
/** Header portrait (top right): 24 mm wide, height from the image's own aspect ratio. */
export const HEADER_PORTRAIT_MM = 24;
const FOOT_LINE = 34; // the thin footer rule sits this far above the page bottom
const M = { side: 42 };

const CELL = 11;
const LEAD = 14;
const PAD = 6;
const BADGE_FONT = 10;
const BADGE_LEAD = 13;
const ICON_W = 15; // icon + gap inside a badge
const BADGE_PAD = 14; // horizontal padding of a badge
const MIN_ROW = 26;

const isPng = (b: Uint8Array) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;

/**
 * Real, vector A4 PDF built from the shared DailyView: a blue header banner (title, teacher, portrait top right),
 * info cards with a prominent date, a journal table with coloured status badges and SVG icons, the assigned-tasks
 * appendix, and a minimal footer. The table header repeats on every page. There is no summary block.
 */
export async function buildDailyPdf(view: DailyView, assets: DailyPdfAssets): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(assets.fonts.regular, { subset: true });
  const bold = await doc.embedFont(assets.fonts.bold, { subset: true });
  const portrait = isPng(assets.portrait) ? await doc.embedPng(assets.portrait) : await doc.embedJpg(assets.portrait);

  const known = new Set(regular.getCharacterSet());
  const safe = (s: string) => Array.from(s.replace(/\s+/g, " ")).map((ch) => (known.has(ch.codePointAt(0)!) ? ch : "?")).join("");

  const [PW, PH] = view.wide ? [841.89, 595.28] : [595.28, 841.89];
  const contentW = PW - 2 * M.side;
  const imgW = HEADER_PORTRAIT_MM * MM;
  const imgH = (imgW * portrait.height) / portrait.width; // aspect ratio preserved
  const bandH = Math.max(96, imgH + 28);
  const footTop = FOOT_LINE;
  const bottom = footTop + 14;

  const pages: PDFPage[] = [];
  let page: PDFPage;
  let y = 0;

  const running = `${view.pdfTitle} · ${view.subjectLabel} · ${view.groupName} · ${view.dateLabel}`;
  function newPage(first = false) {
    page = doc.addPage([PW, PH]);
    pages.push(page);
    if (first) {
      y = PH;
      return;
    }
    page.drawRectangle({ x: 0, y: PH - 26, width: PW, height: 26, color: NAVY });
    page.drawText(safe(wrap(running, contentW, regular, 9)[0]), { x: M.side, y: PH - 17, size: 9, font: regular, color: WHITE });
    y = PH - 26 - 18;
  }

  function wrap(text: string, width: number, font: PDFFont, size: number): string[] {
    const out: string[] = [];
    for (const para of safe(text).split("\n")) {
      let line = "";
      for (const word of para.split(" ")) {
        const trial = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(trial, size) <= width) {
          line = trial;
          continue;
        }
        if (line) out.push(line);
        // a single word longer than the column is broken by characters, never clipped
        let rest = word;
        while (font.widthOfTextAtSize(rest, size) > width) {
          let n = rest.length;
          while (n > 1 && font.widthOfTextAtSize(rest.slice(0, n), size) > width) n -= 1;
          out.push(rest.slice(0, n));
          rest = rest.slice(n);
        }
        line = rest;
      }
      out.push(line);
    }
    return out.length ? out : [""];
  }

  const ensure = (h: number) => {
    if (y - h < bottom) newPage();
  };

  /** Rounded rectangle (an SVG path: its origin is the top-left corner and y grows downwards). */
  function roundRect(x: number, top: number, w: number, h: number, r: number, color: Color) {
    const k = Math.min(r, h / 2, w / 2);
    page.drawSvgPath(`M ${k} 0 H ${w - k} A ${k} ${k} 0 0 1 ${w} ${k} V ${h - k} A ${k} ${k} 0 0 1 ${w - k} ${h} H ${k} A ${k} ${k} 0 0 1 0 ${h - k} V ${k} A ${k} ${k} 0 0 1 ${k} 0 Z`, { x, y: top, color });
  }

  function icon(name: IconName, x: number, top: number, size: number, color: Color) {
    page.drawSvgPath(ICON_PATH[name], { x, y: top, scale: size / ICON_GRID, borderColor: color, borderWidth: 1.5, borderLineCap: LineCapStyle.Round });
  }

  // ---------- first-page header banner ----------
  function banner() {
    page.drawRectangle({ x: 0, y: PH - bandH, width: PW, height: bandH, color: NAVY });
    page.drawRectangle({ x: 0, y: PH - bandH - 3, width: PW, height: 3, color: ACCENT });
    page.drawText(safe(view.pdfTitle), { x: M.side, y: PH - bandH / 2 - 2, size: 28, font: bold, color: WHITE });
    page.drawText(safe(`Teacher: ${view.teacher}`), { x: M.side, y: PH - bandH / 2 - 22, size: 12, font: regular, color: PALE });
    const px = PW - M.side - imgW;
    const py = PH - (bandH - imgH) / 2 - imgH;
    page.drawRectangle({ x: px - 1.5, y: py - 1.5, width: imgW + 3, height: imgH + 3, color: WHITE });
    page.drawImage(portrait, { x: px, y: py, width: imgW, height: imgH });
    y = PH - bandH - 3 - 16;
  }

  // ---------- info cards (Fan / Guruh / Sana / O‘quvchilar soni) and full-width lines ----------
  function cards(items: DailyView["info"]) {
    const gap = 8;
    const weights = items.map((it) => (it.kind === "date" ? 1.3 : it.label === "Guruh" ? 1.25 : it.label === "Fan" ? 1.05 : 1));
    const unit = (contentW - gap * (items.length - 1)) / weights.reduce((a, b) => a + b, 0);
    const cw = weights.map((wt) => wt * unit);
    const laid = items.map((it, i) => {
      const size = it.kind === "date" ? 16 : 12.5;
      return { it, size, lines: wrap(it.value, cw[i] - 20, bold, size) };
    });
    const h = 22 + Math.max(...laid.map((c) => c.lines.length * (c.size + 3))) + 10;
    ensure(h + 8);
    let x = M.side;
    laid.forEach((c, i) => {
      const isDate = c.it.kind === "date";
      roundRect(x, y, cw[i], h, 7, isDate ? BLUE : SKY);
      page.drawText(safe(c.it.label.toUpperCase()), { x: x + 10, y: y - 15, size: 8, font: bold, color: isDate ? PALE : GREY });
      c.lines.forEach((ln, li) => page.drawText(ln, { x: x + 10, y: y - 22 - c.size - li * (c.size + 3) + 3, size: c.size, font: bold, color: isDate ? WHITE : INK }));
      x += cw[i] + gap;
    });
    y -= h + 8;
  }

  function wideRow(it: DailyView["info"][number]) {
    const labelW = 112;
    const lines = wrap(it.value, contentW - labelW - 22, bold, 11);
    const h = Math.max(26, lines.length * LEAD + 12);
    ensure(h + 5);
    roundRect(M.side, y, contentW, h, 6, ZEBRA);
    page.drawRectangle({ x: M.side, y: y - h, width: 3, height: h, color: BLUE });
    page.drawText(safe(it.label.toUpperCase()), { x: M.side + 12, y: y - h / 2 - 3, size: 8, font: bold, color: GREY });
    lines.forEach((ln, li) => page.drawText(ln, { x: M.side + labelW + 10, y: y - (h - lines.length * LEAD) / 2 - 11 - li * LEAD + 0.5, size: 11, font: bold, color: INK }));
    y -= h + 5;
  }

  function details() {
    const small = view.info.filter((i) => !i.wide);
    if (small.length) cards(small);
    view.info.filter((i) => i.wide).forEach(wideRow);
    y -= 8;
  }

  // ---------- tables ----------
  /**
   * Column widths: status/score columns get the width their badges need (one line, words never cut); the name column
   * takes whatever is left (long names wrap onto a second line instead of squeezing the badges).
   */
  function widths(cols: ViewColumn[], rows: Cell[][]): number[] {
    const isName = (i: number) => i === 1 && cols[i].align === "left";
    const total = cols.reduce((a, c) => a + c.weight, 0);
    const need = cols.map((c, i) => {
      const head = Math.max(0, ...c.header.split(/\s+/).map((wd) => bold.widthOfTextAtSize(safe(wd), CELL)));
      if (isName(i)) return head + 2 * PAD + 1;
      const body = Math.max(
        0,
        ...rows.map((r) => {
          const c2 = r[i];
          if (c2.tone) {
            const full = bold.widthOfTextAtSize(safe(c2.text), BADGE_FONT);
            const longestWord = Math.max(0, ...c2.text.split(/\s+/).map((wd) => bold.widthOfTextAtSize(safe(wd), BADGE_FONT)));
            return Math.max(Math.min(full, 190), longestWord) + BADGE_PAD + (c2.icon ? ICON_W : 0);
          }
          return Math.max(0, ...c2.text.split(/\s+/).map((wd) => regular.widthOfTextAtSize(safe(wd), CELL)));
        }),
      );
      return Math.max(head, body) + 2 * PAD + 1;
    });
    const out = cols.map((c, i) => (isName(i) ? 0 : Math.max((c.weight / total) * contentW, need[i])));
    const others = out.reduce((a, b) => a + b, 0);
    const nameIdx = cols.findIndex((_, i) => isName(i));
    if (nameIdx < 0) return others > contentW ? out.map((wd) => (wd * contentW) / others) : out;
    const nameW = Math.max(contentW - others, need[nameIdx]);
    out[nameIdx] = nameW;
    const tot = out.reduce((a, b) => a + b, 0);
    return tot > contentW + 0.5 ? out.map((wd) => (wd * contentW) / tot) : out;
  }

  interface Laid {
    lines: string[];
    badge: boolean;
    pillW: number;
    h: number;
  }

  function drawTable(t: ViewTable, keepTogether = false) {
    const w = widths(t.columns, t.rows);
    const tableW = w.reduce((a, b) => a + b, 0);
    const headH = Math.max(28, Math.max(...t.columns.map((c, i) => wrap(c.header, w[i] - 2 * PAD, bold, CELL).length * LEAD + (c.sub ? wrap(c.sub, w[i] - 2 * PAD, regular, 8.5).length * 11 : 0))) + 12);

    const layout = (c: Cell, i: number): Laid => {
      if (c.tone) {
        const inner = w[i] - 2 * PAD - BADGE_PAD - (c.icon ? ICON_W : 0);
        const lines = wrap(c.text, inner, bold, BADGE_FONT);
        const tw = Math.max(...lines.map((l) => bold.widthOfTextAtSize(l, BADGE_FONT)));
        return { lines, badge: true, pillW: tw + BADGE_PAD + (c.icon ? ICON_W : 0), h: lines.length * BADGE_LEAD + 7 };
      }
      const lines = wrap(c.text, w[i] - 2 * PAD, regular, CELL);
      return { lines, badge: false, pillW: 0, h: lines.length * LEAD };
    };
    const rowLayout = (row: Cell[]) => row.map(layout);
    const rowH = (ls: Laid[]) => Math.max(MIN_ROW, Math.max(...ls.map((l) => l.h)) + 12);

    const offsetOf = (i: number, contentWidth: number) => {
      const a = t.columns[i].align;
      if (a === "center") return (w[i] - contentWidth) / 2;
      if (a === "right") return w[i] - PAD - contentWidth;
      return PAD;
    };

    const drawHead = () => {
      page.drawRectangle({ x: M.side, y: y - headH, width: tableW, height: headH, color: NAVY });
      let x = M.side;
      t.columns.forEach((c, i) => {
        const lines = wrap(c.header, w[i] - 2 * PAD, bold, CELL);
        const subs = c.sub ? wrap(c.sub, w[i] - 2 * PAD, regular, 8.5) : [];
        const block = lines.length * LEAD + subs.length * 11;
        let ty = y - (headH - block) / 2 - 11;
        lines.forEach((ln) => {
          page.drawText(ln, { x: x + offsetOf(i, bold.widthOfTextAtSize(ln, CELL)), y: ty, size: CELL, font: bold, color: WHITE });
          ty -= LEAD;
        });
        subs.forEach((ln) => {
          page.drawText(ln, { x: x + offsetOf(i, regular.widthOfTextAtSize(ln, 8.5)), y: ty + 3, size: 8.5, font: regular, color: PALE });
          ty -= 11;
        });
        x += w[i];
      });
      y -= headH;
    };

    const firstH = t.rows[0] ? rowH(rowLayout(t.rows[0])) : 0;
    const introLines = (t.intro ?? []).map((s) => {
      const m = /^(\d+-vazifa):\s*(.*)$/.exec(s);
      return m ? { tag: m[1], text: wrap(m[2], contentW - 58, regular, 10.5) } : { tag: "", text: wrap(s, contentW, regular, 10.5) };
    });
    const introH = introLines.reduce((a, l) => a + l.text.length * 13 + 2, 0);
    if (keepTogether) {
      // A compact table that fits on one page starts on a fresh page rather than being cut after its first row.
      const total = 26 + introH + 4 + headH + t.rows.reduce((a, r) => a + rowH(rowLayout(r)), 0) + (t.legend ? 22 : 0);
      if (y - total < bottom && total <= PH - 70 - bottom) newPage();
    }
    ensure(26 + introH + headH + firstH);
    page.drawRectangle({ x: M.side, y: y - 15, width: 4, height: 15, color: BLUE });
    page.drawText(safe(t.title), { x: M.side + 11, y: y - 12, size: 13, font: bold, color: INK });
    y -= 26;
    for (const l of introLines) {
      ensure(l.text.length * 13 + 2);
      if (l.tag) page.drawText(safe(l.tag), { x: M.side, y: y - 10, size: 10.5, font: bold, color: BLUE });
      l.text.forEach((ln, li) => page.drawText(ln, { x: M.side + (l.tag ? 58 : 0), y: y - 10 - li * 13, size: 10.5, font: regular, color: INK }));
      y -= l.text.length * 13 + 2;
    }
    if (introLines.length) y -= 4;
    drawHead();

    t.rows.forEach((row, ri) => {
      const ls = rowLayout(row);
      const h = rowH(ls);
      if (y - h < bottom) {
        newPage();
        drawHead(); // repeated header on every new page
      }
      page.drawRectangle({ x: M.side, y: y - h, width: tableW, height: h, color: ri % 2 ? ZEBRA : WHITE });
      page.drawLine({ start: { x: M.side, y: y - h }, end: { x: M.side + tableW, y: y - h }, thickness: 0.5, color: LINE });
      let x = M.side;
      row.forEach((c, i) => {
        const l = ls[i];
        if (l.badge && c.tone) {
          const tone = TONE[c.tone];
          const top = y - (h - l.h) / 2;
          const px = x + offsetOf(i, l.pillW);
          roundRect(px, top, l.pillW, l.h, 8, tone.bg);
          let tx = px + BADGE_PAD / 2;
          if (c.icon) {
            icon(c.icon, tx, top - (l.h - 8) / 2, 8, tone.fg);
            tx += ICON_W;
          }
          l.lines.forEach((ln, li) => page.drawText(ln, { x: tx, y: top - 3.5 - BADGE_FONT - li * BADGE_LEAD + 1, size: BADGE_FONT, font: bold, color: tone.fg }));
        } else {
          const block = l.lines.length * LEAD;
          l.lines.forEach((ln, li) => {
            page.drawText(ln, { x: x + offsetOf(i, regular.widthOfTextAtSize(ln, CELL)), y: y - (h - block) / 2 - 11 - li * LEAD + 0.5, size: CELL, font: i === 1 ? bold : regular, color: INK });
          });
        }
        x += w[i];
      });
      y -= h;
    });
    if (t.legend) {
      y -= 6;
      for (const ln of wrap(t.legend, contentW, regular, 8.5)) {
        ensure(12);
        page.drawText(ln, { x: M.side, y: y - 9, size: 8.5, font: regular, color: GREY });
        y -= 11;
      }
    }
    y -= 14;
  }

  // ---------- document ----------
  newPage(true);
  banner();
  details();
  drawTable(view.table);
  if (view.appendix) drawTable(view.appendix, true);

  // ---------- minimal footer on every page: brand left, "Sahifa i / n" right ----------
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M.side, y: footTop }, end: { x: PW - M.side, y: footTop }, thickness: 0.5, color: LINE });
    p.drawText(safe(view.brand), { x: M.side, y: footTop - 14, size: 9.5, font: regular, color: GREY });
    const label = `Sahifa ${i + 1} / ${pages.length}`;
    p.drawText(label, { x: PW - M.side - regular.widthOfTextAtSize(label, 9.5), y: footTop - 14, size: 9.5, font: regular, color: GREY });
  });

  doc.setTitle(`${view.pdfTitle} — ${view.groupName} — ${view.dateLabel}`);
  doc.setAuthor(`${view.brand} — ${view.teacher}`);
  doc.setProducer("Ark Progress");
  return doc.save();
}
