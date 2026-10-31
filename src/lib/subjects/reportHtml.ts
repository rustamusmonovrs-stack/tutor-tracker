import type { ReportModel } from "./report";
import { reportMeta, reportTables, type ReportTable } from "./reportTables";

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const CSS = `
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;padding:24px;background:#fff;color:#000;font:13px/1.45 "DejaVu Sans","Segoe UI",Roboto,Arial,sans-serif}
.page{max-width:1100px;margin:0 auto}
.brand{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#333;margin:0}
h1{font-size:22px;margin:4px 0 14px;padding-bottom:10px;border-bottom:2px solid #000}
h2{font-size:14px;margin:26px 0 6px}
.meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:6px 24px;margin:0 0 14px}
.meta div{display:flex;gap:8px;border-bottom:1px solid #bbb;padding:3px 0}
.meta dt{color:#444;min-width:120px}.meta dd{margin:0;font-weight:700}
.legend{margin:0 0 6px;color:#333;font-size:11px;white-space:pre-wrap}
.wrap{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}
th,td{border:1px solid #888;padding:4px 7px;vertical-align:top}
thead th{background:#e9e9e9;border-bottom:2px solid #000;font-weight:700}
th small{display:block;font-weight:400;font-size:10px;color:#333}
.left{text-align:left}.center{text-align:center}.right{text-align:right}
tbody th{text-align:left;font-weight:600}
tr:last-child.total td,tr:last-child.total th{font-weight:700;border-top:2px solid #000}
footer{margin-top:28px;padding-top:8px;border-top:1px solid #000;font-size:11px;color:#333;display:flex;justify-content:space-between}
.empty{padding:14px;border:1px dashed #888}
@page{size:A4 landscape;margin:12mm}
@media print{body{padding:0}.wrap{overflow:visible}thead{display:table-header-group}tr{break-inside:avoid}h2{break-after:avoid}}
`;

function table(t: ReportTable): string {
  const lastTotal = t.id === "students";
  const head = t.columns
    .map((c, i) => `<th scope="col" class="${c.align}">${escapeHtml(c.header)}${c.sub ? `<small>${escapeHtml(c.sub)}</small>` : ""}</th>`)
    .join("");
  const body = t.rows
    .map((r, ri) => {
      const cells = r.map((v, i) => (i === 0 ? `<th scope="row" class="left">${escapeHtml(v)}</th>` : `<td class="${t.columns[i].align}">${escapeHtml(v)}</td>`)).join("");
      return `<tr${lastTotal && ri === t.rows.length - 1 ? ' class="total"' : ""}>${cells}</tr>`;
    })
    .join("");
  return `<h2>${escapeHtml(t.title)}</h2>${t.legend ? `<p class="legend">${escapeHtml(t.legend)}</p>` : ""}<div class="wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

/** Standalone HTML: embedded CSS, no scripts, no external resources, every value escaped. */
export function renderReportHtml(m: ReportModel): string {
  const meta = reportMeta(m);
  const tables = reportTables(m);
  const info = meta.info.map(([k, v]) => `<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`).join("");
  const sum = meta.summary.map(([k, v]) => `<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`).join("");
  return `<!doctype html>
<html lang="uz">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(meta.title)} — ${escapeHtml(m.groupName)}</title>
<style>${CSS}</style>
</head>
<body>
<div class="page">
<p class="brand">${escapeHtml(meta.brand)}</p>
<h1>${escapeHtml(meta.title)}</h1>
<dl class="meta">${info}</dl>
<h2>Guruh bo‘yicha umumiy ko‘rsatkichlar</h2>
<dl class="meta">${sum}</dl>
${tables.length ? tables.map(table).join("\n") : '<p class="empty">Tanlangan davrda dars yozilmagan.</p>'}
<footer><span>Ark Progress — ARK Education</span><span>Yaratilgan: ${escapeHtml(meta.info[3][1])}</span></footer>
</div>
</body>
</html>
`;
}
