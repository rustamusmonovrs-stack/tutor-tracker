"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Avatar } from "@/components/Avatar";
import { StatusPicker, coinChip } from "@/components/HomeworkParts";
import {
  IconArchive,
  IconArrowDown,
  IconArrowUp,
  IconCheck,
  IconChevronDown,
  IconClose,
  IconDue,
  IconEdit,
  IconHwFull,
  IconHwPartial,
  IconPending,
  IconPlus,
  IconTask,
} from "@/components/icons";
import { ConfirmDialog } from "@/components/ui";
import { useData } from "@/lib/data";
import { addDays, formatShort } from "@/lib/dates";
import { TASK_STATUS_LABEL, earlierOpenTasks, lessonCheckTasks, taskCounts, type HwTask } from "@/lib/homework";
import { useHomework, type BulkResult } from "@/lib/homeworkData";
import type { Group, LessonPlan, Student } from "@/lib/types";

interface BulkAsk {
  tasks: HwTask[]; // every task the confirmation covers
  fresh: number; // ungraded -> To'liq
  replace: number; // existing Chala/Qilmadi that could be replaced
  single: boolean;
}

/**
 * "Berilgan vazifalar": the tasks checked in the selected lesson. That is every task entered at this lesson plus any
 * earlier-given task whose stored checking date (due_date) is this lesson. Earlier open tasks can be pulled into this
 * lesson explicitly; nothing is reassigned, duplicated or re-scored.
 */
