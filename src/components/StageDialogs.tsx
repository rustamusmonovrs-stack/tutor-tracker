"use client";

import { useEffect, useMemo, useState } from "react";
import { FormDialog } from "@/components/ui";
import { useData } from "@/lib/data";
import { todayISO } from "@/lib/dates";
import { LEVELS, isLevel, isSelectable, nextLevel, sortBooks, stageView, type BookStint, type Level, type Outcome, type Track } from "@/lib/stages";
import { useStages } from "@/lib/stagesData";
import type { Student } from "@/lib/types";

const OUTCOMES: { id: Outcome; label: string }[] = [
  { id: "next", label: "Keyingi kitobga o'tdi" },
  { id: "repeat", label: "Shu kitobni qayta o'qiydi" },
  { id: "program_done", label: "Dasturni yakunladi" },
];

/**
 * Place one or many students on a program + book + level + start date.
 * The first program of a student is their primary one; a second program becomes the additional track.
 * Nobody is placed automatically: only the students passed in are touched.
 */
export function SetStageDialog({
  open,
  students,
  onClose,
  programIds,
  lockProgram = false,
}: {
  open: boolean;
  students: Student[];
  onClose: (saved: boolean) => void;
  /** Programs offered in the picker (default: all). */
  programIds?: string[];
  /** Program picker disabled (correcting an existing track). */
  lockProgram?: boolean;
}) {
  const { programs, booksOf, bookById, scopesOf, setStage } = useStages();
  const offered = useMemo(() => programs.filter((p) => !programIds || programIds.includes(p.id)), [programs, programIds]);
  const [programId, setProgramId] = useState("");
  const [bookId, setBookId] = useState("");
  const [level, setLevel] = useState<Level | "">("");
  const [started, setStarted] = useState(todayISO());
  const [own, setOwn] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      const prefer = students.length === 1 ? scopesOf(students[0].id)[0]?.program.id : undefined;
      setProgramId(offered.find((p) => p.id === prefer)?.id ?? offered[0]?.id ?? "");
      setBookId("");
      setLevel("");
      setStarted(todayISO());
      setOwn({});
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const ordered = useMemo(() => sortBooks(booksOf(programId).filter(isSelectable)), [booksOf, programId]);

  // Per student: which track this program is for them, or why they are skipped.
  const plan = students.map((s) => {
    const scopes = scopesOf(s.id);
    const existing = scopes.find((x) => x.program.id === programId);
    let track: Track | null;
    let reason = "";
    if (existing) {
      track = existing.track;
      if (stageView(existing.stints).state === "done") {
        track = null;
        reason = "dasturni yakunlagan";
      }
    } else if (!scopes.some((x) => x.track === "primary")) track = "primary";
    else if (!scopes.some((x) => x.track === "additional")) track = "additional";
    else {
      track = null;
      reason = "ikkala yo‘nalish band";
    }
    return { s, track, reason, hasStints: Boolean(existing && existing.stints.length) };
  });
  const blocked = plan.filter((p) => !p.track);
  const targets = plan.filter((p) => p.track);
  const extras = targets.filter((p) => p.track === "additional" && !scopesOf(p.s.id).some((x) => x.program.id === programId));
  const today = todayISO();

  function pickProgram(id: string) {
    setProgramId(id);
    setBookId("");
  }

  function pickBook(id: string) {
    setBookId(id);
    const suggested = bookById.get(id)?.level;
    if (suggested && !level) setLevel(suggested);
  }

  async function save() {
    if (!bookId || !isLevel(level)) return;
    setBusy(true);
    const dates: Record<string, string> = {};
    for (const t of targets) if (own[t.s.id] && own[t.s.id] !== started) dates[t.s.id] = own[t.s.id];
    let ok = true;
    for (const track of ["primary", "additional"] as const) {
      const ids = targets.filter((t) => t.track === track).map((t) => t.s.id);
      if (ok && ids.length) ok = await setStage(ids, bookId, level, started, dates, track);
    }
    setBusy(false);
    if (ok) onClose(true);
  }

  const suggested = bookById.get(bookId)?.level ?? null;

  return (
    <FormDialog
      open={open}
      title={targets.length === 1 ? `${targets[0].s.name}: bosqichni belgilash` : `${targets.length || students.length} ta o'quvchiga bosqich belgilash`}
      submitLabel="Saqlash"
      canSubmit={Boolean(programId && bookId && level && started && targets.length)}
      busy={busy}
      onSubmit={() => void save()}
      onCancel={() => onClose(false)}
    >
      <label className="field">
        <span className="field__label">O‘quv dasturi</span>
        <select className="select" value={programId} disabled={lockProgram} onChange={(e) => pickProgram(e.target.value)}>
          {offered.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      {ordered.length === 0 && <p className="hint">Bu dasturda faol kitob yo‘q. Avval “O‘quv dasturi” bo‘limida kitob qo‘shing.</p>}
      <label className="field">
        <span className="field__label">Hozirgi kitob</span>
        <select className="select" value={bookId} onChange={(e) => pickBook(e.target.value)}>
          <option value="">Kitobni tanlang</option>
          {ordered.map((b, i) => (
            <option key={b.id} value={b.id}>
              {i + 1}. {b.title}
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
            {targets.map(({ s }) => (
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

      {extras.length > 0 && (
        <p className="hint">
          Qo‘shimcha yo‘nalish sifatida biriktiriladi: {extras.map((t) => t.s.name).join(", ")}. Asosiy dastur va level o‘zgarmaydi.
        </p>
      )}
      {plan.some((p) => p.hasStints) && targets.length > 0 && (
        <p className="hint">Faol kitobi bor o‘quvchilarda joriy davr tuzatiladi; tugatilgan tarix o‘zgarmaydi.</p>
      )}
      {blocked.length > 0 && (
        <p className="hint" style={{ color: "var(--warn)" }}>
          O‘tkazib yuboriladi: {blocked.map((b) => `${b.s.name} (${b.reason})`).join(", ")}.
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
  const { booksOf, bookById, programById, finishBook, transferStudent } = useStages();
  const ordered = useMemo(() => sortBooks(booksOf(stint?.program_id ?? "").filter(isSelectable)), [booksOf, stint]);
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
        {stint ? (programById.get(stint.program_id)?.name ?? "") : ""} · Tugatilgan kitob: {current ? current.title : "—"}
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
              {ordered.map((b, i) => (
                <option key={b.id} value={b.id}>
                  {i + 1}. {b.title}
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
