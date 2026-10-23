"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ATTENDANCE_META, ATTENDANCE_ORDER, HOMEWORK_META, HOMEWORK_ORDER } from "@/lib/config";
import { useData } from "@/lib/data";
import type { Attendance, Homework } from "@/lib/types";
import { IconAbsent, IconCheck, IconHwFull, IconHwNone, IconHwPartial, IconPresent } from "./icons";

/** "Saqlanmoqda…" while writes are in flight, "Saqlandi" briefly after the last one succeeds. */
export function SaveChip() {
  const { pendingWrites, lastSavedAt } = useData();
  const [recent, setRecent] = useState(false);

  useEffect(() => {
    if (!lastSavedAt) return;
    setRecent(true);
    const t = setTimeout(() => setRecent(false), 2200);
    return () => clearTimeout(t);
  }, [lastSavedAt]);

  if (pendingWrites > 0) {
    return (
      <span className="save-chip save-chip--saving" role="status">
        <span className="dot" /> Saqlanmoqda…
      </span>
    );
  }
  if (recent) {
    return (
      <span className="save-chip save-chip--saved" role="status">
        <IconCheck /> Saqlandi
      </span>
    );
  }
  return null;
}

const HW_ICONS = { full: IconHwFull, partial: IconHwPartial, not_done: IconHwNone } as const;
const ATT_ICONS = { present: IconPresent, absent: IconAbsent } as const;

/** Attendance buttons. Pressing the active one clears it (back to "belgilanmagan"). */
export function AttendanceMarks({
  value,
  disabled,
  name,
  onChange,
}: {
  value: Attendance | null;
  disabled?: boolean;
  name: string;
  onChange: (next: Attendance | null) => void;
}) {
  return (
    <div className="marks" role="group" aria-label={`Davomat: ${name}`}>
      {ATTENDANCE_ORDER.map((a) => {
        const Icon = ATT_ICONS[a];
        return (
          <button
            key={a}
            type="button"
            className={`mark mark--${a}`}
            aria-pressed={value === a}
            disabled={disabled}
            title={ATTENDANCE_META[a].hint}
            onClick={() => onChange(value === a ? null : a)}
          >
            <Icon aria-hidden />
            {ATTENDANCE_META[a].label}
          </button>
        );
      })}
    </div>
  );
}

/** Homework buttons. Pressing the active one clears it (back to "baholanmagan"). */
export function HomeworkMarks({
  value,
  disabled,
  muted,
  name,
  onChange,
}: {
  value: Homework | null;
  disabled?: boolean;
  muted?: boolean;
  name: string;
  onChange: (next: Homework | null) => void;
}) {
  return (
    <div className={`marks${muted ? " marks--muted" : ""}`} role="group" aria-label={`Uy vazifasi: ${name}`}>
      {HOMEWORK_ORDER.map((h) => {
        const Icon = HW_ICONS[h];
        return (
          <button
            key={h}
            type="button"
            className={`mark mark--${h}`}
            aria-pressed={value === h}
            disabled={disabled}
            title={HOMEWORK_META[h].hint}
            onClick={() => onChange(value === h ? null : h)}
          >
            <Icon aria-hidden />
            {HOMEWORK_META[h].label}
          </button>
        );
      })}
    </div>
  );
}

/** Native <dialog> confirm: focus-trapped, Escape closes, works on small screens. */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog ref={ref} className="dialog" onCancel={(e) => { e.preventDefault(); onCancel(); }} onClick={(e) => e.target === ref.current && onCancel()}>
      <div className="dialog__body">
        <h2>{title}</h2>
        <div className="hint">{children}</div>
      </div>
      <div className="dialog__foot">
        <button type="button" className="btn" onClick={onCancel}>
          Bekor qilish
        </button>
        <button type="button" className={`btn ${danger ? "btn--danger" : "btn--primary"}`} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}

export function Kpi({ label, value, unit, note }: { label: string; value: ReactNode; unit?: string; note?: string }) {
  return (
    <div className="card kpi">
      <span className="kpi__label">{label}</span>
      <span className="kpi__value">
        {value}
        {unit && <small>{unit}</small>}
      </span>
      {note && <span className="kpi__note">{note}</span>}
    </div>
  );
}

export function Meter({ value, max, tone }: { value: number; max: number; tone?: "ok" }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <span className="meter" role="presentation">
      <span className={`meter__fill${tone === "ok" ? " meter__fill--ok" : ""}`} style={{ width: `${pct}%` }} />
    </span>
  );
}
