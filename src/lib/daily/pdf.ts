import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { PdfFonts } from "../subjects/reportPdf";
import type { Cell, DailyView, ViewColumn, ViewTable } from "./view";

export interface DailyPdfAssets {
  fonts: PdfFonts;
  /** The teacher portrait, embedded as-is (JPEG or PNG), never regenerated or cropped. */
  portrait: Uint8Array;
}

const BLACK = rgb(0, 0, 0);
const GREY = rgb(0.33, 0.33, 0.33);
const LINE = rgb(0.62, 0.62, 0.62);
const HEAD_FILL = rgb(0.92, 0.92, 0.92);

const MM = 72 / 25.4;
/** Header portrait (top right): 24 mm wide, height from the image's own aspect ratio. */
export const HEADER_PORTRAIT_MM = 24;
const FOOT_LINE = 34; // the thin footer rule sits this far above the page bottom
const M = { top: 48, side: 42 };

const BODY = 11;
const CELL = 11;
const LEAD = 14;
const PAD = 5;

const isPng = (b: Uint8Array) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;

/**
 * Real, vector A4 PDF built from the shared DailyView: black text on white, grey rules, an embedded Unicode font,
 * the teacher portrait in the top-right of the header, a minimal footer (brand + page numbers) and a table header
 * repeated on every page. No summary block: only the lesson details and the tables.
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
  const footTop = FOOT_LINE; // everything above this line is report content
  const bottom = footTop + 12;

  const pages: PDFPage[] = [];
  let page: PDFPage;
  let y = 0;

  const running = `${view.brand.toUpperCase()} · ${view.pdfTitle} · ${view.groupName} · ${view.dateLabel}`;
  function newPage(first = false) {
    page = doc.addPage([PW, PH]);
    pages.push(page);
    y = PH - M.top;
    if (!first) {
      page.drawText(safe(wrap(running, contentW, regular, 8.5)[0]), { x: M.side, y: PH - 30, size: 8.5, font: regular, color: GREY });
      page.drawLine({ start: { x: M.side, y: PH - 36 }, end: { x: PW - M.side, y: PH - 36 }, thickness: 0.5, color: LINE });
      y = PH - 54;
    }
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

  function alignX(text: string, font: PDFFont, size: number, x: number, w: number, align: ViewColumn["align"]): number {
    const tw = font.widthOfTextAtSize(text, size);
    if (align === "center") return x + (w - tw) / 2;
    if (align === "right") return x + w - PAD - tw;
    return x + PAD;
  }

  // ---------- first-page header: text on the left, portrait top right, thin black rule below both ----------
  function header() {
    const top = y;
    page.drawImage(portrait, { x: PW - M.side - imgW, y: top - imgH, width: imgW, height: imgH });
    page.drawRectangle({ x: PW - M.side - imgW, y: top - imgH, width: imgW, height: imgH, borderColor: LINE, borderWidth: 0.5 });
    page.drawText(safe(view.brand.toUpperCase()), { x: M.side, y: y - 13, size: 13, font: bold, color: BLACK });
    y -= 20;
    page.drawText(safe(view.pdfTitle), { x: M.side, y: y - 22, size: 22, font: bold, color: BLACK });
    y -= 30;
    page.drawText(safe(`Teacher: ${view.teacher}`), { x: M.side, y: y - 12, size: 12, font: regular, color: BLACK });
    y -= 18;
    y = Math.min(y, top - imgH) - 8;
    page.drawLine({ start: { x: M.side, y }, end: { x: PW - M.side, y }, thickness: 1.2, color: BLACK });
    y -= 12;
  }

  // ---------- report details: Fan/Guruh/Sana/O‘quvchilar soni in pairs, Mavzu etc. full width ----------
  function infoRow(items: DailyView["info"]) {
    const colW = contentW / items.length;
    const labelW = 98;
    const cells = items.map((it) => ({ it, lines: wrap(it.value, colW - labelW - (items.length > 1 ? 14 : 0), bold, BODY) }));
    const h = Math.max(...cells.map((c) => c.lines.length)) * LEAD + 5;
    ensure(h);
    cells.forEach(({ it, lines }, i) => {
      const x = M.side + i * colW;
      page.drawText(safe(it.label), { x, y: y - 11, size: 10, font: regular, color: GREY });
      lines.forEach((ln, li) => page.drawText(ln, { x: x + labelW, y: y - 11 - li * LEAD, size: BODY, font: bold, color: BLACK }));
      page.drawLine({ start: { x, y: y - h + 3 }, end: { x: x + colW - (items.length > 1 ? 14 : 0), y: y - h + 3 }, thickness: 0.4, color: LINE });
    });
    y -= h;
  }
  function details() {
    let pair: DailyView["info"] = [];
    const flush = () => {
      if (pair.length) infoRow(pair);
      pair = [];
    };
    for (const it of view.info) {
      if (it.wide) {
        flush();
        infoRow([it]);
      } else {
        pair.push(it);
        if (pair.length === 2) flush();
      }
    }
    flush();
    y -= 6;
  }

  // ---------- tables ----------
  function widths(cols: ViewColumn[], rows: Cell[][]): number[] {
    const total = cols.reduce((a, c) => a + c.weight, 0);
    const raw = cols.map((c) => (c.weight / total) * contentW);
    // a header word must never be cut mid-word: widen such columns, taking the width from columns with slack
    const need = cols.map((c, i) => {
      const head = Math.max(0, ...c.header.split(/\s+/).map((w) => bold.widthOfTextAtSize(safe(w), CELL)));
      // the name column may break an extreme word; every other column keeps its words whole
      const body = i === 1 && c.align === "left" ? 0 : Math.max(0, ...rows.flatMap((r) => r[i].text.split(/\s+/).map((w) => regular.widthOfTextAtSize(safe(w), CELL))));
      return Math.max(head, body) + 2 * PAD + 1;
    });
    const out = [...raw];
    let deficit = 0;
    out.forEach((w, i) => {
      if (w < need[i]) {
        deficit += need[i] - w;
        out[i] = need[i];
      }
    });
    if (deficit > 0) {
      const slack = out.map((w, i) => Math.max(0, w - need[i]));
      const sum = slack.reduce((a, b) => a + b, 0);
      if (sum > 0) {
        const take = Math.min(1, deficit / sum);
        return out.map((w, i) => w - slack[i] * take);
      }
    }
    return out;
  }

  function drawTable(t: ViewTable, keepTogether = false) {
    const w = widths(t.columns, t.rows);
    const totalW = w.reduce((a, b) => a + b, 0);
    const headLines = t.columns.map((c, i) => [...wrap(c.header, w[i] - 2 * PAD, bold, CELL), ...(c.sub ? wrap(c.sub, w[i] - 2 * PAD, regular, 8.5) : [])]);
    const headH = Math.max(...headLines.map((l) => l.length)) * LEAD + 2 * PAD - 2;
    const rowLines = (row: Cell[]) => row.map((c, i) => wrap(c.text, w[i] - 2 * PAD, regular, CELL));
    const rowH = (lines: string[][]) => Math.max(22, Math.max(...lines.map((l) => l.length)) * LEAD + 2 * PAD - 2);

    const drawHead = () => {
      let x = M.side;
      t.columns.forEach((c, i) => {
        page.drawRectangle({ x, y: y - headH, width: w[i], height: headH, color: HEAD_FILL, borderColor: BLACK, borderWidth: 0.6 });
        let ty = y - PAD - CELL;
        wrap(c.header, w[i] - 2 * PAD, bold, CELL).forEach((ln) => {
          page.drawText(ln, { x: alignX(ln, bold, CELL, x, w[i], c.align), y: ty, size: CELL, font: bold, color: BLACK });
          ty -= LEAD;
        });
        if (c.sub) {
          wrap(c.sub, w[i] - 2 * PAD, regular, 8.5).forEach((ln) => {
            page.drawText(ln, { x: alignX(ln, regular, 8.5, x, w[i], c.align), y: ty + 2, size: 8.5, font: regular, color: GREY });
            ty -= 11;
          });
        }
        x += w[i];
      });
      y -= headH;
    };

    const firstH = t.rows[0] ? rowH(rowLines(t.rows[0])) : 0;
    const introLines = (t.intro ?? []).flatMap((s) => wrap(s, contentW, regular, 10));
    if (keepTogether) {
      // A compact table that fits on one page starts on a fresh page rather than being cut after its first row.
      const total = 22 + introLines.length * 13 + 4 + headH + t.rows.reduce((a, r) => a + rowH(rowLines(r)), 0) + (t.legend ? 26 : 0);
      if (y - total < bottom && total <= PH - 54 - bottom) newPage();
    }
    ensure(24 + introLines.length * 13 + headH + firstH);
    page.drawText(safe(t.title), { x: M.side, y: y - 13, size: 13, font: bold, color: BLACK });
    y -= 22;
    for (const ln of introLines) {
      ensure(13);
      page.drawText(ln, { x: M.side, y: y - 10, size: 10, font: regular, color: BLACK });
      y -= 13;
    }
    if (introLines.length) y -= 4;
    drawHead();

    t.rows.forEach((row) => {
      const lines = rowLines(row);
      const h = rowH(lines);
      if (y - h < bottom) {
        newPage();
        drawHead(); // repeated header on every new page
      }
      let x = M.side;
      lines.forEach((ls, i) => {
        page.drawRectangle({ x, y: y - h, width: w[i], height: h, borderColor: LINE, borderWidth: 0.5 });
        ls.forEach((ln, li) => {
          page.drawText(ln, { x: alignX(ln, regular, CELL, x, w[i], t.columns[i].align), y: y - PAD - CELL - 1 - li * LEAD, size: CELL, font: regular, color: BLACK });
        });
        x += w[i];
      });
      y -= h;
    });
    if (t.legend) {
      y -= 5;
      for (const ln of wrap(t.legend, contentW, regular, 9)) {
        ensure(12);
        page.drawText(ln, { x: M.side, y: y - 9, size: 9, font: regular, color: GREY });
        y -= 12;
      }
    }
    y -= 14;
  }

  // ---------- document ----------
  newPage(true);
  header();
  details();
  drawTable(view.table);
  if (view.appendix) drawTable(view.appendix, true);

  // ---------- minimal footer on every page: "ARK Education" left, "Sahifa i / n" right ----------
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
