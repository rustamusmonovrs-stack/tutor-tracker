const TINTS = [
  ["#e3e9fb", "#1f3a93"],
  ["#daf2e6", "#14724a"],
  ["#ffe9c7", "#8a4e00"],
  ["#e6e1fa", "#5440bf"],
  ["#fadcd8", "#b0352c"],
  ["#dcecf5", "#1d5f80"],
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
export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const [bg, fg] = TINTS[hash(name) % TINTS.length];
  return (
    <span
      className="avatar"
      aria-hidden
      style={{ width: size, height: size, background: bg, color: fg, fontSize: size * 0.36 }}
    >
      {initials(name)}
    </span>
  );
}
