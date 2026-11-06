import type { DailyReport } from "./model";
import { buildDailyView } from "./view";

/** Static project assets (bundled in /public, never a temporary chat URL). */
export const DAILY_ASSETS = {
  fontRegular: "/fonts/DejaVuSans.ttf",
  fontBold: "/fonts/DejaVuSans-Bold.ttf",
  /** Colour portrait: used by the HTML export. */
  portrait: "/brand/teacher-rustam-usmonov.jpg",
  /** Grayscale copy of the same photo: used by the black-and-white PDF. */
  portraitGray: "/brand/teacher-rustam-usmonov-gray.jpg",
} as const;

async function bytes(url: string, what: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${what} yuklanmadi`);
  return new Uint8Array(await res.arrayBuffer());
}

let assetCache: Promise<{ regular: Uint8Array; bold: Uint8Array; portrait: Uint8Array; portraitGray: Uint8Array }> | null = null;
function loadAssets() {
  if (!assetCache) {
    assetCache = Promise.all([bytes(DAILY_ASSETS.fontRegular, "Shrift"), bytes(DAILY_ASSETS.fontBold, "Shrift"), bytes(DAILY_ASSETS.portrait, "O‘qituvchi surati"), bytes(DAILY_ASSETS.portraitGray, "O‘qituvchi surati (PDF)")])
      .then(([regular, bold, portrait, portraitGray]) => ({ regular, bold, portrait, portraitGray }))
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
  const out = await buildDailyPdf(view, { fonts: { regular: a.regular, bold: a.bold }, portrait: a.portraitGray });
  save(new Blob([out as BlobPart], { type: "application/pdf" }), `${view.fileBase}.pdf`);
}

export async function downloadDailyHtml(report: DailyReport): Promise<void> {
  const view = buildDailyView(report);
  const [{ renderDailyHtml, portraitDataUri }, a] = await Promise.all([import("./html"), loadAssets()]);
  const html = renderDailyHtml(view, portraitDataUri(a.portrait));
  save(new Blob([html], { type: "text/html;charset=utf-8" }), `${view.fileBase}.html`);
}
