"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { Avatar } from "@/components/Avatar";
import {
  IconArchive,
  IconChevronDown,
  IconChevronRight,
  IconCoin,
  IconEdit,
  IconLogout,
  IconPlus,
  IconRestore,
  IconSearch,
  IconTrash,
} from "@/components/icons";
import { ConfirmDialog } from "@/components/ui";
import { useData } from "@/lib/data";
import { todayISO } from "@/lib/dates";
import { LEVELS, isLevel, isSelectable, sortBooks, type Level } from "@/lib/stages";
import { useStages } from "@/lib/stagesData";
import { currentTopic } from "@/lib/progress";
import { scoreLessons } from "@/lib/scoring";
import { getSupabase } from "@/lib/supabase/client";
import type { Group, Student } from "@/lib/types";

type Sort = "name" | "coins";

export default function StudentsPage() {
  const { groups, students, topicsByStudent, lessonsByStudent, addGroup } = useData();
  const router = useRouter();
  const [newGroup, setNewGroup] = useState("");
  const [addingGroup, setAddingGroup] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [sort, setSort] = useState<Sort>("name");

  const active = groups.filter((g) => !g.archived_at);
  const archived = groups.filter((g) => g.archived_at);
  const activeCount = students.filter((s) => !s.archived_at && active.some((g) => g.id === s.group_id)).length;

  const totals = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of students) {
      map.set(s.id, scoreLessons(lessonsByStudent.get(s.id) ?? []).reduce((sum, x) => sum + x.coins, 0));
    }
    return map;
  }, [students, lessonsByStudent]);

  async function submitGroup(e: FormEvent) {
    e.preventDefault();
    const name = newGroup.trim();
    if (!name) return;
    if (await addGroup(name)) {
      setNewGroup("");
      setAddingGroup(false);
    }
  }

  async function signOut() {
    await getSupabase().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  function topicSummary(studentId: string): string {
    const topics = topicsByStudent.get(studentId) ?? [];
    if (!topics.length) return "Shaxsiy mavzu rejasi yo'q";
    const next = currentTopic(topics, lessonsByStudent.get(studentId) ?? []);
    return next ? `Keyingi: ${next.title}` : "Reja tugadi";
  }

  const visible = filter === "all" ? active : active.filter((g) => g.id === filter);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">O&apos;quvchilar</h1>
          <p className="page-sub">
            {activeCount} ta faol o&apos;quvchi · {active.length} ta guruh
          </p>
        </div>
        <div className="page-actions">
          {addingGroup ? (
            <form className="form-row" onSubmit={submitGroup}>
              <input
                className="input"
                style={{ width: 200 }}
                placeholder="Guruh nomi"
                aria-label="Yangi guruh nomi"
                maxLength={60}
                value={newGroup}
                autoFocus
                onChange={(e) => setNewGroup(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setAddingGroup(false)}
              />
              <button className="btn btn--primary" type="submit" disabled={!newGroup.trim()}>
                Qo&apos;shish
              </button>
            </form>
          ) : (
            <button className="btn btn--primary" onClick={() => setAddingGroup(true)}>
              <IconPlus aria-hidden /> Guruh
            </button>
          )}
        </div>
      </div>

      <div className="toolbar">
        <label className="search">
          <IconSearch aria-hidden />
          <input
            className="input"
            type="search"
            placeholder="Ism bo'yicha qidirish"
            aria-label="O'quvchini qidirish"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="seg" role="group" aria-label="Guruh filtri">
          <button className="seg__btn" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>
            Hammasi
          </button>
          {active.map((g) => (
            <button key={g.id} className="seg__btn" aria-pressed={filter === g.id} onClick={() => setFilter(g.id)}>
              {g.name}
            </button>
          ))}
        </div>
        <select className="select" style={{ width: "auto" }} aria-label="Saralash" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          <option value="name">Ism bo&apos;yicha</option>
          <option value="coins">Tanga bo&apos;yicha</option>
        </select>
        <label className="check">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Arxiv
        </label>
      </div>

      {active.length === 0 && (
        <div className="card empty">
          <strong>Hali guruh yo&apos;q</strong>
          <p>Yuqoridagi &quot;Guruh&quot; tugmasi bilan birinchi guruhni yarating.</p>
        </div>
      )}

      <div className="stack" style={{ gap: 12 }}>
        {visible.map((g) => (
          <GroupBlock key={g.id} group={g} showArchived={showArchived} summary={topicSummary} totals={totals} query={query} sort={sort} />
        ))}
        {showArchived &&
          archived.map((g) => (
            <GroupBlock key={g.id} group={g} showArchived summary={topicSummary} totals={totals} query={query} sort={sort} />
          ))}
      </div>

      <div className="actions" style={{ marginTop: 32 }}>
        <button className="btn" onClick={() => void signOut()}>
          <IconLogout aria-hidden /> Chiqish
        </button>
      </div>
    </>
  );
}

