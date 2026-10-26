"use client";

import { useEffect, useMemo, useState } from "react";
import { IconArchive, IconArrowDown, IconArrowUp, IconEdit, IconPlus, IconRestore, IconTrash } from "@/components/icons";
import { FormDialog } from "@/components/ui";
import { LEVELS, isLevel, weeksText, type Book, type Level, type Program } from "@/lib/stages";
import { useStages } from "@/lib/stagesData";

function intOrNull(v: string, max: number): number | null | undefined {
  if (v.trim() === "") return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 1 && n <= max ? n : undefined; // undefined = invalid
}

/** Books of one program in a compact table (cards on phones). Programs never mix. */
export function CurriculumManager() {
  const { programs, booksOf, tracksByStudent, bookInUse, saveBook, moveBook, archiveBook, deleteBook } = useStages();
  const [programId, setProgramId] = useState<string>("");
  const [showArchived, setShowArchived] = useState(false);
  const [dialog, setDialog] = useState<{ book: Book | null } | null>(null);

  useEffect(() => {
    if (!programId && programs.length) setProgramId(programs[0].id);
  }, [programId, programs]);

  const program = programs.find((p) => p.id === programId) ?? null;
  const all = useMemo(() => (program ? booksOf(program.id) : []), [program, booksOf]);
  const live = all.filter((b) => !b.archived_at);
  const archived = all.filter((b) => b.archived_at);
  const students = useMemo(() => {
    if (!program) return 0;
    let n = 0;
    for (const rows of tracksByStudent.values()) if (rows.some((r) => r.program_id === program.id)) n += 1;
    return n;
  }, [program, tracksByStudent]);

  if (!program) return <div className="skeleton" style={{ height: 160 }} />;

  const rows = showArchived ? [...live, ...archived] : live;

  return (
    <>
      <div className="curr-head">
        <div className="seg seg--wrap" role="tablist" aria-label="O'quv dasturi">
          {programs.map((p) => (
            <button key={p.id} className="seg__btn" role="tab" aria-selected={p.id === programId} onClick={() => setProgramId(p.id)}>
              {p.name}
            </button>
          ))}
        </div>
        <button className="btn btn--primary btn--sm" onClick={() => setDialog({ book: null })}>
          <IconPlus aria-hidden /> Kitob qo&apos;shish
        </button>
      </div>

      <p className="hint curr-meta">
        {live.length} ta kitob · {students} ta o&apos;quvchi biriktirilgan
        {archived.length > 0 && (
          <>
            {" · "}
            <button className="link-btn" onClick={() => setShowArchived((v) => !v)}>
              {showArchived ? "Arxivni yashirish" : `Arxiv (${archived.length})`}
            </button>
          </>
        )}
      </p>

      {rows.length === 0 ? (
        <div className="card empty">
          <strong>{program.name}: kitoblar hali qo&apos;shilmagan</strong>
          <p>Kitob nomlarini, levelini, muddatini va darslar sonini o&apos;zingiz kiritasiz.</p>
          <p style={{ marginTop: 14 }}>
            <button className="btn btn--primary" onClick={() => setDialog({ book: null })}>
              <IconPlus aria-hidden /> Birinchi kitobni qo&apos;shish
            </button>
          </p>
        </div>
      ) : (
        <div className="card ctable-wrap">
          <table className="ctable">
            <thead>
              <tr>
                <th className="ctable__n">№</th>
                <th>Kitob nomi</th>
                <th>Level</th>
                <th>Muddat</th>
                <th>Darslar soni</th>
                <th>Holat</th>
                <th className="ctable__tools">Amallar</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => {
                const idx = live.findIndex((x) => x.id === b.id);
                const used = bookInUse(b.id);
                return (
                  <tr key={b.id} className={b.archived_at ? "is-archived" : b.active ? undefined : "is-off"}>
                    <td className="ctable__n" data-label="№">{idx >= 0 ? idx + 1 : "—"}</td>
                    <td className="ctable__title" data-label="Kitob nomi">{b.title}</td>
                    <td data-label="Level">{b.level ? <span className="chip chip--brand">{b.level}</span> : <span className="hint">—</span>}</td>
                    <td data-label="Muddat">{b.avg_weeks ? weeksText(b.avg_weeks) : <span className="hint">—</span>}</td>
                    <td data-label="Darslar soni">{b.planned_lessons ?? <span className="hint">—</span>}</td>
                    <td data-label="Holat">
                      {b.archived_at ? (
                        <span className="chip">Arxiv</span>
                      ) : (
                        <button
                          className={`chip chip--toggle ${b.active ? "chip--ok" : ""}`}
                          aria-pressed={b.active}
                          title={b.active ? "Nofaol qilish" : "Faol qilish"}
                          onClick={() => void saveBook(b.id, { active: !b.active })}
                        >
                          {b.active ? "Faol" : "Nofaol"}
                        </button>
                      )}
                    </td>
                    <td className="ctable__tools">
                      {b.archived_at ? (
                        <button className="icon-btn icon-btn--bare" aria-label={`${b.title}: arxivdan qaytarish`} title="Arxivdan qaytarish" onClick={() => void archiveBook(b.id, false)}>
                          <IconRestore aria-hidden />
                        </button>
                      ) : (
                        <>
                          <button className="icon-btn icon-btn--bare" aria-label={`${b.title}: yuqoriga`} disabled={idx <= 0} onClick={() => void moveBook(b.id, -1)}>
                            <IconArrowUp aria-hidden />
                          </button>
                          <button className="icon-btn icon-btn--bare" aria-label={`${b.title}: pastga`} disabled={idx < 0 || idx === live.length - 1} onClick={() => void moveBook(b.id, 1)}>
                            <IconArrowDown aria-hidden />
                          </button>
                          <button className="icon-btn icon-btn--bare" aria-label={`${b.title}: tahrirlash`} title="Tahrirlash" onClick={() => setDialog({ book: b })}>
                            <IconEdit aria-hidden />
                          </button>
                          <button className="icon-btn icon-btn--bare" aria-label={`${b.title}: arxivlash`} title="Arxivlash (tarix saqlanadi)" onClick={() => void archiveBook(b.id, true)}>
                            <IconArchive aria-hidden />
                          </button>
                        </>
                      )}
                      <button
                        className="icon-btn icon-btn--bare"
                        style={used ? undefined : { color: "var(--bad)" }}
                        aria-label={`${b.title}: o'chirish`}
                        title={used ? "O'quvchilar tarixida ishlatilgan — o'chirib bo'lmaydi, arxivlang" : "O'chirish"}
                        disabled={used}
                        onClick={() => {
                          if (window.confirm(`“${b.title}” butunlay o‘chirilsinmi?`)) void deleteBook(b.id);
                        }}
                      >
                        <IconTrash aria-hidden />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="hint" style={{ marginTop: 10 }}>
        Muddat va darslar sonini o&apos;qituvchi kiritadi; kiritilmagan joylarda prognoz “ma&apos;lumot yetarli emas” deb ko&apos;rsatiladi. Tarixda ishlatilgan kitob o&apos;chirilmaydi — arxivlanadi.
      </p>

      <BookDialog key={dialog ? (dialog.book?.id ?? "new") : "closed"} open={dialog !== null} book={dialog?.book ?? null} program={program} programs={programs} onClose={() => setDialog(null)} />
    </>
  );
}

function BookDialog({ open, book, program, programs, onClose }: { open: boolean; book: Book | null; program: Program; programs: Program[]; onClose: () => void }) {
  const { addBook, saveBook } = useStages();
  const [programId, setProgramId] = useState(program.id);
  const [title, setTitle] = useState(book?.title ?? "");
  const [level, setLevel] = useState<Level | "">(book?.level ?? "");
  const [weeks, setWeeks] = useState(book?.avg_weeks?.toString() ?? "");
  const [lessons, setLessons] = useState(book?.planned_lessons?.toString() ?? "");
  const [active, setActive] = useState(book?.active ?? true);
  const [busy, setBusy] = useState(false);

  const w = intOrNull(weeks, 156);
  const l = intOrNull(lessons, 1000);
  const valid = title.trim().length > 0 && w !== undefined && l !== undefined;

  async function save() {
    if (!valid) return;
    setBusy(true);
    const lvl = isLevel(level) ? level : null;
    const ok = book
      ? await saveBook(book.id, { title, level: lvl, avg_weeks: w ?? null, planned_lessons: l ?? null, active })
      : await addBook(programId, { title, level: lvl, avg_weeks: w ?? null, planned_lessons: l ?? null, active });
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <FormDialog open={open} title={book ? "Kitobni tahrirlash" : "Yangi kitob"} submitLabel={book ? "Saqlash" : "Qo‘shish"} canSubmit={valid} busy={busy} onSubmit={() => void save()} onCancel={onClose}>
      <label className="field">
        <span className="field__label">Kitob nomi</span>
        <input className="input" value={title} maxLength={80} required autoFocus onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="field">
        <span className="field__label">O&apos;quv dasturi</span>
        <select className="select" value={programId} disabled={Boolean(book)} onChange={(e) => setProgramId(e.target.value)}>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field__label">Level</span>
        <select className="select" value={level} onChange={(e) => setLevel(e.target.value as Level | "")}>
          <option value="">Belgilanmagan</option>
          {LEVELS.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
      </label>
      <div className="curr-dialog__pair">
        <label className="field">
          <span className="field__label">O&apos;rtacha muddat (hafta)</span>
          <input className="input" inputMode="numeric" placeholder="—" value={weeks} onChange={(e) => setWeeks(e.target.value.replace(/\D/g, ""))} aria-invalid={w === undefined} />
        </label>
        <label className="field">
          <span className="field__label">Rejalashtirilgan darslar</span>
          <input className="input" inputMode="numeric" placeholder="—" value={lessons} onChange={(e) => setLessons(e.target.value.replace(/\D/g, ""))} aria-invalid={l === undefined} />
        </label>
      </div>
      {(w === undefined || l === undefined) && <p className="form-error">Muddat 1–156 hafta, darslar soni 1–1000 oralig‘ida butun son bo‘lishi kerak.</p>}
      <label className="check">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Faol (yangi joylashtirishda tanlash mumkin)
      </label>
    </FormDialog>
  );
}
