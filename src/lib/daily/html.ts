import { escapeHtml as esc } from "../subjects/reportHtml";
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
.hero{position:relative;background:var(--navy);color:#fff;border-radius:var(--r);padding:26px 28px 24px;overflow:hidden}
.hero::after{content:"";position:absolute;right:-60px;top:-60px;width:220px;height:220px;border-radius:50%;background:rgba(47,107,255,.35)}
.brand{display:flex;align-items:center;gap:10px;font-weight:700;letter-spacing:.16em;font-size:12px;text-transform:uppercase;color:#bcd0ff}
.brand i{display:inline-grid;place-items:center;width:28px;height:28px;border-radius:8px;background:var(--blue-2);color:#fff;font-style:normal;letter-spacing:0;font-size:12px}
h1{margin:10px 0 4px;font-size:clamp(26px,4.4vw,36px);line-height:1.15;letter-spacing:-.01em}
.teacher{margin:0;color:#d7e3ff;font-size:15px}
.print{position:absolute;right:24px;bottom:22px;z-index:1;font:inherit;font-weight:600;font-size:14px;color:var(--navy);background:#fff;border:0;border-radius:10px;padding:9px 16px;cursor:pointer}
.print:hover{background:var(--sky)}
.print:focus-visible{outline:3px solid #9db9ff;outline-offset:2px}
h2{margin:30px 0 12px;font-size:18px;display:flex;align-items:center;gap:10px}
h2::after{content:"";flex:1;height:1px;background:var(--line-2)}
.details{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-top:18px}
.item{margin:0;background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px 14px}
.item--wide{grid-column:1/-1}
.item dt{margin:0;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3)}
.item dd{margin:2px 0 0;font-weight:650;overflow-wrap:anywhere}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
.tile{background:#fff;border:1px solid var(--line);border-left:5px solid var(--line-2);border-radius:12px;padding:12px 14px}
.tile--ok{border-left-color:#1fa971}.tile--bad{border-left-color:#d9534f}.tile--warn{border-left-color:#e0a100}.tile--muted{border-left-color:#9aa6c2}
.tile b{display:block;font-size:26px;line-height:1.15;font-variant-numeric:tabular-nums}
.tile span{display:block;color:var(--ink-2);font-size:13.5px}
.tile small{display:block;margin-top:2px;color:var(--ink-3);font-size:12.5px}
.intro{margin:0 0 10px;padding-left:20px;color:var(--ink-2)}
.legend{margin:8px 2px 0;color:var(--ink-3);font-size:13px}
.card{background:#fff;border:1px solid var(--line);border-radius:var(--r);overflow:hidden}
table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}
thead th{background:var(--sky);color:var(--navy);text-align:left;font-size:13px;letter-spacing:.02em;padding:11px 14px;border-bottom:2px solid var(--blue)}
thead th small{display:block;font-weight:500;color:var(--ink-2)}
tbody th,tbody td{padding:10px 14px;border-bottom:1px solid var(--line);vertical-align:middle;text-align:left}
tbody th{font-weight:600}
tbody tr:nth-child(even){background:var(--sky-2)}
tbody tr:last-child th,tbody tr:last-child td{border-bottom:0}
.center{text-align:center}.right{text-align:right}
.pill{display:inline-block;padding:3px 10px;border-radius:999px;font-size:13px;font-weight:600;line-height:1.4}
.pill--ok{background:var(--ok-bg);color:var(--ok)}.pill--bad{background:var(--bad-bg);color:var(--bad)}
.pill--warn{background:var(--warn-bg);color:var(--warn)}.pill--muted{background:var(--mute-bg);color:var(--mute)}
.notes{margin:18px 0 0;padding-left:20px;color:var(--ink-3);font-size:13px}
footer{margin-top:34px;padding:16px 18px;background:#fff;border:1px solid var(--line);border-radius:var(--r);display:flex;align-items:center;gap:16px;flex-wrap:wrap}
footer img{display:block;width:72px;height:72px;flex:none;border-radius:10px;border:1px solid var(--line-2)}
footer .who{flex:1;min-width:180px}
footer .who b{display:block;font-size:16px}
footer .who span{display:block;color:var(--ink-2);font-size:14px}
footer .who small{display:block;color:var(--ink-3);font-size:12.5px;margin-top:2px}
footer .stamp{color:var(--ink-3);font-size:12.5px}
@media (max-width:720px){
  body{font-size:14.5px}
  .hero{padding:20px 18px 64px}
  .hero::after{width:130px;height:130px;right:-46px;top:-46px;opacity:.7}
  .details{grid-template-columns:1fr 1fr;gap:10px}
  .item--wide{grid-column:1/-1}
  .tiles{grid-template-columns:1fr 1fr;gap:10px}
  .tile{padding:10px 12px}.tile b{font-size:22px}
  .print{left:18px;right:auto;bottom:16px}
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
  .hero,.pill,.tile,thead th,tbody tr:nth-child(even){-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .card,.tile,.item,footer{box-shadow:none}
  h2{break-after:avoid}
  tr,.tile,.item,footer{break-inside:avoid}
  thead{display:table-header-group}
}
`;

const pill = (c: Cell) => (c.tone ? `<span class="pill pill--${c.tone}">${esc(c.text)}</span>` : esc(c.text));

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
  const info = view.info.map((it) => `<dl class="item${it.wide ? " item--wide" : ""}"><dt>${esc(it.label)}</dt><dd>${esc(it.value)}</dd></dl>`).join("");
  const tiles = view.summary
    .map((s) => `<div class="tile${s.tone ? ` tile--${s.tone}` : ""}"><span>${esc(s.label)}</span><b>${esc(s.value)}</b>${s.sub ? `<small>${esc(s.sub)}</small>` : ""}</div>`)
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
<div class="brand"><i aria-hidden="true">A</i>${esc(view.brand)}</div>
<h1>${esc(view.htmlTitle)}</h1>
<p class="teacher">Teacher: ${esc(view.teacher)}</p>
<button class="print" type="button" onclick="window.print()">Chop etish</button>
</header>
<section class="details" aria-label="Dars ma’lumotlari">${info}</section>
<h2>${esc(view.summaryTitle)}</h2>
<section class="tiles">${tiles}</section>
<h2>${esc(view.table.title)}</h2>
${tableHtml(view.table)}
${view.appendix ? `<h2>${esc(view.appendix.title)}</h2>${tableHtml(view.appendix)}` : ""}
<ul class="notes">${notes}</ul>
<footer>
<img src="${esc(portraitUri)}" alt="${esc(view.teacher)}" width="72" height="72">
<div class="who"><b>Teacher: ${esc(view.teacher)}</b><span>${esc(view.brand)}</span><small>${esc(view.subjectLabel)} · ${esc(view.groupName)} · ${esc(view.dateLabel)}</small></div>
<span class="stamp">Ark Progress</span>
</footer>
</main>
</body>
</html>
`;
}

export type { Tone };
