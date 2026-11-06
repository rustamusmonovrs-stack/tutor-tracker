/**
 * Status icons shared by the HTML (inline <svg>) and the PDF (vector paths): one 9x9 grid, stroke only, round caps.
 * Nothing is loaded from outside: the paths below ARE the icons.
 */
export type IconName = "check" | "cross" | "dash" | "clock" | "pending" | "minus";

export const ICON_GRID = 9;

export const ICON_PATH: Record<IconName, string> = {
  check: "M1.4 4.8 L3.7 7 L7.6 2",
  cross: "M1.8 1.8 L7.2 7.2 M7.2 1.8 L1.8 7.2",
  dash: "M1.8 4.5 H7.2",
  clock: "M4.5 .9 a3.6 3.6 0 1 1 0 7.2 a3.6 3.6 0 1 1 0 -7.2 M4.5 2.7 V4.6 L5.9 5.5",
  pending: "M1.7 4.5 h.01 M4.5 4.5 h.01 M7.3 4.5 h.01",
  minus: "M2.2 4.5 H6.8",
};

/** Inline SVG markup (decorative: the text next to it carries the meaning). */
export function iconSvg(name: IconName, size = 12): string {
  return `<svg class="ic" viewBox="0 0 ${ICON_GRID} ${ICON_GRID}" width="${size}" height="${size}" aria-hidden="true" focusable="false"><path d="${ICON_PATH[name]}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
