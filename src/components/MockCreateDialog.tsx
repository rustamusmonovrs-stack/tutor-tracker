"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useData } from "@/lib/data";
import { todayISO } from "@/lib/dates";
import {
  defaultMockName,
  MAX_SECTIONS,
  parseWhole,
  sectionKey,
  SECTION_PRESETS,
  validateSections,
  type Mock,
  type SectionDraft,
} from "@/lib/mock";
import type { MockStore } from "@/lib/mockData";
import { IconClose, IconPlus } from "./icons";

export function MockCreateDialog({
  open,
  store,
  defaultGroupId,
  onClose,
  onCreated,
}: {
  open: boolean;
  store: MockStore;
  defaultGroupId: string | null;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { activeGroups, activeStudents } = useData();
  const ref = useRef<HTMLDialogElement>(null);
  const [groupId, setGroupId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [name, setName] = useState("");
  const [drafts, setDrafts] = useState<SectionDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setGroupId(defaultGroupId && activeGroups.some((g) => g.id === defaultGroupId) ? defaultGroupId : (activeGroups[0]?.id ?? ""));
      setDate(todayISO());
      setName("");
      setDrafts([]);
      setError(null);
      d.showModal();
    }
    if (!open && d.open) d.close();
    // Reset only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const students = useMemo(() => activeStudents.filter((s) => s.group_id === groupId), [activeStudents, groupId]);
  const groupMocks = useMemo(() => store.mocks.filter((m: Mock) => m.group_id === groupId).length, [store.mocks, groupId]);
  const totalQuestions = drafts.reduce((a, d) => a + (parseWhole(d.total) ?? 0), 0);
  const used = new Set(drafts.map((d) => sectionKey(d.name)));

  const update = (i: number, patch: Partial<SectionDraft>) =>
    setDrafts((ds) => ds.map((d, j) => (j === i ? { ...d, ...patch } : d)));

  const addSection = (label = "") => {
    if (drafts.length >= MAX_SECTIONS) return;
    if (label && used.has(sectionKey(label))) return;
    setDrafts((ds) => [...ds, { name: label, total: "" }]);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!groupId) return setError("Guruhni tanlang.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError("Sanani kiriting.");
    if (students.length === 0) return setError("Bu guruhda o'quvchi yo'q.");
    const bad = validateSections(drafts);
    if (bad) return setError(bad);
    setError(null);
    setBusy(true);
    const id = await store.createMock({
      groupId,
      name: name.trim() || defaultMockName(groupMocks),
      date,
      sections: drafts.map((d) => ({ name: d.name.trim().replace(/\s+/g, " "), total: Number(d.total) })),
      studentIds: students.map((s) => s.id),
    });
    setBusy(false);
    if (id) onCreated(id);
  }

  return (
    <dialog
      ref={ref}
      className="dialog dialog--wide"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(e) => e.target === ref.current && !busy && onClose()}
    >
      <form onSubmit={submit} noValidate>
        <div className="dialog__body mock-form">
          <h2>Yangi Mock</h2>

          <div className="mock-form__grid">
            <label className="field">
              <span className="field__label">Guruh</span>
              <select className="select" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                {activeGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Sana</span>
              <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
          </div>

          <label className="field">
            <span className="field__label">Mock nomi (ixtiyoriy)</span>
            <input
              className="input"
              value={name}
              maxLength={80}
              placeholder={defaultMockName(groupMocks)}
              onChange={(e) => setName(e.target.value)}
            />
          </label>

          <div className="field">
            <span className="field__label">Test bo&apos;limlari</span>
            <div className="mock-presets">
              {SECTION_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className="seg__btn mock-preset"
                  aria-pressed={used.has(sectionKey(p))}
                  disabled={used.has(sectionKey(p))}
                  onClick={() => addSection(p)}
                >
                  {p}
                </button>
              ))}
              <button type="button" className="seg__btn mock-preset" onClick={() => addSection()}>
                <IconPlus aria-hidden /> Custom
              </button>
            </div>

            {drafts.length === 0 ? (
              <p className="hint">Kamida bitta bo&apos;lim qo&apos;shing, so&apos;ng savollar sonini kiriting.</p>
            ) : (
              <ul className="mock-sections">
                {drafts.map((d, i) => (
                  <li key={i} className="mock-sections__row">
                    <input
                      className="input"
                      aria-label={`${i + 1}-bo'lim nomi`}
                      value={d.name}
                      maxLength={40}
                      placeholder="Bo'lim nomi"
                      onChange={(e) => update(i, { name: e.target.value })}
                    />
                    <input
                      className="input mock-sections__count"
                      aria-label={`${d.name || i + 1} savollar soni`}
                      inputMode="numeric"
                      value={d.total}
                      placeholder="Savol"
                      onChange={(e) => update(i, { total: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                    />
                    <button
                      type="button"
                      className="btn btn--ghost btn--icon"
                      aria-label={`${d.name || i + 1} bo'limini o'chirish`}
                      onClick={() => setDrafts((ds) => ds.filter((_, j) => j !== i))}
                    >
                      <IconClose aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {drafts.length > 0 && (
              <p className="hint">
                Jami: <strong>{totalQuestions}</strong> savol · {students.length} o&apos;quvchi yuklanadi
              </p>
            )}
          </div>

          {error && (
            <p className="mock-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="dialog__foot">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Bekor qilish
          </button>
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? "Yaratilmoqda…" : "Yaratish"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
