"use client";

import { useMemo, useState, type FormEvent } from "react";
import { coinChip } from "@/components/HomeworkParts";
import { IconArchive, IconArrowDown, IconArrowUp, IconCheck, IconEdit, IconPlus, IconTask } from "@/components/icons";
import { ConfirmDialog } from "@/components/ui";
import { useData } from "@/lib/data";
import { formatShort } from "@/lib/dates";
import type { HwTask } from "@/lib/homework";
import { useHomework, type BulkResult } from "@/lib/homeworkData";
import type { Group, LessonPlan, Student } from "@/lib/types";

interface BulkAsk {
  task: HwTask | null; // null = every task of the day
  fresh: number; // ungraded -> To'liq
  replace: number; // existing Chala/Qilmadi that could be replaced
}

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
  const tasks = useMemo(() => hw.tasksFor(group.id, date), [hw, group.id, date]);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [all, setAll] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDue, setEditDue] = useState("");
  const [archiving, setArchiving] = useState<HwTask | null>(null);
  const [ask, setAsk] = useState<BulkAsk | null>(null);
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);

  const activeRoster = roster.length;
  const assignedCount = (t: HwTask) => roster.filter((s) => hw.assignedSet.has(`${t.id}|${s.id}`)).length;
  const gradedCount = (t: HwTask) => roster.filter((s) => hw.assessMap.has(`${t.id}|${s.id}`)).length;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || adding) return;
    setAdding(true);
    const t = await hw.addTask(group.id, date, title, due || null, all);
    setAdding(false);
    if (t) {
      setTitle("");
      setDue("");
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
    notify(n > 0 ? `${n} ta o'quvchiga berildi` : "Hamma o'quvchiga allaqachon berilgan");
  }

  async function openBulk(task: HwTask | null) {
    // dry runs only count; nothing is written until the teacher confirms
    const [a, b] = await Promise.all([hw.bulk(group.id, date, task?.id ?? null, false, true), hw.bulk(group.id, date, task?.id ?? null, true, true)]);
    if (!a || !b) return;
    const fresh = a.set;
    const rep = b.overwritten;
    if (fresh + rep === 0) {
      notify("Belgilanadigan o'quvchi yo'q (berilgan va baholanmagan vazifa topilmadi)");
      return;
    }
    setReplace(false);
    setAsk({ task, fresh, replace: rep });
  }

  async function confirmBulk() {
    if (!ask) return;
    setBusy(true);
    const res: BulkResult | null = await hw.bulk(group.id, date, ask.task?.id ?? null, replace, false);
    setBusy(false);
    setAsk(null);
    if (!res) return;
    const n = res.set + res.overwritten;
    notify(`${n} ta baho To'liq qilindi (+${n} tanga)`, {
      action: { label: "Bekor qilish", run: () => void hw.restore(res.previous) },
    });
  }

  return (
    <div className="hwt">
      <div className="hwt__head">
        <span className="plan__title">
          <IconTask aria-hidden /> Uyga vazifalar
        </span>
        {tasks.length > 1 && (
          <button className="btn btn--sm" onClick={() => void openBulk(null)} title="Berilgan barcha vazifalarni To'liq deb belgilash">
            <IconCheck aria-hidden /> Barcha vazifalar bajardi
          </button>
        )}
      </div>

      {legacyText && (
        <div className="hwt__legacy">
          <span className="chip">Eski format</span>
          <span>{legacyText}</span>
        </div>
      )}

      {tasks.length === 0 ? (
        <p className="hwt__empty">Bu dars uchun vazifa qo&apos;shilmagan.</p>
      ) : (
        <ol className="hwt__list">
          {tasks.map((t, i) => {
            const given = assignedCount(t);
            const graded = gradedCount(t);
            const editing = editId === t.id;
            return (
              <li className="hwt__row" key={t.id}>
                <span className="hwt__no" aria-hidden>
                  {i + 1}
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
                    <input className="input" type="date" value={editDue} min={date} aria-label="Muddat" onChange={(e) => setEditDue(e.target.value)} />
                    <button type="submit" className="btn btn--primary btn--sm" disabled={!editTitle.trim()}>
                      Saqlash
                    </button>
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditId(null)}>
                      Bekor
                    </button>
                  </form>
                ) : (
                  <>
                    <div className="hwt__main">
                      <span className="hwt__title">{t.title}</span>
                      <span className="hwt__meta">
                        {t.due_date && <span>Muddat: {formatShort(t.due_date)}</span>}
                        <span>
                          Berilgan {given}/{activeRoster}
                        </span>
                        {given > 0 && (
                          <span>
                            Baholangan {graded}/{given}
                          </span>
                        )}
                      </span>
                    </div>
                    {coinChip(1)}
                    <div className="hwt__acts">
                      <button className="btn btn--sm" onClick={() => void giveAll(t)} disabled={given >= activeRoster}>
                        Barchaga berish
                      </button>
                      <button className="btn btn--sm" onClick={() => void openBulk(t)} disabled={given === 0}>
                        Barchasi bajardi
                      </button>
                    </div>
                    <div className="hwt__tools">
                      <button className="icon-btn icon-btn--bare" aria-label="Yuqoriga" disabled={i === 0} onClick={() => void hw.moveTask(group.id, date, t.id, -1)}>
                        <IconArrowUp />
                      </button>
                      <button className="icon-btn icon-btn--bare" aria-label="Pastga" disabled={i === tasks.length - 1} onClick={() => void hw.moveTask(group.id, date, t.id, 1)}>
                        <IconArrowDown />
                      </button>
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

      <form className="hwt__add" onSubmit={submit}>
        <input
          className="input"
          value={title}
          maxLength={200}
          placeholder="Yangi vazifa, masalan: Round Up 2, 45-bet, 1–5-mashqlar"
          aria-label="Yangi vazifa nomi"
          onChange={(e) => setTitle(e.target.value)}
        />
        <input className="input hwt__due" type="date" value={due} min={date} aria-label="Muddat (ixtiyoriy)" title="Muddat (ixtiyoriy)" onChange={(e) => setDue(e.target.value)} />
        <label className="hwt__all">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Hammaga berish
        </label>
        <button type="submit" className="btn btn--primary" disabled={!title.trim() || adding}>
          <IconPlus aria-hidden /> Qo&apos;shish
        </button>
      </form>

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
        title={ask?.task ? "Barchasi bajardimi?" : "Barcha vazifalar bajardimi?"}
        confirmLabel={busy ? "Saqlanmoqda…" : "Tasdiqlash"}
        onCancel={() => setAsk(null)}
        onConfirm={() => void confirmBulk()}
      >
        <span className="stack" style={{ gap: 8 }}>
          <span>
            {ask?.task ? `“${ask.task.title}”` : `${formatShort(date)} · ${group.name}`}: berilgan va baholanmagan <b>{ask?.fresh ?? 0}</b> ta o&apos;quvchi To&apos;liq
            deb belgilanadi (+{ask?.fresh ?? 0} tanga). Berilmagan o&apos;quvchilarga tegilmaydi.
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
    </div>
  );
}
