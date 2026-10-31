import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { ReportModel } from "./report";
import { reportMeta, reportTables, type ReportTable, type TableColumn } from "./reportTables";

export interface PdfFonts {
  regular: Uint8Array;
  bold: Uint8Array;
}

const BLACK = rgb(0, 0, 0);
const GREY = rgb(0.35, 0.35, 0.35);
const LINE = rgb(0.55, 0.55, 0.55);
const HEAD_FILL = rgb(0.91, 0.91, 0.91);

const M = { top: 46, bottom: 44, side: 40 };
const PAD = 4;
const SIZE = 8.5;
const LEAD = 11;
const MIN_COL = 34; // narrowest data column (a dd.mm date)
const NAME_W = 140;

/** Real PDF (vector text, embedded Unicode font) built from the same tables the HTML export uses. */
export async function buildReportPdf(model: ReportModel, fonts: PdfFonts): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(fonts.regular, { subset: true });
  const bold = await doc.embedFont(fonts.bold, { subset: true });
  const known = new Set(regular.getCharacterSet());
  const safe = (s: string) => Array.from(s.replace(/\s+/g, " ")).map((ch) => (known.has(ch.codePointAt(0)!) ? ch : "?")).join("");

  const meta = reportMeta(model);
  const tables = reportTables(model);
  const wide = model.dates.length > 7 || model.tests.length > 6;
  const [PW, PH] = wide ? [841.89, 595.28] : [595.28, 841.89];
  const contentW = PW - 2 * M.side;

  const pages: PDFPage[] = [];
  let page: PDFPage;
  let y = 0;
  const running = `${meta.title} · ${model.groupName}`;

  function newPage(first = false) {
    page = doc.addPage([PW, PH]);
    pages.push(page);
    y = PH - M.top;
    if (!first) {
      page.drawText(safe(running), { x: M.side, y: PH - 28, size: 8, font: regular, color: GREY });
      page.drawLine({ start: { x: M.side, y: PH - 33 }, end: { x: PW - M.side, y: PH - 33 }, thickness: 0.5, color: LINE });
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
        // a single word longer than the column is broken by characters
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

  function ensure(h: number) {
    if (y - h < M.bottom) newPage();
  }

  function textBlock(text: string, size: number, font: PDFFont, color = BLACK, gap = 4) {
    for (const ln of wrap(text, contentW, font, size)) {
      ensure(size + 3);
      page.drawText(ln, { x: M.side, y: y - size, size, font, color });
      y -= size + 3;
    }
    y -= gap;
  }

  function keyValues(pairs: [string, string][], cols: number) {
    const cw = contentW / cols;
    const rows = Math.ceil(pairs.length / cols);
    ensure(rows * 15 + 6);
    pairs.forEach(([k, v], i) => {
      const cx = M.side + (i % cols) * cw;
      const cy = y - Math.floor(i / cols) * 15;
      page.drawText(safe(k), { x: cx, y: cy - 9, size: 8.5, font: regular, color: GREY });
      const label = wrap(v, cw - 112, bold, 9)[0];
      page.drawText(label, { x: cx + 104, y: cy - 9, size: 9, font: bold, color: BLACK });
      page.drawLine({ start: { x: cx, y: cy - 12 }, end: { x: cx + cw - 12, y: cy - 12 }, thickness: 0.4, color: LINE });
    });
    y -= rows * 15 + 6;
  }

  function drawTable(title: string, legend: string | undefined, columns: TableColumn[], rows: string[][], totalRow: boolean) {
    const widths = columnWidths(columns, rows);
    const headerLines = columns.map((c, i) => [...wrap(c.header, widths[i] - 2 * PAD, bold, SIZE), ...(c.sub ? wrap(c.sub, widths[i] - 2 * PAD, regular, 7) : [])]);
    const headH = Math.max(...headerLines.map((l, i) => l.length * LEAD * (columns[i].sub ? 0.92 : 1))) + 2 * PAD;
    const drawHead = () => {
      page.drawRectangle({ x: M.side, y: y - headH, width: widths.reduce((a, b) => a + b, 0), height: headH, color: HEAD_FILL });
      let x = M.side;
      columns.forEach((c, i) => {
        let ty = y - PAD - SIZE;
        const hdr = wrap(c.header, widths[i] - 2 * PAD, bold, SIZE);
        hdr.forEach((ln) => {
          page.drawText(ln, { x: alignX(ln, bold, SIZE, x, widths[i], c.align), y: ty, size: SIZE, font: bold, color: BLACK });
          ty -= LEAD;
        });
        if (c.sub) {
          wrap(c.sub, widths[i] - 2 * PAD, regular, 7).forEach((ln) => {
            page.drawText(ln, { x: alignX(ln, regular, 7, x, widths[i], c.align), y: ty + 1, size: 7, font: regular, color: GREY });
            ty -= 9;
          });
        }
        x += widths[i];
      });
      const total = widths.reduce((a, b) => a + b, 0);
      page.drawLine({ start: { x: M.side, y: y - headH }, end: { x: M.side + total, y: y - headH }, thickness: 1.2, color: BLACK });
      page.drawLine({ start: { x: M.side, y }, end: { x: M.side + total, y }, thickness: 0.6, color: BLACK });
      y -= headH;
    };

    // keep the title, the legend, the header and at least one row together
    const first = rows[0] ? Math.max(...rows[0].map((c, i) => wrap(c, widths[i] - 2 * PAD, regular, SIZE).length)) * LEAD + 2 * PAD : 0;
    ensure(26 + (legend ? 14 : 0) + headH + first);
    page.drawText(safe(title), { x: M.side, y: y - 11, size: 11, font: bold, color: BLACK });
    y -= 17;
    if (legend) {
      page.drawText(safe(legend), { x: M.side, y: y - 8, size: 7.5, font: regular, color: GREY });
      y -= 13;
    }
    drawHead();

    rows.forEach((row, ri) => {
      const cells = row.map((c, i) => wrap(c, widths[i] - 2 * PAD, ri === rows.length - 1 && totalRow ? bold : regular, SIZE));
      const h = Math.max(...cells.map((l) => l.length)) * LEAD + 2 * PAD;
      if (y - h < M.bottom) {
        newPage();
        drawHead(); // repeated header on every new page
      }
      const isTotal = totalRow && ri === rows.length - 1;
      let x = M.side;
      cells.forEach((lines, i) => {
        const font = i === 0 || isTotal ? (isTotal ? bold : regular) : regular;
        lines.forEach((ln, li) => {
          page.drawText(ln, { x: alignX(ln, font, SIZE, x, widths[i], columns[i].align), y: y - PAD - SIZE - li * LEAD, size: SIZE, font, color: BLACK });
        });
        x += widths[i];
      });
      const total = widths.reduce((a, b) => a + b, 0);
      page.drawLine({ start: { x: M.side, y: y - h }, end: { x: M.side + total, y: y - h }, thickness: isTotal ? 1 : 0.4, color: isTotal ? BLACK : LINE });
      if (isTotal) page.drawLine({ start: { x: M.side, y }, end: { x: M.side + total, y }, thickness: 1, color: BLACK });
      y -= h;
    });
    y -= 14;
  }

  function alignX(text: string, font: PDFFont, size: number, x: number, w: number, align: TableColumn["align"]): number {
    const tw = font.widthOfTextAtSize(text, size);
    if (align === "center") return x + (w - tw) / 2;
    if (align === "right") return x + w - PAD - tw;
    return x + PAD;
  }

  /** Name/label column wide enough for long names, the rest shared evenly (never narrower than a date). */
  function columnWidths(columns: TableColumn[], rows: string[][]): number[] {
    const n = columns.length;
    if (n === 2) return [90, contentW - 90];
    const labelW = columns[0].header === "O‘quvchi" || columns[0].header === "Test" ? NAME_W : Math.min(NAME_W, contentW / n);
    const rest = n - 1;
    const each = Math.max(MIN_COL, (contentW - labelW) / rest);
    const natural = [labelW, ...Array(rest).fill(each)];
    const sum = natural.reduce((a, b) => a + b, 0);
    // wide summary tables: scale to fit; matrices are chunked so they never need to shrink below MIN_COL
    const fitted = sum > contentW ? natural.map((w) => (w * contentW) / sum) : sum < contentW && columns.some((c) => c.align !== "left") && rows.length ? stretch(natural, contentW) : natural;
    return keepWordsWhole(columns, fitted);
  }
  /** A header word must never be cut mid-word ("Kiritilmaga/n"): widen such columns, taking the width from columns with slack. */
  function keepWordsWhole(columns: TableColumn[], widths: number[]): number[] {
    const need = columns.map((c) => Math.max(0, ...c.header.split(/\s+/).map((w) => bold.widthOfTextAtSize(safe(w), SIZE))) + 2 * PAD + 1);
    const out = [...widths];
    let deficit = 0;
    out.forEach((w, i) => {
      if (w < need[i]) {
        deficit += need[i] - w;
        out[i] = need[i];
      }
    });
    if (deficit <= 0) return out;
    const slack = out.map((w, i) => (w > need[i] ? w - need[i] : 0));
    const totalSlack = slack.reduce((a, b) => a + b, 0);
    if (totalSlack <= 0) return out;
    const take = Math.min(1, deficit / totalSlack);
    return out.map((w, i) => w - slack[i] * take);
  }
  function stretch(w: number[], total: number): number[] {
    const extra = total - w.reduce((a, b) => a + b, 0);
    return w.map((x, i) => (i === 0 ? x : x + extra / (w.length - 1)));
  }

  // ---------- document ----------
  newPage(true);
  page!.drawText(safe(meta.brand.toUpperCase()), { x: M.side, y: y - 9, size: 9, font: bold, color: GREY });
  y -= 18;
  page!.drawText(safe(meta.title), { x: M.side, y: y - 17, size: 17, font: bold, color: BLACK });
  y -= 26;
  page!.drawLine({ start: { x: M.side, y }, end: { x: PW - M.side, y }, thickness: 1.6, color: BLACK });
  y -= 12;
  keyValues(meta.info, 2);
  y -= 4;
  textBlock("Guruh bo‘yicha umumiy ko‘rsatkichlar", 11, bold, BLACK, 4);
  keyValues(meta.summary, 3);
  y -= 6;

  if (!tables.length) {
    textBlock("Tanlangan davrda dars yozilmagan.", 10, regular);
  }
  for (const t of tables) {
    if (t.chunk) {
      const perChunk = Math.max(1, Math.floor((contentW - NAME_W) / MIN_COL));
      const dataCols = t.columns.length - 1;
      for (let start = 0; start < dataCols; start += perChunk) {
        const idx = Array.from({ length: Math.min(perChunk, dataCols - start) }, (_, k) => start + 1 + k);
        const title = dataCols > perChunk ? `${t.title} (${Math.floor(start / perChunk) + 1}/${Math.ceil(dataCols / perChunk)})` : t.title;
        drawTable(title, start === 0 ? t.legend : undefined, [t.columns[0], ...idx.map((i) => t.columns[i])], t.rows.map((r) => [r[0], ...idx.map((i) => r[i])]), false);
      }
    } else {
      drawTable(t.title, t.legend, t.columns, t.rows, t.id === "students");
    }
  }

  // footer on every page: now the total is known
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M.side, y: 32 }, end: { x: PW - M.side, y: 32 }, thickness: 0.5, color: LINE });
    p.drawText(safe("Ark Progress — ARK Education"), { x: M.side, y: 20, size: 8, font: regular, color: GREY });
    const label = `Sahifa ${i + 1} / ${pages.length}`;
    p.drawText(label, { x: PW - M.side - regular.widthOfTextAtSize(label, 8), y: 20, size: 8, font: regular, color: GREY });
  });

  doc.setTitle(`${meta.title} — ${model.groupName}`);
  doc.setAuthor("Ark Progress — ARK Education");
  doc.setProducer("Ark Progress");
  return doc.save();
}

export type { ReportTable };
