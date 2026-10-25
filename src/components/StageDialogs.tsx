"use client";

import { useEffect, useMemo, useState } from "react";
import { FormDialog } from "@/components/ui";
import { useData } from "@/lib/data";
import { todayISO } from "@/lib/dates";
import { LEVELS, isLevel, nextLevel, sortBooks, stageView, type BookStint, type Level, type Outcome } from "@/lib/stages";
import { useStages } from "@/lib/stagesData";
import type { Student } from "@/lib/types";

const OUTCOMES: { id: Outcome; label: string }[] = [
  { id: "next", label: "Keyingi kitobga o'tdi" },
  { id: "repeat", label: "Shu kitobni qayta o'qiydi" },
  { id: "program_done", label: "9 kitoblik dasturni yakunladi" },
];

/** Place one or many students on a book + level + start date (bulk). Each student may keep their own real start date. */
export function SetStageDialog({ open, students, onClose }: { open: boolean; students: Student[]; onClose: (saved: boolean) => void }) {
  const { books, bookById, stintsByStudent, setStage } = useStages();
  const ordered = useMemo(() => sortBooks(books.filter((b) => b.active)), [books]);
  const [bookId, setBookId] = useState("");
  const [level, setLevel] = useState<Level | "">("");
  const [started, setStarted] = useState(todayISO());
  const [own, setOwn] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setBookId("");
      setLevel("");
      setStarted(todayISO());
      setOwn({});
      setBusy(false);
    }
  }, [open]);

  // Students whose program is already finished cannot be placed again.
  const blocked = students.filter((s) => stageView(stintsByStudent.get(s.id) ?? []).state === "done");
  const targets = students.filter((s) => !blocked.includes(s));
  const today = todayISO();

  function pickBook(id: string) {
    setBookId(id);
    const suggested = bookById.get(id)?.level;
    if (suggested && !level) setLevel(suggested);
  }

  async function save() {
    if (!bookId || !isLevel(level)) return;
    setBusy(true);
    const dates: Record<string, string> = {};
    for (const s of targets) if (own[s.id] && own[s.id] !== started) dates[s.id] = own[s.id];
    const ok = await setStage(targets.map((s) => s.id), bookId, level, started, dates);
    setBusy(false);
    if (ok) onClose(true);
  }

  const suggested = bookById.get(bookId)?.level ?? null;

  return (
    <FormDialog
      open={open}
      title={targets.length === 1 ? `${targets[0].name}: bosqichni belgilash` : `${targets.length} ta o'quvchiga bosqich belgilash`}
      submitLabel="Saqlash"
      canSubmit={Boolean(bookId && level && started && targets.length)}
      busy={busy}
      onSubmit={() => void save()}
      onCancel={() => onClose(false)}
    >
      {ordered.length === 0 && <p className="hint">Avval “O‘quv dasturi” bo‘limida kitoblarni yarating.</p>}
      <label className="field">
        <span className="field__label">Hozirgi kitob</span>
        <select className="select" value={bookId} onChange={(e) => pickBook(e.target.value)}>
          <option value="">Kitobni tanlang</option>
          {ordered.map((b) => (
            <option key={b.id} value={b.id}>
              {b.position}. {b.title}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field__label">Level</span>
        <select className="select" value={level} onChange={(e) => setLevel(e.target.value as Level)}>
          <option value="">Levelni tanlang</option>
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {l}
              {suggested === l ? " (kitob uchun tavsiya)" : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field__label">Kitobni boshlagan sana</span>
        <input className="input" type="date" value={started} max={today} onChange={(e) => setStarted(e.target.value)} />
      </label>
      <p className="hint">Tanlangan kitobgacha bo‘lgan kitoblar tugatilgan deb hisoblanmaydi — faqat shu joylashuv saqlanadi.</p>

      {targets.length > 1 && (
        <details className="own-dates">
          <summary>Har bir o‘quvchining haqiqiy boshlanish sanasi (ixtiyoriy)</summary>
          <div className="stack" style={{ gap: 6, marginTop: 8 }}>
            {targets.map((s) => (
              <label key={s.id} className="own-dates__row">
                <span>{s.name}</span>
                <input
                  className="input"
                  type="date"
                  value={own[s.id] ?? started}
                  max={today}
                  aria-label={`${s.name}: boshlagan sana`}
                  onChange={(e) => setOwn((o) => ({ ...o, [s.id]: e.target.value }))}
                />
              </label>
            ))}
          </div>
        </details>
      )}

      {students.some((s) => (stintsByStudent.get(s.id) ?? []).length > 0) && targets.length > 0 && (
        <p className="hint">Faol kitobi bor o‘quvchilarda joriy davr tuzatiladi; tugatilgan tarix o‘zgarmaydi.</p>
      )}
      {blocked.length > 0 && (
        <p className="hint" style={{ color: "var(--warn)" }}>
          Dasturni yakunlaganlar o‘tkazib yuboriladi: {blocked.map((s) => s.name).join(", ")}.
        </p>
      )}
    </FormDialog>
  );
}

/** "Kitobni tugatdi": finishing the book and (optionally) moving group are two separate actions. */
export function FinishBookDialog({
  open,
  student,
  stint,
  onClose,
}: {
  open: boolean;
  student: Student;
  stint: BookStint | null;
  onClose: () => void;
}) {
  const { groups } = useData();
  const { books, bookById, finishBook, transferStudent } = useStages();
  const ordered = useMemo(() => sortBooks(books.filter((b) => b.active)), [books]);
  const current = stint ? bookById.get(stint.book_id) : null;
  const today = todayISO();

  const [outcome, setOutcome] = useState<Outcome>("next");
  const [finished, setFinished] = useState(today);
  const [nextBook, setNextBook] = useState("");
  const [level, setLevel] = useState<Level | "">("");
  const [nextStart, setNextStart] = useState(today);
  const [groupId, setGroupId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !stint) return;
    const after = ordered.find((b) => current && b.position > current.position) ?? null;
    setOutcome(after ? "next" : "program_done");
    setFinished(today);
    setNextBook(after?.id ?? "");
    setLevel(after?.level ?? stint.level ?? "");
    setNextStart(today);
    setGroupId("");
    setBusy(false);
  }, [open, stint, ordered, current, today]);

  if (!stint) return null;

  function pickNext(id: string) {
    setNextBook(id);
    const l = bookById.get(id)?.level;
    if (l) setLevel(l);
  }

  const needsBook = outcome === "next";
  const hasNext = outcome !== "program_done";
  const canSubmit = Boolean(finished) && finished >= stint.started_on && (!needsBook || Boolean(nextBook)) && (!hasNext || (Boolean(nextStart) && nextStart >= finished));
  const suggestion = nextLevel(isLevel(level) ? level : null);

  async function save() {
    if (!stint) return;
    setBusy(true);
    const ok = await finishBook({
      stintId: stint.id,
      finishedOn: finished,
      outcome,
      nextBookId: outcome === "next" ? nextBook : null,
      nextLevel: hasNext && isLevel(level) ? level : null,
      nextStartedOn: hasNext ? nextStart : null,
    });
    // Group change is a separate action, only after the book was saved.
    if (ok && groupId) await transferStudent(student.id, groupId, "Kitob tugatilgandan keyin");
    setBusy(false);
    if (ok) onClose();
  }

  const otherGroups = groups.filter((g) => !g.archived_at && g.id !== student.group_id);

  return (
    <FormDialog
      open={open}
      title={`${student.name}: kitobni tugatdi`}
      submitLabel="Tasdiqlash va saqlash"
      canSubmit={canSubmit}
      busy={busy}
      onSubmit={() => void save()}
      onCancel={onClose}
    >
      <div className="callout" style={{ background: "var(--brand-soft)", color: "var(--brand)", marginBottom: 0 }}>
        Tugatilgan kitob: {current ? `${current.position}. ${current.title}` : "—"}
      </div>
      <div className="seg seg--wrap" role="group" aria-label="Natija">
        {OUTCOMES.map((o) => (
          <button
            key={o.id}
            type="button"
            className="seg__btn"
            aria-pressed={outcome === o.id}
            disabled={o.id === "next" && ordered.every((b) => !current || b.position <= current.position)}
            onClick={() => setOutcome(o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>
      <label className="field">
        <span className="field__label">Tugatish sanasi</span>
        <input className="input" type="date" value={finished} min={stint.started_on} max={today} onChange={(e) => setFinished(e.target.value)} />
      </label>

      {outcome === "next" && (
        <>
          <label className="field">
            <span className="field__label">Yangi kitob</span>
            <select className="select" value={nextBook} onChange={(e) => pickNext(e.target.value)}>
              <option value="">Kitobni tanlang</option>
              {ordered.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.position}. {b.title}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">Yangi level (o‘qituvchi tasdiqlaydi)</span>
            <select className="select" value={level} onChange={(e) => setLevel(e.target.value as Level)}>
              <option value="">Levelni tanlang</option>
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          {suggestion && level !== suggestion && <p className="hint">Daraja avtomatik oshirilmaydi. Keyingi daraja: {suggestion}.</p>}
        </>
      )}
      {outcome === "repeat" && (
        <p className="hint">Shu kitob qaytadan boshlanadi; oldingi davr tarixda alohida saqlanadi.</p>
      )}
      {hasNext && (
        <label className="field">
          <span className="field__label">{outcome === "repeat" ? "Qayta boshlash sanasi" : "Yangi kitobni boshlash sanasi"}</span>
          <input className="input" type="date" value={nextStart} min={finished} onChange={(e) => setNextStart(e.target.value)} />
        </label>
      )}
      {outcome === "program_done" && <p className="hint">Yangi kitob tanlash shart emas. O‘quvchi “dasturni yakunlagan” deb belgilanadi.</p>}

      <label className="field">
        <span className="field__label">Guruh</span>
        <select className="select" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
          <option value="">Hozirgi guruhda davom etadi</option>
          {otherGroups.map((g) => (
            <option key={g.id} value={g.id}>
              Boshqa guruhga o‘tkazish: {g.name}
            </option>
          ))}
        </select>
      </label>
      {groupId && <p className="hint">Guruh o‘zgarishi kitob tugatishdan keyin alohida amal sifatida yoziladi; eski guruh tarixi saqlanadi.</p>}
    </FormDialog>
  );
}
