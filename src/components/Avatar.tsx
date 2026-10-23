const TINTS = [
  ["#e8edfd", "#2748c9"],
  ["#e2f4eb", "#0e7a4d"],
  ["#fcefd6", "#8a5200"],
  ["#ece8fb", "#5440bf"],
  ["#fae5e3", "#b3302b"],
  ["#e1eef6", "#1d5f80"],
] as const;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function hash(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/** Initials on a soft tint; the colour is derived from the name so it stays stable. */
export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const [bg, fg] = TINTS[hash(name) % TINTS.length];
  return (
    <span
      className="avatar"
      aria-hidden
      style={{ width: size, height: size, background: bg, color: fg, fontSize: size * 0.38 }}
    >
      {initials(name)}
    </span>
  );
}
