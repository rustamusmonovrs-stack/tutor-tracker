import { TIME_ZONE } from "./config";

/** Today's calendar date in Tashkent as YYYY-MM-DD (independent of device timezone). */
export function todayISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function parse(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(iso: string, n: number): string {
  const dt = parse(iso);
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

/** Monday of the week containing `iso`. */
export function weekStart(iso: string): string {
  const dow = parse(iso).getUTCDay(); // 0 = Sunday
  return addDays(iso, -((dow + 6) % 7));
}

/** Whole days from a to b (b - a). */
export function diffDays(a: string, b: string): number {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / 86_400_000);
}

const MONTHS = ["yan", "fev", "mar", "apr", "may", "iyn", "iyl", "avg", "sen", "okt", "noy", "dek"];
const WEEKDAYS = ["Yak", "Dush", "Sesh", "Chor", "Pay", "Jum", "Shan"];
const WEEKDAYS_LONG = ["Yakshanba", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba"];

/** "23 okt" */
export function formatShort(iso: string): string {
  const d = parse(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "Jum, 23 okt" */
export function formatDay(iso: string): string {
  return `${WEEKDAYS[parse(iso).getUTCDay()]}, ${formatShort(iso)}`;
}

/** "Juma, 23 oktabr 2026" style long label. */
export function formatLong(iso: string): string {
  const d = parse(iso);
  return `${WEEKDAYS_LONG[d.getUTCDay()]}, ${formatShort(iso)} ${d.getUTCFullYear()}`;
}
