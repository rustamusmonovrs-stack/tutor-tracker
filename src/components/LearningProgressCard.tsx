"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { FinishBookDialog, SetStageDialog } from "@/components/StageDialogs";
import { Meter } from "@/components/ui";
import { IconFlag, IconPrint, IconStages, IconTransfer } from "@/components/icons";
import { useData } from "@/lib/data";
import { formatDate, todayISO } from "@/lib/dates";
import { durationText, NO_DATA, sortBooks, summarizeStudent, weeksText, type Book } from "@/lib/stages";
import { useStages } from "@/lib/stagesData";
import type { Student } from "@/lib/types";

/** 9 segments: green = finished, blue = reading now, neutral = not started. Never inferred from elapsed time. */
export function BookSegments({ books, completed, activeId, compact }: { books: Book[]; completed: string[]; activeId: string | null; compact?: boolean }) {
  const ordered = sortBooks(books);
  if (!ordered.length) return null;
  return (
    <ol className={`segbar${compact ? " segbar--compact" : ""}`} aria-label="9 kitoblik dastur">
      {ordered.map((b) => {
        const state = completed.includes(b.id) ? "done" : b.id === activeId ? "now" : "todo";
        const label = state === "done" ? "tugatilgan" : state === "now" ? "hozir o'qilmoqda" : "boshlanmagan";
        return (
          <li key={b.id} className={`segbar__seg segbar__seg--${state}`} title={`${b.position}. ${b.title} — ${label}`}>
            <span className="segbar__fill" />
            {!compact && <span className="segbar__n">{b.position}</span>}
            <span className="sr-only">{`${b.position}. ${b.title}: ${label}`}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function LearningProgressCard({ student }: { student: Student }) {
  const { groups, lessonsByStudent } = useData();
  const stages = useStages();
  const { status, books, bookById, progressByStudent, stintsByStudent, transfersByStudent, saveSettings } = stages;
  const [setting, setSetting] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const today = todayISO();

  const stints = stintsByStudent.get(student.id) ?? [];
  const progress = progressByStudent.get(student.id) ?? null;
  const lessons = lessonsByStudent.get(student.id) ?? [];
  const sum = useMemo(
    () => summarizeStudent({ stints, progress, books, lessons, today }),
    [stints, progress, books, lessons, today],
  );
  const groupName = (id: string | null) => groups.find((g) => g.id === id)?.name ?? "—";

  const [lpw, setLpw] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [goal, setGoal] = useState<string | null>(null);

  if (status === "loading") return <div className="skeleton" style={{ height: 140, marginBottom: 16 }} />;
  if (status === "error") {
    return (
      <section className="card card--pad" style={{ marginBottom: 16 }}>
        <h2 className="section-title" style={{ margin: 0 }}>Ta&apos;lim rivojlanishi</h2>
        <p className="hint" style={{ marginTop: 6 }}>
          Bosqichlar moduli hali bazada yoqilmagan (migratsiya qo&apos;llanmagan) yoki yuklanmadi.
        </p>
      </section>
    );
  }

  const { view, book } = sum;
  const ordered = sortBooks(books.filter((b) => b.active));
  const nextBook = book ? (ordered.find((b) => b.position > book.position) ?? null) : null;
  const activeStint = view.active;
  const transfers = transfersByStudent.get(student.id) ?? [];

  async function saveSet(e: FormEvent) {
    e.preventDefault();
    const n = lpw === null || lpw === "" ? null : Number(lpw);
    await saveSettings(student.id, {
      ...(lpw !== null ? { lessons_per_week: n } : {}),
      ...(note !== null ? { teacher_note: note } : {}),
      ...(goal !== null ? { next_goal: goal } : {}),
    });
    setLpw(null);
    setNote(null);
    setGoal(null);
  }

  return (
    <section className="card card--pad stack lp" aria-label="Ta'lim rivojlanishi" style={{ marginBottom: 16 }}>
      <div className="lp__head">
        <h2 className="section-title" style={{ margin: 0 }}>
          Ta&apos;lim rivojlanishi
        </h2>
        <div className="lp__tools">
          {view.state !== "done" && (
            <button className="btn btn--sm" onClick={() => setSetting(true)}>
              <IconStages aria-hidden /> {view.state === "unset" ? "Bosqichni belgilash" : "Tuzatish"}
            </button>
          )}
          {view.state === "active" && (
            <button className="btn btn--sm btn--primary" onClick={() => setFinishing(true)}>
              <IconFlag aria-hidden /> Kitobni tugatdi
            </button>
          )}
          <Link className="btn btn--sm" href={`/students/${student.id}/report`}>
            <IconPrint aria-hidden /> Ota-onalar hisoboti
          </Link>
        </div>
      </div>

      {books.length === 0 ? (
        <p className="hint">
          O&apos;quv dasturi hali to&apos;ldirilmagan. <Link href="/stages?tab=program">Bosqichlar → O&apos;quv dasturi</Link> bo&apos;limida 9 ta kitobni yarating.
        </p>
      ) : view.state === "unset" ? (
        <div className="empty" style={{ padding: "8px 0" }}>
          <strong>Daraja belgilanmagan · Kitob belgilanmagan</strong>
          <p>“Bosqichni belgilash” orqali hozirgi kitob, level va boshlagan sanani kiriting.</p>
        </div>
      ) : (
        <>
          <BookSegments books={books} completed={view.completedBookIds} activeId={view.state === "active" ? (book?.id ?? null) : null} />
          <dl className="lp__grid">
            <div><dt>Hozirgi level</dt><dd>{sum.level ?? "Belgilanmagan"}</dd></div>
            <div>
              <dt>Hozirgi kitob</dt>
              <dd>{view.state === "done" ? "Dastur yakunlangan" : book ? `${book.title} (${book.position}-kitob / ${books.length})` : "—"}</dd>
            </div>
            {activeStint && (
              <>
                <div><dt>Boshlagan sana</dt><dd>{formatDate(activeStint.started_on)}</dd></div>
                <div><dt>Shu kitobda</dt><dd>{durationText(activeStint.started_on, today)}</dd></div>
              </>
            )}
            <div>
              <dt>Tugatilgan kitoblar</dt>
              <dd>
                {view.completedBookIds.length
                  ? sortBooks(view.completedBookIds.map((id) => bookById.get(id)).filter((b): b is Book => Boolean(b)))
                      .map((b) => b.title)
                      .join(", ")
                  : "Hali yo'q"}
              </dd>
            </div>
            <div><dt>Keyingi kitob</dt><dd>{view.state === "done" ? "—" : nextBook ? `${nextBook.title}${nextBook.level ? ` · ${nextBook.level}` : ""}` : "Oxirgi kitob"}</dd></div>
          </dl>

          {sum.forecast && book && (
            <div className="lp__forecast">
              {sum.forecast.progress !== null && (
                <div>
                  <div className="lp__row">
                    <span>Tasdiqlangan darslar (qatnashilgan)</span>
                    <strong>{sum.attended} / {book.planned_lessons}</strong>
                  </div>
                  <Meter value={sum.attended} max={book.planned_lessons ?? 1} />
                </div>
              )}
              {sum.forecast.ok ? (
                <p className="lp__est">
                  <span className="chip chip--brand">Taxmin</span>
                  {sum.forecast.due
                    ? " Rejalashtirilgan muddat yakuniga yetdi — o'qituvchi baholashi kutilmoqda."
                    : ` Joriy kitob taxminan ${weeksText(sum.forecast.remainingWeeks ?? 0)}da tugaydi (≈ ${formatDate(sum.forecast.finishOn!)}).`}
                  <small>
                    {sum.forecast.basis === "lessons"
                      ? " Rejalashtirilgan darslar va haftalik darslar soni asosida."
                      : " Kitobning o'rtacha muddati asosida (individual dars rejasi kiritilmagan)."}
                  </small>
                </p>
              ) : (
                <p className="hint">{NO_DATA}. Kitobga muddat yoki rejalashtirilgan darslar sonini kiriting.</p>
              )}
              {sum.program?.ok && (sum.program.futureBooks ?? 0) > 0 && (
                <p className="hint">
                  Oxirgi kitobgacha taxminan {weeksText(sum.program.remainingWeeks ?? 0)} (≈ {formatDate(sum.program.finishOn!)}).
                </p>
              )}
            </div>
          )}
        </>
      )}

      {stints.length > 0 && (
        <div>
          <h3 className="lp__sub">Kitoblar tarixi</h3>
          <ul className="lp__hist">
            {[...stints].reverse().map((s) => (
              <li key={s.id}>
                <span>
                  <strong>{bookById.get(s.book_id)?.title ?? "Kitob"}</strong>
                  {s.level && <span className="chip" style={{ marginLeft: 6 }}>{s.level}</span>}
                  {s.outcome === "repeat" && <span className="chip chip--warn" style={{ marginLeft: 6 }}>qayta o&apos;qildi</span>}
                  {s.outcome === "program_done" && <span className="chip chip--ok" style={{ marginLeft: 6 }}>dastur yakunlandi</span>}
                </span>
                <span className="hint">
                  {formatDate(s.started_on)} – {s.finished_on ? `${formatDate(s.finished_on)} · ${durationText(s.started_on, s.finished_on)}` : "hozir"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {transfers.length > 0 && (
        <div>
          <h3 className="lp__sub"><IconTransfer aria-hidden /> Guruh tarixi</h3>
          <ul className="lp__hist">
            {[...transfers].reverse().map((t) => (
              <li key={t.id}>
                <span>{groupName(t.from_group_id)} → {groupName(t.to_group_id)}</span>
                <span className="hint">{formatDate(t.transferred_at.slice(0, 10))}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <details className="own-dates">
        <summary>Prognoz va hisobot sozlamalari</summary>
        <form className="stack" style={{ marginTop: 10 }} onSubmit={saveSet}>
          <label className="field">
            <span className="field__label">Haftalik darslar soni</span>
            <select className="select" value={lpw ?? String(progress?.lessons_per_week ?? "")} onChange={(e) => setLpw(e.target.value)}>
              <option value="">Kiritilmagan</option>
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">O&apos;qituvchi xulosasi (ota-onalar hisoboti uchun)</span>
            <textarea className="input" maxLength={1000} value={note ?? progress?.teacher_note ?? ""} onChange={(e) => setNote(e.target.value)} />
          </label>
          <label className="field">
            <span className="field__label">Keyingi o&apos;quv maqsadi</span>
            <input className="input" maxLength={300} value={goal ?? progress?.next_goal ?? ""} onChange={(e) => setGoal(e.target.value)} />
          </label>
          <div>
            <button className="btn btn--primary" type="submit" disabled={lpw === null && note === null && goal === null}>Saqlash</button>
          </div>
        </form>
      </details>

      <SetStageDialog open={setting} students={[student]} onClose={() => setSetting(false)} />
      <FinishBookDialog open={finishing} student={student} stint={activeStint} onClose={() => setFinishing(false)} />
    </section>
  );
}