export function HomeworkTasks({
  group,
  date,
  roster,
  legacyText,
}: {
  group: Group;
  date: string;
  roster: Student[];
  legacyText: LessonPlan["homework"];
}) {
  const hw = useHomework();
  const { notify } = useData();
  const ids = useMemo(() => roster.map((s) => s.id), [roster]);
  const tasks = useMemo(() => lessonCheckTasks(hw.tasks, group.id, date), [hw.tasks, group.id, date]);
  const earlier = useMemo(
    () => earlierOpenTasks(hw.tasks, group.id, date, ids, hw.assignedSet, hw.assessMap),
    [hw.tasks, group.id, date, ids, hw.assignedSet, hw.assessMap],
  );
  const ownTasks = useMemo(() => tasks.filter((t) => t.lesson_date === date), [tasks, date]);

  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [previous, setPrevious] = useState(false);
  const [givenOn, setGivenOn] = useState("");
  const [all, setAll] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDue, setEditDue] = useState("");
  const [archiving, setArchiving] = useState<HwTask | null>(null);
  const [pulling, setPulling] = useState<HwTask | null>(null);
  const [detail, setDetail] = useState<HwTask | null>(null);
  const [showEarlier, setShowEarlier] = useState(false);
  // Panel open/closed: view state only. Collapsing hides the body (nothing unmounts, nothing is saved or removed).
  const [open, setOpen] = useState(false);
  const [ask, setAsk] = useState<BulkAsk | null>(null);
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);

  const total = roster.length;
  const yesterday = addDays(date, -1);
  const canAdd = title.trim().length > 0 && !adding && (!previous || (givenOn !== "" && givenOn <= yesterday));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canAdd) return;
    setAdding(true);
    // Previously given task: it keeps its real given date and is checked in this lesson (due date = this lesson).
    const t = previous
      ? await hw.addTask(group.id, givenOn, title, date, all)
      : await hw.addTask(group.id, date, title, due || null, all);
    setAdding(false);
    if (t) {
      setTitle("");
      setDue("");
      setGivenOn("");
      setPrevious(false);
    }
  }

  function startEdit(t: HwTask) {
    setEditId(t.id);
    setEditTitle(t.title);
    setEditDue(t.due_date ?? "");
  }

  async function saveEdit(t: HwTask) {
    const ok = await hw.updateTask(t.id, { title: editTitle, due_date: editDue || null });
    if (ok) setEditId(null);
  }

  async function giveAll(t: HwTask) {
    const n = await hw.assign(t.id, null);
    if (n === null) return;
    notify(n > 0 ? `${n} ta o'quvchiga biriktirildi` : "Hamma o'quvchiga allaqachon biriktirilgan");
  }

  async function pull(t: HwTask) {
    const ok = await hw.updateTask(t.id, { due_date: date });
    setPulling(null);
    if (ok) notify(`“${t.title}” shu darsda tekshiriladi`);
  }

  // A task is always graded under its own lesson date (the RPC selects by task + date), so each task is its own call.
  async function bulkOf(list: HwTask[], overwrite: boolean, dry: boolean): Promise<BulkResult | null> {
    const sum: BulkResult = { set: 0, overwritten: 0, kept: 0, previous: [], dry };
    for (const t of list) {
      const r = await hw.bulk(group.id, t.lesson_date, t.id, overwrite, dry);
      if (!r) return null;
      sum.set += r.set;
      sum.overwritten += r.overwritten;
      sum.kept += r.kept;
      sum.previous.push(...r.previous);
    }
    return sum;
  }

  async function openBulk(list: HwTask[], single: boolean) {
    // dry runs only count; nothing is written until the teacher confirms
    const [a, b] = await Promise.all([bulkOf(list, false, true), bulkOf(list, true, true)]);
    if (!a || !b) return;
    if (a.set + b.overwritten === 0) {
      notify("Belgilanadigan o'quvchi yo'q (biriktirilgan va baholanmagan vazifa topilmadi)");
      return;
    }
    setReplace(false);
    setAsk({ tasks: list, fresh: a.set, replace: b.overwritten, single });
  }

  async function confirmBulk() {
    if (!ask || busy) return;
    setBusy(true);
    const res = await bulkOf(ask.tasks, replace, false);
    setBusy(false);
    setAsk(null);
    if (!res) return;
    const n = res.set + res.overwritten;
    notify(`${n} ta baho To'liq qilindi (+${n} tanga)`, {
      action: { label: "Bekor qilish", run: () => void hw.restore(res.previous) },
    });
  }

  return (
    <section className="hwt" data-open={open} aria-label="Berilgan vazifalar">
      <div className="hwt__head">
        <button type="button" className="hwt__toggle" aria-expanded={open} aria-controls={`hwt-body-${group.id}`} onClick={() => setOpen((v) => !v)}>
          <IconChevronDown aria-hidden className="hwt__chev" />
          <span className="plan__title">
            <IconTask aria-hidden /> Berilgan vazifalar
          </span>
          <span className="chip chip--brand" aria-live="polite">
            {tasks.length} ta vazifa
          </span>
        </button>
        <span className="hwt__headr">
          {open && tasks.length > 1 && (
            <button className="btn btn--sm" onClick={() => void openBulk(tasks, false)} title="Biriktirilgan barcha vazifalarni To'liq deb belgilash">
              <IconCheck aria-hidden /> Barchasi bajardi
            </button>
          )}
        </span>
      </div>

      <div className="hwt__body" id={`hwt-body-${group.id}`} hidden={!open}>

      {legacyText && (
        <div className="hwt__legacy">
          <span className="chip">Eski format</span>
          <span>{legacyText}</span>
        </div>
      )}

      {tasks.length === 0 ? (
        <p className="hwt__empty">Bu dars uchun vazifa yo&apos;q. Yangi vazifa qo&apos;shing yoki oldingi vazifani tekshirishga tanlang.</p>
      ) : (
        <ol className="hwt__list">
          {tasks.map((t) => {
            const c = taskCounts(t.id, ids, hw.assignedSet, hw.assessMap);
            const editing = editId === t.id;
            const own = t.lesson_date === date;
            const ownIdx = ownTasks.findIndex((x) => x.id === t.id);
            const state = c.assigned === 0 ? "none" : c.pending === 0 ? "done" : c.graded === 0 ? "pending" : "part";
            const StateIcon = state === "done" ? IconHwFull : state === "part" ? IconHwPartial : IconPending;
            const stateText = state === "none" ? "Biriktirilmagan" : state === "done" ? "Hammasi tekshirildi" : state === "part" ? "Qisman tekshirilgan" : "Tekshirilmagan";
            return (
              <li className="tk" data-state={state} key={t.id}>
                <span className="tk__icon" role="img" aria-label={stateText} title={stateText}>
                  <StateIcon aria-hidden />
                </span>
                {editing ? (
                  <form
                    className="hwt__edit"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void saveEdit(t);
                    }}
                  >
                    <input className="input" value={editTitle} maxLength={200} aria-label="Vazifa nomi" onChange={(e) => setEditTitle(e.target.value)} autoFocus />
                    <input className="input" type="date" value={editDue} min={t.lesson_date} aria-label="Tekshiruv muddati" onChange={(e) => setEditDue(e.target.value)} />
                    <button type="submit" className="btn btn--primary btn--sm" disabled={!editTitle.trim()}>
                      Saqlash
                    </button>
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditId(null)}>
                      Bekor
                    </button>
                  </form>
                ) : (
                  <>
                    <div className="tk__main">
                      <span className="tk__title">
                        {t.title}
                        {!own && <span className="chip chip--warn">Oldingi darsdan</span>}
                      </span>
                      <span className="tk__dates">
                        <span>Berilgan: {formatShort(t.lesson_date)}</span>
                        {t.due_date && (
                          <span>
                            <IconDue aria-hidden /> Tekshiruv muddati: {formatShort(t.due_date)}
                          </span>
                        )}
                      </span>
                      <span className="tk__counts">
                        {c.assigned === 0 ? (
                          <span>Biriktirilmagan</span>
                        ) : (
                          <>
                            <span>
                              Tekshirildi <b>{c.graded}/{c.assigned}</b>
                            </span>
                            {c.pending > 0 && <span>Kutilmoqda <b>{c.pending}</b></span>}
                          </>
                        )}
                        <span>
                          Biriktirilgan {c.assigned}/{total}
                        </span>
                      </span>
                    </div>
                    <span className="tk__coin">{coinChip(1)}</span>
                    <div className="tk__acts">
                      <button className="btn btn--sm" onClick={() => setDetail(t)} aria-label={`${t.title}: tafsilotlarni ochish`}>
                        Ochish
                      </button>
                      <button className="btn btn--sm" onClick={() => void giveAll(t)} disabled={c.assigned >= total}>
                        Hammaga biriktirish
                      </button>
                      <button className="btn btn--sm" onClick={() => void openBulk([t], true)} disabled={c.assigned === 0}>
                        Barchasi bajardi
                      </button>
                    </div>
                    <div className="hwt__tools">
                      {own && (
                        <>
                          <button className="icon-btn icon-btn--bare" aria-label="Yuqoriga" disabled={ownIdx <= 0} onClick={() => void hw.moveTask(group.id, date, t.id, -1)}>
                            <IconArrowUp />
                          </button>
                          <button className="icon-btn icon-btn--bare" aria-label="Pastga" disabled={ownIdx === ownTasks.length - 1} onClick={() => void hw.moveTask(group.id, date, t.id, 1)}>
                            <IconArrowDown />
                          </button>
                        </>
                      )}
                      <button className="icon-btn icon-btn--bare" aria-label="Tahrirlash" onClick={() => startEdit(t)}>
                        <IconEdit />
                      </button>
                      <button className="icon-btn icon-btn--bare" aria-label="Arxivlash" onClick={() => setArchiving(t)}>
                        <IconArchive />
                      </button>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {earlier.length > 0 && (
        <div className="hwt__earlier">
          <button type="button" className="hwt__earlier-toggle" aria-expanded={showEarlier} onClick={() => setShowEarlier((v) => !v)}>
            <IconChevronDown aria-hidden className={showEarlier ? undefined : "is-closed"} />
            Oldingi darslardan baholanmagan vazifalar <span className="chip">{earlier.length}</span>
          </button>
          {showEarlier && (
            <ul className="hwt__earlier-list">
              {earlier.slice(0, 8).map((t) => {
                const c = taskCounts(t.id, ids, hw.assignedSet, hw.assessMap);
                return (
                  <li key={t.id}>
                    <span className="hwt__earlier-main">
                      <b>{t.title}</b>
                      <small>
                        Berilgan: {formatShort(t.lesson_date)}
                        {t.due_date && ` · Muddat: ${formatShort(t.due_date)}`} · Kutilmoqda {c.pending}/{c.assigned}
                      </small>
                    </span>
                    <button className="btn btn--sm" onClick={() => setPulling(t)}>
                      Shu darsda tekshirish
                    </button>
                  </li>
                );
              })}
              {earlier.length > 8 && <li className="hint">Yana {earlier.length - 8} ta vazifa bor (eng yangi 8 tasi ko&apos;rsatilgan).</li>}
            </ul>
          )}
        </div>
      )}

      <form className="hwt__add" onSubmit={submit}>
        <input
          className="input hwt__add-title"
          value={title}
          maxLength={200}
          placeholder="Vazifa nomi, masalan: Round Up 2, 45-bet, 1–5-mashqlar"
          aria-label="Vazifa nomi"
          onChange={(e) => setTitle(e.target.value)}
        />
        {previous ? (
          <label className="hwt__date">
            <span>Berilgan sana</span>
            <input className="input" type="date" value={givenOn} max={yesterday} required aria-label="Vazifa berilgan sana" onChange={(e) => setGivenOn(e.target.value)} />
          </label>
        ) : (
          <label className="hwt__date">
            <span>Tekshiruv muddati</span>
            <input className="input" type="date" value={due} min={date} aria-label="Tekshiruv muddati (ixtiyoriy)" title="Ixtiyoriy" onChange={(e) => setDue(e.target.value)} />
          </label>
        )}
        <div className="hwt__opts">
          <label className="hwt__all">
            <input type="checkbox" checked={previous} onChange={(e) => setPrevious(e.target.checked)} /> Oldin berilgan vazifa
          </label>
          <label className="hwt__all">
            <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Hammaga biriktirish
          </label>
        </div>
        <button type="submit" className="btn btn--primary" disabled={!canAdd}>
          <IconPlus aria-hidden /> Vazifa qo&apos;shish
        </button>
        {previous && (
          <p className="hwt__note">
            Vazifa <b>{givenOn ? formatShort(givenOn) : "…"}</b> da berilgan sifatida saqlanadi va <b>{formatShort(date)}</b> darsida tekshiriladi. Tangalar vazifa berilgan sanaga yoziladi (mavjud qoida).
          </p>
        )}
      </form>
      </div>

      <TaskDetail task={detail} roster={roster} onClose={() => setDetail(null)} />

      <ConfirmDialog
        open={pulling !== null}
        title="Shu darsda tekshiriladimi?"
        confirmLabel="Tasdiqlash"
        onCancel={() => setPulling(null)}
        onConfirm={() => pulling && void pull(pulling)}
      >
        “{pulling?.title}” vazifasining tekshiruv muddati{" "}
        {pulling?.due_date ? <b>{formatShort(pulling.due_date)}</b> : <b>belgilanmagan</b>} dan <b>{formatShort(date)}</b> ga o&apos;zgaradi. Biriktirishlar, baholar va tangalar o&apos;zgarmaydi.
      </ConfirmDialog>

      <ConfirmDialog
        open={archiving !== null}
        title="Vazifa arxivlansinmi?"
        confirmLabel="Arxivlash"
        onCancel={() => setArchiving(null)}
        onConfirm={() => {
          if (archiving) void hw.archiveTask(archiving.id);
          setArchiving(null);
        }}
      >
        “{archiving?.title}” ro&apos;yxatdan olinadi. Qo&apos;yilgan baholar va tangalar saqlanib qoladi.
      </ConfirmDialog>

      <ConfirmDialog
        open={ask !== null}
        title={ask?.single ? "Barchasi bajardimi?" : "Barcha vazifalar bajardimi?"}
        confirmLabel={busy ? "Saqlanmoqda…" : "Tasdiqlash"}
        onCancel={() => setAsk(null)}
        onConfirm={() => void confirmBulk()}
      >
        <span className="stack" style={{ gap: 8 }}>
          <span>
            {ask?.single ? `“${ask.tasks[0].title}”` : `${formatShort(date)} · ${group.name}`}: biriktirilgan va baholanmagan <b>{ask?.fresh ?? 0}</b> ta o&apos;quvchi To&apos;liq
            deb belgilanadi (+{ask?.fresh ?? 0} tanga). Biriktirilmagan o&apos;quvchilarga tegilmaydi.
          </span>
          {ask && ask.replace > 0 && (
            <label className="hwt__all" style={{ alignItems: "flex-start" }}>
              <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
              <span>
                Mavjud Chala/Qilmadi baholarni ham almashtirish (<b>{ask.replace}</b> ta). Aks holda ular o&apos;zgarmaydi.
              </span>
            </label>
          )}
        </span>
      </ConfirmDialog>
    </section>
  );
}

/** One task, every student: grade each assigned student or assign the ones it was not given to. Same actions as the drawer. */
function TaskDetail({ task, roster, onClose }: { task: HwTask | null; roster: Student[]; onClose: () => void }) {
  const hw = useHomework();
  const ref = useRef<HTMLDialogElement>(null);
  const open = task !== null;
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const ids = roster.map((s) => s.id);
  const c = task ? taskCounts(task.id, ids, hw.assignedSet, hw.assessMap) : null;

  return (
    <dialog
      ref={ref}
      className="dialog dialog--wide tdlg"
      aria-label="Vazifa tafsilotlari"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      {task && c && (
        <>
          <div className="dialog__body stack" style={{ gap: 10 }}>
            <div className="tdlg__head">
              <div style={{ minWidth: 0 }}>
                <h2 className="tdlg__title">{task.title}</h2>
                <p className="hint">
                  Berilgan: {formatShort(task.lesson_date)}
                  {task.due_date && ` · Tekshiruv muddati: ${formatShort(task.due_date)}`}
                </p>
              </div>
              <button className="icon-btn icon-btn--bare" aria-label="Yopish" onClick={onClose}>
                <IconClose />
              </button>
            </div>
            <p className="tdlg__sum">
              Tekshirildi <b>{c.graded}/{c.assigned}</b> · Kutilmoqda <b>{c.pending}</b> · Biriktirilgan {c.assigned}/{roster.length}
            </p>
            <ul className="tdlg__list">
              {roster.map((s) => {
                const k = `${task.id}|${s.id}`;
                const assigned = hw.assignedSet.has(k);
                const a = hw.assessMap.get(k);
                return (
                  <li className="tdlg__row" key={s.id} data-state={!assigned ? "none" : (a?.status ?? "pending")}>
                    <span className="tdlg__who">
                      <Avatar name={s.name} />
                      <span className="tdlg__name">{s.name}</span>
                    </span>
                    {assigned ? (
                      <>
                        <span className="tdlg__state">{a ? TASK_STATUS_LABEL[a.status] : "Baholanmagan"}</span>
                        <StatusPicker value={a?.status ?? null} label={`${s.name}: ${task.title}`} onChange={(v) => void hw.grade(task.id, s.id, v)} />
                      </>
                    ) : (
                      <>
                        <span className="tdlg__state">Biriktirilmagan</span>
                        <button className="btn btn--sm" onClick={() => void hw.assign(task.id, [s.id])}>
                          Biriktirish
                        </button>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="dialog__foot">
            <button type="button" className="btn btn--primary" onClick={onClose}>
              Yopish
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}
