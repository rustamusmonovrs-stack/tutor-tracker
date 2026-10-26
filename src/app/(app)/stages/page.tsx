"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { CurriculumManager } from "@/components/CurriculumManager";
import { BookSegments } from "@/components/LearningProgressCard";
import { SetStageDialog } from "@/components/StageDialogs";
import { IconChevronRight, IconSearch, IconStages } from "@/components/icons";
import { Kpi } from "@/components/ui";
import { useData } from "@/lib/data";
import { formatDate, todayISO } from "@/lib/dates";
import { NO_DATA, lessonsForProgress, summarizeStudent, weeksText } from "@/lib/stages";
import { useStages } from "@/lib/stagesData";

type Tab = "students" | "program";
type Filter = "all" | "unset" | "set" | "ready";

export default function StagesPage() {
  const { status, error, reload } = useStages();
  const [tab, setTab] = useState<Tab>("students");

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "program") setTab("program");
  }, []);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Bosqichlar</h1>
          <p className="page-sub">O&apos;quvchilarning kitob va level bo&apos;yicha rivojlanishi</p>
        </div>
        <div className="seg" role="tablist" aria-label="Bo'limlar">
          <button className="seg__btn" role="tab" aria-selected={tab === "students"} onClick={() => setTab("students")}>
            O&apos;quvchilar
          </button>
          <button className="seg__btn" role="tab" aria-selected={tab === "program"} onClick={() => setTab("program")}>
            O&apos;quv dasturi
          </button>
        </div>
      </div>

      {status === "loading" && <div className="skeleton" style={{ height: 220 }} />}
      {status === "error" && (
        <div className="card card--pad stack" role="alert">
          <strong>Bosqichlar ma&apos;lumotlari yuklanmadi</strong>
          <p className="hint">
            {error}. Agar jadval topilmadi degan xabar bo&apos;lsa, <code>20261026_stages.sql</code> migratsiyasi hali qo&apos;llanmagan.
          </p>
          <div>
            <button className="btn btn--primary" onClick={() => void reload()}>
              Qayta urinish
            </button>
          </div>
        </div>
      )}
      {status === "ready" && (tab === "students" ? <StudentsTab onProgram={() => setTab("program")} /> : <CurriculumManager />)}
    </>
  );
}

// ------------------------------------------------------------------ students

