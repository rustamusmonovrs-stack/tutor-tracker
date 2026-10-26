"use client";

import { useEffect, useRef } from "react";
import { Avatar } from "@/components/Avatar";
import { StatusPicker } from "@/components/HomeworkParts";
import { IconClose, IconCoin } from "@/components/icons";
import { HOMEWORK_META } from "@/lib/config";
import { formatDay } from "@/lib/dates";
import { studentProgress, TASK_STATUS_LABEL } from "@/lib/homework";
import { useHomework } from "@/lib/homeworkData";
import type { Group, Homework, Student } from "@/lib/types";

/** Right-side panel (native dialog: focus trapped, Esc closes). Never changes page layout. */
export function HomeworkDrawer({
  student,
  group,
  date,
  legacy,
  onClose,
}: {
  student: Student | null;
  group: Group;
  date: string;
  /** Old-style single grade stored on the lesson (read-only here). */
  legacy: Homework | null;
  onClose: () => void;
}) {
  const hw = useHomework();
  const ref = useRef<HTMLDialogElement>(null);
  const open = student !== null;
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const tasks = hw.tasksFor(group.id, date);
  const ids = tasks.map((t) => t.id);
  const pr = student ? studentProgress(ids, student.id, hw.assignedSet, hw.assessMap) : null;

  return (
    <dialog
      ref={ref}
      className="drawer"
      aria-label="O'quvchi uy vazifalari"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      {student && pr && (
        <div className="drawer__panel">
          <header className="drawer__head">
            <Avatar name={student.name} />
            <div style={{ minWidth: 0 }}>
              <h2 className="drawer__name">{student.name}</h2>
              <p className="drawer__sub">
                {formatDay(date)} · {group.name}
              </p>
            </div>
            <button className="icon-btn icon-btn--bare" aria-label="Yopish" onClick={onClose}>
              <IconClose />
            </button>
          </header>

          <div className="drawer__sum">
            <div>
              <span className="drawer__big">
                {pr.full}/{pr.assigned}
              </span>
              <span className="hint"> bajarilgan</span>
            </div>
            <div className="drawer__counts">
              <span>Berilgan {pr.assigned}</span>
              <span>Baholanmagan {pr.ungraded}</span>
              <span>Chala {pr.partial}</span>
              <span>Qilmadi {pr.notDone}</span>
            </div>
            <span className="coins" title="Shu dars vazifalari uchun">
              <IconCoin aria-hidden />
              {pr.coins}
            </span>
          </div>

          {legacy && (
            <p className="drawer__legacy">
              Eski format bahosi: <b>{HOMEWORK_META[legacy].label}</b> (o&apos;zgartirilmaydi)
            </p>
          )}

          {tasks.length === 0 ? (
            <p className="hwt__empty">Bu kunga vazifa qo&apos;shilmagan.</p>
          ) : (
            <ul className="drawer__tasks">
              {tasks.map((t) => {
                const k = `${t.id}|${student.id}`;
                const assigned = hw.assignedSet.has(k);
                const a = hw.assessMap.get(k);
                const state = !assigned ? "Berilmagan" : a ? TASK_STATUS_LABEL[a.status] : "Baholanmagan";
                return (
                  <li key={t.id} className="drawer__task" data-state={!assigned ? "none" : (a?.status ?? "pending")}>
                    <div className="drawer__tt">
                      <span className="hwt__title">{t.title}</span>
                      <span className="drawer__state">
                        {state}
                        {a?.status === "full" && (
                          <span className="coins coins--sm">
                            <IconCoin aria-hidden />+1
                          </span>
                        )}
                      </span>
                    </div>
                    {assigned ? (
                      <div className="drawer__ctl">
                        <StatusPicker
                          value={a?.status ?? null}
                          label={`${t.title}: baho`}
                          onChange={(v) => void hw.grade(t.id, student.id, v)}
                        />
                        <button
                          className="btn btn--ghost btn--sm"
                          disabled={!!a}
                          title={a ? "Avval bahoni tozalang" : "Bu o'quvchidan vazifani olib tashlash"}
                          onClick={() => void hw.unassign(t.id, student.id)}
                        >
                          Olib tashlash
                        </button>
                      </div>
                    ) : (
                      <div className="drawer__ctl">
                        <button className="btn btn--sm" onClick={() => void hw.assign(t.id, [student.id])}>
                          Bu o&apos;quvchiga berish
                        </button>
                      </div>
                    )}
                    {a?.completed_late && <p className="drawer__note">Kechikib bajarilgan (avval: {a.original_status === "not_done" ? "Qilmadi" : "Chala"})</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </dialog>
  );
}
