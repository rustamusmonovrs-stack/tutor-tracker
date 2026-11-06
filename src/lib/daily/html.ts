import { escapeHtml as esc } from "../subjects/reportHtml";
import { iconSvg, type IconName } from "./icons";
import type { Cell, DailyView, Tone, ViewTable } from "./view";

/** `data:` URI for the teacher portrait (embedded so the file works offline, with no Ark Progress dependency). */
export function portraitDataUri(bytes: Uint8Array, mime: "image/jpeg" | "image/png" = "image/jpeg"): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return `data:${mime};base64,${btoa(bin)}`;
}

const CSS = `
:root{
  --navy:#0b1f4d;--blue:#1d4ed8;--blue-2:#2f6bff;--sky:#e8f0ff;--sky-2:#f4f8ff;
  --ink:#0f1b3d;--ink-2:#46526f;--ink-3:#6b7794;--line:#dbe3f3;--line-2:#c4d0ea;
  --ok:#0e7a4d;--ok-bg:#e0f5ea;--bad:#b3302b;--bad-bg:#fbe4e2;--warn:#8a5a00;--warn-bg:#fdf1cc;--mute:#55607c;--mute-bg:#eaedf4;
  --r:14px;
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:#eef3fc;color:var(--ink);font:15px/1.5 "Segoe UI",system-ui,-apple-system,"Helvetica Neue",Arial,"DejaVu Sans",sans-serif}
.sheet{max-width:1080px;margin:0 auto;padding:20px 16px 40px}
.hero{position:relative;display:flex;align-items:center;justify-content:space-between;gap:20px;background:linear-gradient(115deg,var(--navy) 0%,#1a3f9c 100%);color:#fff;border-radius:var(--r);padding:26px 28px;overflow:hidden}
.hero::after{content:"";position:absolute;right:-70px;bottom:-90px;width:240px;height:240px;border-radius:50%;background:rgba(47,107,255,.28)}
.hero__txt{position:relative;z-index:1;min-width:0}
h1{margin:0 0 6px;font-size:clamp(28px,5vw,42px);line-height:1.1;letter-spacing:.01em;font-weight:800}
.teacher{margin:0;color:#d7e3ff;font-size:15px}
.portrait{position:relative;z-index:1;display:block;flex:none;width:104px;height:104px;object-fit:cover;border-radius:16px;border:3px solid #fff;box-shadow:0 6px 18px rgba(4,14,48,.35)}
.print{margin-top:16px;font:inherit;font-weight:600;font-size:14px;color:var(--navy);background:#fff;border:0;border-radius:10px;padding:9px 16px;cursor:pointer}
.print:hover{background:var(--sky)}
.print:focus-visible{outline:3px solid #9db9ff;outline-offset:2px}
h2{margin:30px 0 12px;font-size:18px;display:flex;align-items:center;gap:10px}
h2::after{content:"";flex:1;height:1px;background:var(--line-2)}
.details{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-top:18px}
.item{margin:0;background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px 14px}
.item--wide{grid-column:1/-1}
.item--date{background:var(--blue);border-color:var(--blue);color:#fff;box-shadow:0 6px 16px rgba(29,78,216,.28)}
.item--date dt{color:#e1e9ff}
.item--date dd{font-size:26px;line-height:1.2;font-weight:800;letter-spacing:.01em}
.item dt{margin:0;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3)}
.item dd{margin:2px 0 0;font-weight:650;overflow-wrap:anywhere}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
.tile{position:relative;background:#fff;border:1px solid var(--line);border-left:5px solid var(--line-2);border-radius:12px;padding:12px 14px}
.tile--ok{border-left-color:#1fa971;background:#f3fbf7}.tile--bad{border-left-color:#d9534f;background:#fdf4f3}.tile--warn{border-left-color:#e0a100;background:#fffaec}.tile--muted{border-left-color:#9aa6c2;background:#f6f8fc}
.tile--ok,.tile--bad,.tile--warn,.tile--muted{padding-right:44px}
.tile__ic{position:absolute;right:12px;top:12px;display:grid;place-items:center;width:24px;height:24px;border-radius:50%}
.tile--ok .tile__ic{background:var(--ok-bg);color:var(--ok)}.tile--bad .tile__ic{background:var(--bad-bg);color:var(--bad)}
.tile--warn .tile__ic{background:var(--warn-bg);color:var(--warn)}.tile--muted .tile__ic{background:var(--mute-bg);color:var(--mute)}
.tile b{display:block;font-size:26px;line-height:1.15;font-variant-numeric:tabular-nums}
.tile span{display:block;color:var(--ink-2);font-size:13.5px}
.tile small{display:block;margin-top:2px;color:var(--ink-3);font-size:12.5px}
.intro{margin:0 0 10px;padding-left:20px;color:var(--ink-2)}
.legend{margin:8px 2px 0;color:var(--ink-3);font-size:13px}
.card{background:#fff;border:1px solid var(--line);border-radius:var(--r);overflow:hidden}
table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}
thead th{background:var(--navy);color:#fff;text-align:left;font-size:13px;letter-spacing:.03em;padding:12px 14px;border-bottom:3px solid var(--blue-2)}
thead th small{display:block;font-weight:500;color:#cfdcff}
tbody th,tbody td{padding:10px 14px;border-bottom:1px solid var(--line);vertical-align:middle;text-align:left}
tbody th{font-weight:600}
tbody tr:nth-child(even){background:var(--sky-2)}
tbody tr:last-child th,tbody tr:last-child td{border-bottom:0}
.center{text-align:center}.right{text-align:right}
.pill{display:inline-flex;align-items:center;gap:6px;padding:4px 11px;border-radius:999px;font-size:13px;font-weight:600;line-height:1.4}
.pill .ic{flex:none}
.pill--faint{background:#f1f3f8;color:#8590a8}
.pill--ok{background:var(--ok-bg);color:var(--ok)}.pill--bad{background:var(--bad-bg);color:var(--bad)}
.pill--warn{background:var(--warn-bg);color:var(--warn)}.pill--muted{background:var(--mute-bg);color:var(--mute)}
.notes{margin:18px 0 0;padding-left:20px;color:var(--ink-3);font-size:13px}
footer{margin-top:30px;padding:12px 4px 0;border-top:1px solid var(--line-2);display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;color:var(--ink-3);font-size:12.5px}
@media (max-width:720px){
  body{font-size:14.5px}
  .hero{padding:18px;gap:14px}
  .portrait{width:68px;height:68px;border-radius:12px;border-width:2px}
  .item--date dd{font-size:22px}
  .details{grid-template-columns:1fr 1fr;gap:10px}
  .item--wide{grid-column:1/-1}
  .tiles{grid-template-columns:1fr 1fr;gap:10px}
  .tile{padding:10px 12px}.tile b{font-size:22px}
  table,tbody,tr,th,td{display:block}
  thead{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
  tbody tr{padding:10px 14px;border-bottom:1px solid var(--line)}
  tbody tr:last-child{border-bottom:0}
  tbody th,tbody td{padding:3px 0;border:0;display:flex;justify-content:space-between;gap:14px;text-align:right}
  tbody th{font-size:16px;text-align:left;justify-content:flex-start;padding-bottom:6px}
  tbody td::before{content:attr(data-label);color:var(--ink-3);font-size:12.5px;text-align:left;flex:none}
  tbody th[data-no]::before{content:attr(data-no) ". ";color:var(--ink-3);font-weight:500;margin-right:4px}
}
@media print{
  body{background:#fff;font-size:12px}
  .sheet{max-width:none;padding:0}
  .print{display:none}
  .hero{box-shadow:none}
  .hero,.pill,.tile,.tile__ic,.item--date,thead th,tbody tr:nth-child(even){-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .card,.tile,.item,footer{box-shadow:none}
  h2{break-after:avoid}
  tr,.tile,.item,footer{break-inside:avoid}
  thead{display:table-header-group}
}
`;