function StudentsTab({ onProgram }: { onProgram: () => void }) {
  const { activeGroups, activeStudents, lessonsByStudent } = useData();
  const { books, progressByStudent, scopesOf, plans } = useStages();
  const [group, setGroup] = useState("all");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const today = todayISO();

  const rows = useMemo(
    () =>
      activeStudents.map((student) => {
        const scopes = scopesOf(student.id);
        const primary = scopes[0] ?? null;
        const extra = scopes[1] ?? null;
        return {
          student,
          primary,
          extra,
          sum: summarizeStudent({
            stints: primary?.stints ?? [],
            progress: progressByStudent.get(student.id) ?? null,
            books: primary?.books ?? [],
            // a Saturday set to mock / mini-test / no class never counts as a book lesson
            lessons: lessonsForProgress(lessonsByStudent.get(student.id) ?? [], plans, { studentId: student.id, groupId: student.group_id, programId: primary?.program.id ?? null }),
            today,
          }),
        };
      }),
    [activeStudents, scopesOf, progressByStudent, lessonsByStudent, plans, today],
  );

  const total = rows.length;
  const unset = rows.filter((r) => r.sum.view.state === "unset").length;
  const set = total - unset;
  const ready = rows.filter((r) => r.sum.ready).length;

  const needle = query.trim().toLowerCase();
  const visible = rows
    .filter((r) => group === "all" || r.student.group_id === group)
    .filter((r) => !needle || r.student.name.toLowerCase().includes(needle))
    .filter((r) => (filter === "unset" ? r.sum.view.state === "unset" : filter === "set" ? r.sum.view.state !== "unset" : filter === "ready" ? r.sum.ready : true))
    .sort((a, b) => a.student.name.localeCompare(b.student.name));

  const groupName = (id: string) => activeGroups.find((g) => g.id === id)?.name ?? "";
  const allPicked = visible.length > 0 && visible.every((r) => picked.includes(r.student.id));
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const pickedStudents = activeStudents.filter((s) => picked.includes(s.id));

  if (!total) {
    return (
      <div className="card empty">
        <strong>Hali o&apos;quvchi yo&apos;q</strong>
        <p>Avval O&apos;quvchilar sahifasida guruh va o&apos;quvchi qo&apos;shing.</p>
      </div>
    );
  }

  return (
    <>
      <div className="kpis">
        <Kpi label="Jami o'quvchilar" value={total} />
        <Kpi label="Bosqichi belgilanmagan" value={unset} note={unset ? "Daraja va kitob kiritilmagan" : undefined} />
        <Kpi label="Bosqichi belgilangan" value={set} />
        <Kpi label="Keyingi bosqichga tavsiya" value={ready} note="Rejalashtirilgan muddat tugagan" />
      </div>

      {books.length === 0 && (
        <p className="callout" style={{ background: "var(--warn-soft)", color: "var(--warn)" }}>
          O&apos;quv dasturi to&apos;ldirilmagan.{" "}
          <button className="btn btn--sm" onClick={onProgram}>
            Kitoblarni sozlash
          </button>
        </p>
      )}

      <div className="toolbar">
        <label className="search">
          <IconSearch aria-hidden />
          <input className="input" type="search" placeholder="Ism bo'yicha qidirish" aria-label="O'quvchini qidirish" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="seg" role="group" aria-label="Guruh">
          <button className="seg__btn" aria-pressed={group === "all"} onClick={() => setGroup("all")}>Hammasi</button>
          {activeGroups.map((g) => (
            <button key={g.id} className="seg__btn" aria-pressed={group === g.id} onClick={() => setGroup(g.id)}>
              {g.name}
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="Holat">
          {(
            [
              ["all", "Barchasi"],
              ["unset", "Belgilanmagan"],
              ["set", "Belgilangan"],
              ["ready", "Tavsiya"],
            ] as [Filter, string][]
          ).map(([id, label]) => (
            <button key={id} className="seg__btn" aria-pressed={filter === id} onClick={() => setFilter(id)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="bulkbar" role="region" aria-label="Ommaviy amal">
        <label className="check">
          <input
            type="checkbox"
            checked={allPicked}
            onChange={() => setPicked(allPicked ? picked.filter((id) => !visible.some((r) => r.student.id === id)) : [...new Set([...picked, ...visible.map((r) => r.student.id)])])}
          />
          Ko&apos;rinayotganlarni tanlash
        </label>
        <button className="btn btn--primary btn--sm" disabled={picked.length === 0 || books.length === 0} onClick={() => setOpen(true)}>
          <IconStages aria-hidden /> Bosqichni belgilash{picked.length ? ` (${picked.length})` : ""}
        </button>
      </div>

      <div className="card">
        {visible.length === 0 ? (
          <p className="empty">Hech kim topilmadi.</p>
        ) : (
          visible.map(({ student, sum, primary, extra }) => (
            <div key={student.id} className="stage-row">
              <input type="checkbox" aria-label={`${student.name} ni tanlash`} checked={picked.includes(student.id)} onChange={() => toggle(student.id)} />
              <Link href={`/students/${student.id}`} className="stage-row__link">
                <span className="row__who">
                  <Avatar name={student.name} />
                  <span style={{ minWidth: 0 }}>
                    <span className="row__main">{student.name}</span>
                    <span className="row__sub">
                      {groupName(student.group_id)}
                      {primary ? ` · ${primary.program.name}` : ""}
                      {extra ? ` + ${extra.program.name}` : ""}
                    </span>
                  </span>
                </span>
                <span className="stage-row__stage">
                  {sum.view.state === "unset" ? (
                    <span className="chip">Daraja belgilanmagan · Kitob belgilanmagan</span>
                  ) : (
                    <>
                      <span className="stage-row__book">
                        {sum.view.state === "done" ? "Dastur yakunlangan" : sum.book ? `${sum.book.position}. ${sum.book.title}` : "—"}
                        {sum.level && <span className="chip chip--brand">{sum.level}</span>}
                        {sum.ready && <span className="chip chip--ok">Tavsiya</span>}
                      </span>
                      <BookSegments compact books={primary?.books.filter((b) => !b.archived_at) ?? []} completed={sum.view.completedBookIds} activeId={sum.book?.id ?? null} />
                      <span className="row__sub">
                        {sum.view.active ? `Boshlagan: ${formatDate(sum.view.active.started_on)}` : ""}
                        {sum.forecast?.ok && sum.forecast.finishOn
                          ? ` · taxmin: ${sum.forecast.due ? "muddat tugagan" : `≈ ${weeksText(sum.forecast.remainingWeeks ?? 0)}`}`
                          : sum.view.active
                            ? ` · ${NO_DATA}`
                            : ""}
                      </span>
                    </>
                  )}
                </span>
                <IconChevronRight aria-hidden className="stage-row__go" />
              </Link>
            </div>
          ))
        )}
      </div>

      <SetStageDialog
        open={open}
        students={pickedStudents}
        onClose={(saved) => {
          setOpen(false);
          if (saved) setPicked([]);
        }}
      />
    </>
  );
}
