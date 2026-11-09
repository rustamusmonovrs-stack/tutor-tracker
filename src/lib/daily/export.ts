import type { DailyReport } from "./model";
import { buildDailyView } from "./view";

/** Static project assets (bundled in /public, never a temporary chat URL). */
export const DAILY_ASSETS = {
  /** Inter 4.1 (SIL OFL 1.1, see /fonts/Inter-LICENSE.txt), Latin + Cyrillic subset: used by the daily PDF only. */
  fontRegular: "/fonts/Inter-Regular.ttf",
  fontSemibold: "/fonts/Inter-SemiBold.ttf",
  fontBold: "/fonts/Inter-Bold.ttf",
  /** The teacher portrait (colour, unaltered): used by both the PDF and the HTML export. */
  portrait: "/brand/teacher-rustam-usmonov.jpg",
} as const;

async function bytes(url: string, what: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${what} yuklanmadi`);
  return new Uint8Array(await res.arrayBuffer());
}

let assetCache: Promise<{ regular: Uint8Array; semibold: Uint8Array; bold: Uint8Array; portrait: Uint8Array }> | null = null;
function loadAssets() {
  if (!assetCache) {
    assetCache = Promise.all([
      bytes(DAILY_ASSETS.fontRegular, "Shrift"),
      bytes(DAILY_ASSETS.fontSemibold, "Shrift"),
      bytes(DAILY_ASSETS.fontBold, "Shrift"),
      bytes(DAILY_ASSETS.portrait, "O‘qituvchi surati"),
    ])
      .then(([regular, semibold, bold, portrait]) => ({ regular, semibold, bold, portrait }))
      .catch((e) => {
        assetCache = null; // allow a retry after a network failure
        throw e;
      });
  }
  return assetCache;
}

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Read-only: builds the file from an already loaded report and downloads it. Nothing is written to the database. */
export async function downloadDailyPdf(report: DailyReport): Promise<void> {
  const view = buildDailyView(report);
  const [{ buildDailyPdf }, a] = await Promise.all([import("./pdf"), loadAssets()]);
  const out = await buildDailyPdf(view, { fonts: { regular: a.regular, semibold: a.semibold, bold: a.bold }, portrait: a.portrait });
  save(new Blob([out as BlobPart], { type: "application/pdf" }), `${view.fileBase}.pdf`);
}

export async function downloadDailyHtml(report: DailyReport): Promise<void> {
  const view = buildDailyView(report);
  const [{ renderDailyHtml, portraitDataUri }, a] = await Promise.all([import("./html"), loadAssets()]);
  const html = renderDailyHtml(view, portraitDataUri(a.portrait));
  save(new Blob([html], { type: "text/html;charset=utf-8" }), `${view.fileBase}.html`);
}