const pill = (c: Cell) => (c.tone ? `<span class="pill pill--${c.tone}">${c.icon ? iconSvg(c.icon, 12) : ""}<span>${esc(c.text)}</span></span>` : esc(c.text));
const TILE_ICON: Record<string, IconName> = { ok: "check", bad: "cross", warn: "clock", muted: "dash" };

function tableHtml(t: ViewTable): string {
  const head = t.columns
    .map((c) => `<th scope="col" class="${c.align}">${esc(c.header)}${c.sub ? `<small>${esc(c.sub)}</small>` : ""}</th>`)
    .join("");
  const body = t.rows
    .map((row) => {
      const cells = row
        .map((c, i) => {
          if (i === 0) return ""; // the row number is shown with the name (and as a column on wide screens, below)
          if (i === 1) return `<th scope="row" data-no="${esc(row[0].text)}">${esc(c.text)}</th>`;
          return `<td class="${t.columns[i].align === "center" ? "center" : ""}" data-label="${esc(t.columns[i].header)}${t.columns[i].sub ? ` ${esc(t.columns[i].sub!)}` : ""}">${pill(c)}</td>`;
        })
        .join("");
      return `<tr><td class="center nocol" data-label="№">${esc(row[0].text)}</td>${cells}</tr>`;
    })
    .join("");
  return `${t.intro?.length ? `<ol class="intro">${t.intro.map((s) => `<li>${esc(s.replace(/^\d+-vazifa:\s*/, ""))}</li>`).join("")}</ol>` : ""}<div class="card"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>${t.legend ? `<p class="legend">${esc(t.legend)}</p>` : ""}`;
}