function GroupBlock({
  group,
  showArchived,
  summary,
  totals,
  query,
  sort,
}: {
  group: Group;
  showArchived: boolean;
  summary: (studentId: string) => string;
  totals: Map<string, number>;
  query: string;
  sort: Sort;
}) {
  const { students, addStudent, renameGroup, setGroupArchived, deleteGroup, setStudentArchived } = useData();
  const members = students.filter((s) => s.group_id === group.id);
  const [open, setOpen] = useState(members.length > 0);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const stages = useStages();
  const bookGroups = useMemo(
    () => stages.programs.map((p) => ({ program: p, books: sortBooks(stages.booksOf(p.id).filter(isSelectable)) })).filter((g) => g.books.length > 0),
    [stages.programs, stages.booksOf],
  );
  const books = useMemo(() => bookGroups.flatMap((g) => g.books), [bookGroups]);
  const [bookId, setBookId] = useState("");
  const [level, setLevel] = useState<Level | "">("");
  const [started, setStarted] = useState(todayISO());
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(group.name);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const needle = query.trim().toLowerCase();
  const matches = (n: string) => !needle || n.toLowerCase().includes(needle);
  const order = (a: Student, b: Student) =>
    sort === "coins" ? (totals.get(b.id) ?? 0) - (totals.get(a.id) ?? 0) || a.name.localeCompare(b.name) : a.name.localeCompare(b.name);
  const liveAll = members.filter((s) => !s.archived_at);
  const live = liveAll.filter((s) => matches(s.name)).sort(order);
  const gone = members.filter((s) => s.archived_at && matches(s.name)).sort(order);

  // A search should reveal matches even in collapsed groups.
  const expanded = open || Boolean(needle);

  async function submitStudent(e: FormEvent) {
    e.preventDefault();
    const value = name.trim();
    if (!value) return;
    const created = await addStudent(value, group.id);
    if (!created) return;
    setName("");
    if (bookId && isLevel(level)) {
      // The student is already saved; if the stage fails the teacher can set it from the profile.
      await stages.setStage([created.id], bookId, level, started);
    }
    setBookId("");
    setLevel("");
    setStarted(todayISO());
  }

  async function submitRename(e: FormEvent) {
    e.preventDefault();
    setRenaming(false);
    const value = title.trim();
    if (value && value !== group.name) await renameGroup(group.id, value);
    else setTitle(group.name);
  }

  return (
    <section className="card" aria-label={group.name}>
      <div className="group-head">
        {renaming ? (
          <form className="form-row" style={{ flex: 1 }} onSubmit={submitRename}>
            <input
              className="input"
              value={title}
              autoFocus
              maxLength={60}
              aria-label="Guruh nomi"
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setRenaming(false)}
            />
            <button className="btn btn--primary" type="submit">
              Saqlash
            </button>
          </form>
        ) : (
          <button className="group-toggle" aria-expanded={expanded} onClick={() => setOpen(!open)}>
            <IconChevronDown aria-hidden />
            {group.name}
            {group.archived_at && <span className="chip">Arxiv</span>}
            <span className="chip">{liveAll.length}</span>
          </button>
        )}
        {!renaming && (
          <div className="group-head__tools">
            <button className="icon-btn icon-btn--bare" aria-label={`${group.name}: nomini o'zgartirish`} title="Nomini o'zgartirish" onClick={() => setRenaming(true)}>
              <IconEdit aria-hidden />
            </button>
            {group.archived_at ? (
              <button className="icon-btn icon-btn--bare" aria-label={`${group.name}: arxivdan qaytarish`} title="Arxivdan qaytarish" onClick={() => void setGroupArchived(group.id, false)}>
                <IconRestore aria-hidden />
              </button>
            ) : (
              <button className="icon-btn icon-btn--bare" aria-label={`${group.name}: arxivlash`} title="Arxivlash (tarix saqlanadi)" onClick={() => void setGroupArchived(group.id, true)}>
                <IconArchive aria-hidden />
              </button>
            )}
            {members.length === 0 && (
              <button className="icon-btn icon-btn--bare" style={{ color: "var(--bad)" }} aria-label={`${group.name}: o'chirish`} title="Bo'sh guruhni o'chirish" onClick={() => setConfirmDelete(true)}>
                <IconTrash aria-hidden />
              </button>
            )}
          </div>
        )}
      </div>

      {expanded && (
        <>
          {live.length === 0 && gone.length === 0 ? (
            <p className="hint" style={{ padding: "4px 16px 12px" }}>
              {needle && liveAll.length > 0 ? "Hech kim topilmadi." : "Bu guruhda hali o'quvchi yo'q."}
            </p>
          ) : (
            <div className="list" style={{ borderTop: "1px solid var(--line)" }}>
              {live.map((s) => (
                <Link key={s.id} href={`/students/${s.id}`} className="row">
                  <span className="row__who">
                    <Avatar name={s.name} />
                    <span style={{ minWidth: 0 }}>
                      <span className="row__main">{s.name}</span>
                      <span className="row__sub">{summary(s.id)}</span>
                    </span>
                  </span>
                  <span className="row__end">
                    <span className="coins">
                      <IconCoin aria-hidden />
                      {totals.get(s.id) ?? 0}
                    </span>
                    <IconChevronRight aria-hidden />
                  </span>
                </Link>
              ))}
              {showArchived &&
                gone.map((s) => (
                  <div key={s.id} className="row" style={{ opacity: 0.75 }}>
                    <span className="row__who">
                      <Avatar name={s.name} />
                      <span style={{ minWidth: 0 }}>
                        <span className="row__main">{s.name}</span>
                        <span className="row__sub">Arxivda · tarix saqlangan</span>
                      </span>
                    </span>
                    <button className="btn btn--sm" onClick={() => void setStudentArchived(s.id, false)}>
                      <IconRestore aria-hidden /> Qaytarish
                    </button>
                  </div>
                ))}
            </div>
          )}
          {!group.archived_at && (
            <div className="group-add">
              {adding ? (
                <form className="add-student" onSubmit={submitStudent}>
                  <input
                    className="input"
                    placeholder={`${group.name}: yangi o'quvchi ismi`}
                    aria-label={`${group.name} guruhiga o'quvchi qo'shish`}
                    maxLength={80}
                    value={name}
                    autoFocus
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => e.key === "Escape" && setAdding(false)}
                  />
                  <div className="add-student__stage">
                    <select
                      className="select"
                      aria-label="Qaysi kitobdan boshlaydi?"
                      value={bookId}
                      disabled={books.length === 0}
                      onChange={(e) => {
                        setBookId(e.target.value);
                        const suggested = stages.bookById.get(e.target.value)?.level;
                        if (suggested) setLevel(suggested);
                      }}
                    >
                      <option value="">{books.length ? "Kitob (ixtiyoriy)" : "O'quv dasturi to'ldirilmagan"}</option>
                      {bookGroups.map((g) => (
                        <optgroup key={g.program.id} label={g.program.name}>
                          {g.books.map((b, i) => (
                            <option key={b.id} value={b.id}>
                              {i + 1}. {b.title}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    <select className="select" aria-label="Hozirgi level" value={level} disabled={!bookId} onChange={(e) => setLevel(e.target.value as Level)}>
                      <option value="">Level</option>
                      {LEVELS.map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </select>
                    <input className="input" type="date" aria-label="Kitobni boshlash sanasi" value={started} max={todayISO()} disabled={!bookId} onChange={(e) => setStarted(e.target.value)} />
                  </div>
                  {bookId && !level && <p className="hint">Kitob tanlansa, levelni ham tanlang.</p>}
                  <div className="form-row">
                    <button className="btn btn--primary" type="submit" disabled={!name.trim() || Boolean(bookId && !level)}>
                      Qo&apos;shish
                    </button>
                    <button className="btn btn--ghost" type="button" onClick={() => setAdding(false)}>
                      Yopish
                    </button>
                  </div>
                </form>
              ) : (
                <button className="btn btn--ghost btn--sm" onClick={() => setAdding(true)}>
                  <IconPlus aria-hidden /> O&apos;quvchi qo&apos;shish
                </button>
              )}
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title={`“${group.name}” guruhini o'chirasizmi?`}
        confirmLabel="O'chirish"
        danger
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          void deleteGroup(group.id);
        }}
      >
        Guruh bo&apos;sh, shuning uchun hech qanday o&apos;quvchi tarixi yo&apos;qolmaydi.
      </ConfirmDialog>
    </section>
  );
}
