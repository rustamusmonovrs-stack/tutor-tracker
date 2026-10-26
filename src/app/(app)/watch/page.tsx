"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { IconClose, IconCoin, IconSearch, IconWatch } from "@/components/icons";
import { useData } from "@/lib/data";
import { formatShort } from "@/lib/dates";
import { TASK_STATUS_LABEL, type WatchCase } from "@/lib/homework";
import { useHomework } from "@/lib/homeworkData";

type View = "active" | "resolved";

function dateOf(ts: string): string {
  return ts.slice(0, 10);
}

export default function WatchPage() {
  const { students, groups } = useData();
  const hw = useHomework();
  const [view, setView] = useState<View>("active");
  const [groupId, setGroupId] = useState("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const studentById = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const taskById = useMemo(() => new Map(hw.tasks.map((t) => [t.id, t])), [hw.tasks]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return hw.cases
      .filter((c) => c.status === view)
      .filter((c) => {
        const s = studentById.get(c.student_id);
        if (!s) return false;
        if (view === "active" && (s.archived_at || groupById.get(s.group_id)?.archived_at)) return false;
        if (groupId !== "all" && s.group_id !== groupId) return false;
        return !q || s.name.toLowerCase().includes(q);
      })
      .map((c) => {
        const tasks = c.task_ids.map((id) => taskById.get(id)).filter((t) => !!t);
        const open = tasks.filter((t) => hw.assessMap.get(`${t.id}|${c.student_id}`)?.status !== "full");
        const lessons = new Set(tasks.map((t) => t.lesson_date)).size;
        return { c, student: studentById.get(c.student_id)!, tasks, open, lessons };
      })
      .sort((a, b) => (view === "active" ? (a.c.opened_at < b.c.opened_at ? 1 : -1) : (a.c.resolved_at ?? "") < (b.c.resolved_at ?? "") ? 1 : -1));
  }, [hw.cases, hw.assessMap, view, groupId, query, studentById, groupById, taskById]);

  const activeCount = hw.cases.filter((c) => c.status === "active" && studentById.get(c.student_id) && !studentById.get(c.student_id)!.archived_at).length;
  const selected: WatchCase | null = hw.cases.find((c) => c.id === openId) ?? null;
  const sel = selected ? rows.find((r) => r.c.id === selected.id) ?? null : null;

  const dlg = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dlg.current;
    if (!d) return;
    if (selected && !d.open) d.showModal();
    if (!selected && d.open) d.close();
  }, [selected]);

  async function done(taskId: string, studentId: string) {
    const k = `${taskId}|${studentId}`;
    if (busy === k) return;
    setBusy(k);
    await hw.grade(taskId, studentId, "full", true);
    setBusy(null);
  }

  async function saveNote() {
    if (!selected || !note.trim()) return;
    if (await hw.addNote(selected.student_id, note)) setNote("");
  }

  const selStudent = selected ? studentById.get(selected.student_id) : null;
  const selNotes = selected ? hw.notes.filter((n) => n.student_id === selected.student_id) : [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Nazorat ro&apos;yxati</h1>
          <p className="page-sub">
            Nazoratda: <b>{activeCount}</b> o&apos;quvchi · ketma-ket 2 ta darsda berilgan barcha vazifalar Qilmadi bo&apos;lganlar
          </p>
        </div>
      </div>

      {hw.status === "error" && (
        <div className="card card--pad stack" role="alert">
          <strong>Nazorat ma&apos;lumotlari yuklanmadi</strong>
          <p className="hint">{hw.error}</p>
          <div>
            <button className="btn btn--primary" onClick={() => void hw.reload()}>
              Qayta urinish
            </button>
          </div>
        </div>
      )}

      <div className="wl__toolbar">
        <div className="seg" role="group" aria-label="Holat">
          <button className="seg__btn" aria-pressed={view === "active"} onClick={() => setView("active")}>
            Aktiv
          </button>
          <button className="seg__btn" aria-pressed={view === "resolved"} onClick={() => setView("resolved")}>
            Hal qilingan
          </button>
        </div>
        <select className="select" aria-label="Guruh" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
          <option value="all">Barcha guruhlar</option>
          {groups
            .filter((g) => !g.archived_at)
            .map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
        </select>
        <label className="search" style={{ position: "relative" }}>
          <IconSearch aria-hidden style={{ position: "absolute", left: 10, top: 10, width: 16, height: 16, color: "var(--ink-3)" }} />
          <input className="input" style={{ paddingLeft: 32 }} placeholder="Ism bo'yicha qidirish" aria-label="Qidirish" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      </div>

      {hw.status === "loading" && <div className="skeleton" style={{ height: 160 }} aria-busy="true" />}

      {hw.status === "ready" && rows.length === 0 && (
        <div className="card empty">
          <IconWatch aria-hidden style={{ width: 28, height: 28, color: "var(--ink-3)" }} />
          <strong>{view === "active" ? "Hozircha nazoratda o'quvchi yo'q" : "Hal qilingan holatlar yo'q"}</strong>
          <p>
            {view === "active"
              ? "O'quvchi ketma-ket 2 ta darsda unga berilgan barcha vazifalarni bajarmasa (hammasi Qilmadi), shu yerda paydo bo'ladi."
              : "Nazoratdan chiqqan o'quvchilar tarixi shu yerda saqlanadi."}
          </p>
        </div>
      )}

      {hw.status === "ready" && rows.length > 0 && (
        <div className="card">
          <ul className="wl__list">
            {rows.map(({ c, student, tasks, open, lessons }) => (
              <li key={c.id}>
                <button className="wl__row" onClick={() => setOpenId(c.id)} aria-label={`${student.name}: batafsil`}>
                  <span className="wl__who">
                    <Avatar name={student.name} />
                    <span style={{ minWidth: 0 }}>
                      <span className="wl__name" style={{ display: "block" }}>
                        {student.name}
                      </span>
                      <span className="wl__sub">{groupById.get(student.group_id)?.name ?? "Guruh"}</span>
                    </span>
                  </span>
                  <span className="wl__stat">
                    <b>{lessons} dars</b>
                    <small>ketma-ket</small>
                  </span>
                  <span className="wl__stat">
                    <b>
                      {open.length}/{tasks.length}
                    </b>
                    <small>bajarilmagan vazifa</small>
                  </span>
                  <span className="wl__stat wl__hide-sm">
                    <b>{formatShort(dateOf(c.opened_at))}</b>
                    <small>{c.status === "active" ? `oxirgi: ${formatShort(c.last_activity_on)}` : `yopilgan: ${c.resolved_at ? formatShort(dateOf(c.resolved_at)) : "—"}`}</small>
                  </span>
                  <span className="chip chip--bad" style={c.status === "resolved" ? { background: "var(--ok-soft)", color: "var(--ok)" } : undefined}>
                    {c.status === "active" ? "Aktiv" : c.resolve_reason === "corrected" ? "Tuzatilgan" : "Hal qilingan"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <dialog
        ref={dlg}
        className="drawer"
        aria-label="Nazorat tafsilotlari"
        onCancel={(e) => {
          e.preventDefault();
          setOpenId(null);
        }}
        onClick={(e) => e.target === dlg.current && setOpenId(null)}
      >
        {sel && selStudent && selected && (
          <div className="drawer__panel">
            <header className="drawer__head">
              <Avatar name={selStudent.name} />
              <div style={{ minWidth: 0 }}>
                <h2 className="drawer__name">
                  <Link href={`/students/${selStudent.id}`} style={{ color: "inherit", textDecoration: "none" }}>
                    {selStudent.name}
                  </Link>
                </h2>
                <p className="drawer__sub">
                  {groupById.get(selStudent.group_id)?.name} · nazoratga olingan {formatShort(dateOf(selected.opened_at))}
                </p>
              </div>
              <button className="icon-btn icon-btn--bare" aria-label="Yopish" onClick={() => setOpenId(null)}>
                <IconClose />
              </button>
            </header>

            <p className="drawer__legacy">
              Sabab: ketma-ket <b>{sel.lessons}</b> ta darsda berilgan barcha vazifalar bajarilmagan (Qilmadi).
              {selected.status === "resolved" && ` Holat yopilgan: ${selected.resolved_at ? formatShort(dateOf(selected.resolved_at)) : ""}.`}
            </p>

            <ul className="wl__tasks">
              {[...sel.tasks]
                .sort((a, b) => (a.lesson_date < b.lesson_date ? -1 : 1))
                .map((t) => {
                  const a = hw.assessMap.get(`${t.id}|${selected.student_id}`);
                  const isDone = a?.status === "full";
                  return (
                    <li className="wl__task" key={t.id} data-done={isDone ? "1" : "0"}>
                      <div className="wl__tt">
                        <span>
                          <span className="hwt__title">{t.title}</span>
                          <span className="hwt__meta" style={{ display: "flex" }}>
                            <span>Dars: {formatShort(t.lesson_date)}</span>
                            {t.due_date && <span>Muddat: {formatShort(t.due_date)}</span>}
                          </span>
                        </span>
                        <span className="drawer__state">
                          {a ? TASK_STATUS_LABEL[a.status] : "Baholanmagan"}
                          {isDone && (
                            <span className="coins coins--sm">
                              <IconCoin aria-hidden />+1
                            </span>
                          )}
                        </span>
                      </div>
                      {isDone && a?.completed_late && (
                        <p className="drawer__note">
                          Kechikib bajarilgan{a.rewarded_on ? `: ${formatShort(a.rewarded_on)}` : ""} (avval: {a.original_status === "partial" ? "Chala" : "Qilmadi"})
                        </p>
                      )}
                      {!isDone && selected.status === "active" && (
                        <div>
                          <button className="btn btn--primary btn--sm" disabled={busy === `${t.id}|${selected.student_id}`} onClick={() => void done(t.id, selected.student_id)}>
                            Qildi
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
            </ul>

            <section className="stack" style={{ gap: 8 }}>
              <h3 style={{ margin: 0, fontSize: "var(--fs-md)" }}>O&apos;qituvchi izohlari</h3>
              {selNotes.length === 0 && <p className="hint">Hali izoh yo&apos;q.</p>}
              {selNotes.map((n) => (
                <div className="wl__note" key={n.id}>
                  <span>{n.body}</span>
                  <small>
                    {formatShort(dateOf(n.created_at))} {n.created_at.slice(11, 16)} · O&apos;qituvchi
                  </small>
                </div>
              ))}
              <textarea className="input" rows={2} maxLength={1000} placeholder="Izoh qo'shish (ota-onaga avtomatik yuborilmaydi)" aria-label="Izoh" value={note} onChange={(e) => setNote(e.target.value)} />
              <div>
                <button className="btn" disabled={!note.trim()} onClick={() => void saveNote()}>
                  Izohni saqlash
                </button>
              </div>
            </section>
          </div>
        )}
      </dialog>
    </>
  );
}
