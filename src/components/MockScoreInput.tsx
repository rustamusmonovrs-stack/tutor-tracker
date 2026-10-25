"use client";

import { useEffect, useRef, useState } from "react";
import { checkScore } from "@/lib/mock";

/**
 * One score cell. Keeps what the teacher types locally, reports valid/empty values live (for the
 * overall %), and saves on blur / Enter. Empty never becomes 0; invalid input is rejected and reverts.
 */
export function MockScoreInput({
  value,
  max,
  disabled,
  label,
  onLive,
  onCommit,
  onInvalid,
}: {
  value: number | undefined;
  max: number;
  disabled?: boolean;
  label: string;
  onLive: (v: number | null | undefined) => void; // undefined = no override (back to stored value)
  onCommit: (v: number | null) => void;
  onInvalid: (message: string) => void;
}) {
  const stored = value === undefined ? "" : String(value);
  const [text, setText] = useState(stored);
  const focused = useRef(false);
  const [bad, setBad] = useState<string | null>(null);

  useEffect(() => {
    if (!focused.current) setText(stored);
  }, [stored]);

  function change(raw: string) {
    // Only digits: no minus sign, no decimals, no letters.
    const t = raw.replace(/\D/g, "").slice(0, 6);
    setText(t);
    const c = checkScore(t, max);
    if (c.kind === "error") {
      setBad(c.message);
      onLive(undefined);
    } else {
      setBad(null);
      onLive(c.kind === "empty" ? null : c.value);
    }
  }

  function commit() {
    focused.current = false;
    const c = checkScore(text, max);
    onLive(undefined);
    if (c.kind === "error") {
      onInvalid(`${label}: ${c.message}`);
      setBad(null);
      setText(stored);
      return;
    }
    setBad(null);
    onCommit(c.kind === "empty" ? null : c.value);
  }

  return (
    <input
      className={`input mock-score${bad ? " mock-score--bad" : ""}`}
      data-score=""
      inputMode="numeric"
      enterKeyHint="next"
      autoComplete="off"
      aria-label={`${label} (0–${max})`}
      aria-invalid={bad ? true : undefined}
      title={bad ?? undefined}
      placeholder="–"
      value={text}
      disabled={disabled}
      onFocus={(e) => {
        focused.current = true;
        e.currentTarget.select();
      }}
      onChange={(e) => change(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        const all = Array.from(document.querySelectorAll<HTMLInputElement>("input[data-score]:not(:disabled)"));
        const next = all[all.indexOf(e.currentTarget) + 1];
        if (next) next.focus();
        else e.currentTarget.blur();
      }}
    />
  );
}
