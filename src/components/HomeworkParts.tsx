"use client";

import { IconChevronRight, IconCoin } from "@/components/icons";
import { TASK_STATUS_LABEL, type Progress, type TaskStatus } from "@/lib/homework";

const ORDER: TaskStatus[] = ["full", "partial", "not_done"];

/** To'liq / Chala / Qilmadi for one task. Pressing the active one clears it back to Baholanmagan. */
export function StatusPicker({
  value,
  label,
  disabled,
  onChange,
}: {
  value: TaskStatus | null;
  label: string;
  disabled?: boolean;
  onChange: (next: TaskStatus | null) => void;
}) {
  return (
    <div className="hwpick" role="group" aria-label={label}>
      {ORDER.map((s) => (
        <button
          key={s}
          type="button"
          className={`hwpick__btn hwpick__btn--${s}`}
          aria-pressed={value === s}
          disabled={disabled}
          onClick={() => onChange(value === s ? null : s)}
        >
          {TASK_STATUS_LABEL[s]}
        </button>
      ))}
    </div>
  );
}

export function coinChip(n: number) {
  return (
    <span className="coins coins--sm" title="Har bir To'liq vazifa uchun 1 tanga">
      <IconCoin aria-hidden />+{n}
    </span>
  );
}

const TONE_WORD: Record<Progress["tone"], string> = {
  none: "Vazifa yo'q",
  pending: "Baholanmagan",
  ok: "To'liq",
  warn: "Qisman",
  bad: "Qilmadi",
};

/** Compact "2/3" progress button. Meaning is in the text, colour only reinforces it. */
export function ProgressButton({
  progress,
  tasksExist,
  legacy,
  name,
  onClick,
}: {
  progress: Progress;
  /** The group has tasks that day (so "0 assigned" means Berilmagan rather than "no tasks"). */
  tasksExist: boolean;
  /** Old-style single grade stored on the lesson. */
  legacy?: string | null;
  name: string;
  onClick: () => void;
}) {
  let tone = progress.tone;
  let main: string;
  let sub: string;
  if (progress.assigned === 0) {
    tone = "none";
    main = "—";
    sub = legacy ? `Eski: ${legacy}` : tasksExist ? "Berilmagan" : "Vazifa yo'q";
  } else {
    main = `${progress.full}/${progress.assigned}`;
    sub = progress.tone === "pending" ? (progress.graded === 0 ? "Baholanmagan" : `${progress.ungraded} ta qoldi`) : TONE_WORD[progress.tone];
  }
  return (
    <button
      type="button"
      className={`hwp hwp--${tone}`}
      onClick={onClick}
      aria-label={`${name}: vazifalar ${progress.assigned ? `${progress.full}/${progress.assigned}, ${sub}` : sub}. Ochish`}
    >
      <span className="hwp__main">{main}</span>
      <span className="hwp__sub">{sub}</span>
      <IconChevronRight aria-hidden className="hwp__go" />
    </button>
  );
}