/** Standalone HTML: embedded CSS and portrait, one tiny inline print handler, no remote resources, every value escaped. */
export function renderDailyHtml(view: DailyView, portraitUri: string): string {
  const info = view.info.map((it) => `<dl class="item${it.wide ? " item--wide" : ""}${it.kind === "date" ? " item--date" : ""}"><dt>${esc(it.label)}</dt><dd>${esc(it.value)}</dd></dl>`).join("");
  const tiles = view.summary
    .map((s) => `<div class="tile${s.tone ? ` tile--${s.tone}` : ""}">${s.tone && TILE_ICON[s.tone] ? `<i class="tile__ic">${iconSvg(TILE_ICON[s.tone], 13)}</i>` : ""}<span>${esc(s.label)}</span><b>${esc(s.value)}</b>${s.sub ? `<small>${esc(s.sub)}</small>` : ""}</div>`)
    .join("");
  const notes = view.notes.map((n) => `<li>${esc(n)}</li>`).join("");
  const title = `${view.htmlTitle} — ${view.groupName} — ${view.dateLabel}`;
  // The row-number column is hidden on phones (the number is shown with the name) and visible on wider screens.
  const extra = `@media (max-width:720px){.nocol{display:none!important}} @page{size:A4 ${view.wide ? "landscape" : "portrait"};margin:12mm}`;
  return `<!doctype html>
<html lang="uz">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>${CSS}${extra}</style>
</head>
<body>
<main class="sheet">
<header class="hero">
<div class="hero__txt">
<h1>${esc(view.htmlTitle)}</h1>
<p class="teacher">Teacher: ${esc(view.teacher)}</p>
<button class="print" type="button" onclick="window.print()">Chop etish</button>
</div>
<img class="portrait" src="${esc(portraitUri)}" alt="${esc(view.teacher)}" width="104" height="104">
</header>
<section class="details" aria-label="Dars ma’lumotlari">${info}</section>
<h2>${esc(view.summaryTitle)}</h2>
<section class="tiles">${tiles}</section>
<h2>${esc(view.table.title)}</h2>
${tableHtml(view.table)}
${view.appendix ? `<h2>${esc(view.appendix.title)}</h2>${tableHtml(view.appendix)}` : ""}
<ul class="notes">${notes}</ul>
<footer>
<span>${esc(view.brand)}</span>
<span>${esc(view.subjectLabel)} · ${esc(view.groupName)} · ${esc(view.dateLabel)}</span>
</footer>
</main>
</body>
</html>
`;
}

export type { Tone };
