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
/** Footer portrait: 22 mm wide, height from the image's own aspect ratio. */
export const FOOTER_PORTRAIT_MM = 22;
const FOOT_BASE = 16; // distance from the page bottom to the portrait
const M = { top: 48, side: 42 };

const BODY = 11;
const CELL = 10.5;
const LEAD = 14;
const PAD = 5;

const isPng = (b: Uint8Array) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;

/**
 * Real, vector A4 PDF built from the shared DailyView: black text on white, grey rules, an embedded Unicode font,
 * a reserved footer (teacher portrait, name, page numbers) and a table header repeated on every page.
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
  const imgW = FOOTER_PORTRAIT_MM * MM;
  const imgH = (imgW * portrait.height) / portrait.width; // aspect ratio preserved
  const footTop = FOOT_BASE + imgH + 8; // everything above this line is report content
  const bottom = footTop + 8;

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

  // ---------- first-page header ----------
  function header() {
    page.drawText(safe(view.brand.toUpperCase()), { x: M.side, y: y - 13, size: 13, font: bold, color: BLACK });
    y -= 20;
    page.drawText(safe(view.pdfTitle), { x: M.side, y: y - 22, size: 22, font: bold, color: BLACK });
    y -= 30;
    page.drawText(safe(`Teacher: ${view.teacher}`), { x: M.side, y: y - 12, size: 12, font: regular, color: BLACK });
    y -= 18;
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

  // ---------- summary: compact two-column list (label left, figure right, small detail underneath) ----------
  function summary() {
    const gap = 10;
    const colW = (contentW - gap) / 2;
    const valueW = 64;
    ensure(22 + 40);
    page.drawText(safe(view.summaryTitle), { x: M.side, y: y - 13, size: 13, font: bold, color: BLACK });
    y -= 22;
    const items = view.summary;
    for (let i = 0; i < items.length; i += 2) {
      const pair = items.slice(i, i + 2);
      const boxes = pair.map((it) => ({
        it,
        label: wrap(it.label, colW - valueW - 20, regular, 10.5),
        sub: it.sub ? wrap(it.sub, colW - 16, regular, 9) : [],
      }));
      const h = Math.max(...boxes.map((b) => 6 + Math.max(b.label.length * 13, 15) + b.sub.length * 10 + 5));
      ensure(h + 4);
      boxes.forEach((b, j) => {
        const x = M.side + j * (colW + gap);
        page.drawRectangle({ x, y: y - h, width: colW, height: h, borderColor: LINE, borderWidth: 0.6 });
        b.label.forEach((ln, li) => page.drawText(ln, { x: x + 8, y: y - 6 - 10.5 - li * 13, size: 10.5, font: regular, color: BLACK }));
        const v = safe(b.it.value);
        page.drawText(v, { x: x + colW - 8 - bold.widthOfTextAtSize(v, 12.5), y: y - 6 - 12, size: 12.5, font: bold, color: BLACK });
        const subTop = y - 6 - Math.max(b.label.length * 13, 15);
        b.sub.forEach((ln, li) => page.drawText(ln, { x: x + 8, y: subTop - 8 - li * 10, size: 9, font: regular, color: GREY }));
      });
      y -= h + 4;
    }
    y -= 8;
    for (const n of view.notes) {
      for (const ln of wrap(`• ${n}`, contentW, regular, 9)) {
        ensure(12);
        page.drawText(ln, { x: M.side, y: y - 9, size: 9, font: regular, color: GREY });
        y -= 12;
      }
      y -= 2;
    }
    y -= 10;
  }

  // ---------- document ----------
  newPage(true);
  header();
  details();
  drawTable(view.table);
  summary();
  if (view.appendix) drawTable(view.appendix, true);

  // ---------- footer on every page (reserved area; the total page count is known now) ----------
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M.side, y: footTop }, end: { x: PW - M.side, y: footTop }, thickness: 0.6, color: LINE });
    p.drawImage(portrait, { x: M.side, y: FOOT_BASE, width: imgW, height: imgH });
    p.drawRectangle({ x: M.side, y: FOOT_BASE, width: imgW, height: imgH, borderColor: LINE, borderWidth: 0.5 });
    const tx = M.side + imgW + 14;
    p.drawText(safe(`Teacher: ${view.teacher}`), { x: tx, y: FOOT_BASE + imgH - 18, size: 12, font: bold, color: BLACK });
    p.drawText(safe(view.brand), { x: tx, y: FOOT_BASE + imgH - 34, size: 11, font: regular, color: BLACK });
    p.drawText(safe(`${view.subjectLabel} · ${view.groupName} · ${view.dateLabel}`.slice(0, 90)), { x: tx, y: FOOT_BASE + imgH - 48, size: 9, font: regular, color: GREY });
    const label = `Sahifa ${i + 1} / ${pages.length}`;
    p.drawText(label, { x: PW - M.side - regular.widthOfTextAtSize(label, 10), y: FOOT_BASE + imgH - 18, size: 10, font: regular, color: GREY });
  });

  doc.setTitle(`${view.pdfTitle} — ${view.groupName} — ${view.dateLabel}`);
  doc.setAuthor(`${view.brand} — ${view.teacher}`);
  doc.setProducer("Ark Progress");
  return doc.save();
}
