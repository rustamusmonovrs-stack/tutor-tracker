"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useData } from "@/lib/data";
import { currentTopic } from "@/lib/progress";
import { getSupabase } from "@/lib/supabase/client";
import type { Group } from "@/lib/types";

export default function StudentsPage() {
  const { groups, students, topicsByStudent, lessonsByStudent, addGroup } = useData();
  const router = useRouter();
  const [newGroup, setNewGroup] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const active = groups.filter((g) => !g.archived_at);
  const archived = groups.filter((g) => g.archived_at);
  const activeCount = students.filter(
    (s) => !s.archived_at && active.some((g) => g.id === s.group_id),
  ).length;

  async function submitGroup(e: FormEvent) {
    e.preventDefault();
    const name = newGroup.trim();
    if (!name) return;
    if (await addGroup(name)) setNewGroup("");
  }

  async function signOut() {
    await getSupabase().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  function topicSummary(studentId: string): string {
    const topics = topicsByStudent.get(studentId) ?? [];
    if (!topics.length) return "No topics yet";
    const next = currentTopic(topics, lessonsByStudent.get(studentId) ?? []);
    return next ? `Next: ${next.title}` : "All topics done";
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Students</h1>
          <p className="page-sub">
            {activeCount} active in {active.length} {active.length === 1 ? "group" : "groups"}
          </p>
        </div>
        <label className="hint" style={{ display: "flex", gap: 8, alignItems: "center", minHeight: 44 }}>
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Show archived
        </label>
      </div>

      <form className="form-row" onSubmit={submitGroup}>
        <input
          className="input"
          placeholder="New group name"
          aria-label="New group name"
          maxLength={60}
          value={newGroup}
          onChange={(e) => setNewGroup(e.target.value)}
        />
        <button className="btn btn--primary" type="submit" disabled={!newGroup.trim()}>
          Add group
        </button>
      </form>

      {active.length === 0 && (
        <div className="sheet empty" style={{ marginTop: 16 }}>
          <strong>No groups yet</strong>
          <p>Create a group above, e.g. “Beginner”, then add its students.</p>
        </div>
      )}

      {active.map((g) => (
        <GroupBlock
          key={g.id}
          group={g}
          showArchived={showArchived}
          summary={topicSummary}
        />
      ))}

      {showArchived && archived.length > 0 && (
        <>
          <h2 className="section-title">Archived groups</h2>
          {archived.map((g) => (
            <GroupBlock key={g.id} group={g} showArchived summary={topicSummary} />
          ))}
        </>
      )}

      <div className="actions" style={{ marginTop: 40 }}>
        <button className="btn" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
    </>
  );
}

function GroupBlock({
  group,
  showArchived,
  summary,
}: {
  group: Group;
  showArchived: boolean;
  summary: (studentId: string) => string;
}) {
  const { students, addStudent, renameGroup, setGroupArchived, deleteGroup, setStudentArchived } = useData();
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(group.name);

  const members = students.filter((s) => s.group_id === group.id);
  const live = members.filter((s) => !s.archived_at);
  const gone = members.filter((s) => s.archived_at);

  async function submitStudent(e: FormEvent) {
    e.preventDefault();
    const value = name.trim();
    if (!value) return;
    if (await addStudent(value, group.id)) setName("");
  }

  async function submitRename(e: FormEvent) {
    e.preventDefault();
    setRenaming(false);
    const value = title.trim();
    if (value && value !== group.name) await renameGroup(group.id, value);
    else setTitle(group.name);
  }

  async function onDelete() {
    if (window.confirm(`Delete the empty group “${group.name}”?`)) await deleteGroup(group.id);
  }

  return (
    <section aria-label={group.name}>
      <div className="group-head">
        {renaming ? (
          <form className="form-row" style={{ flex: 1 }} onSubmit={submitRename}>
            <input
              className="input"
              value={title}
              autoFocus
              maxLength={60}
              aria-label="Group name"
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setRenaming(false)}
            />
            <button className="btn btn--primary btn--sm" type="submit">
              Save
            </button>
          </form>
        ) : (
          <h2>
            {group.name}
            <span className="group-head__count">{live.length}</span>
          </h2>
        )}
        {!renaming && (
          <div style={{ display: "flex", gap: 4 }}>
            <button className="btn btn--quiet btn--sm" onClick={() => setRenaming(true)}>
              Rename
            </button>
            {group.archived_at ? (
              <button className="btn btn--quiet btn--sm" onClick={() => void setGroupArchived(group.id, false)}>
                Restore
              </button>
            ) : (
              <button className="btn btn--quiet btn--sm" onClick={() => void setGroupArchived(group.id, true)}>
                Archive
              </button>
            )}
            {members.length === 0 && (
              <button className="btn btn--quiet btn--sm" style={{ color: "var(--not_done)" }} onClick={() => void onDelete()}>
                Delete
              </button>
            )}
          </div>
        )}
      </div>

      <div className="sheet">
        {live.length === 0 && <p className="empty">No students in this group yet.</p>}
        {live
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((s) => (
            <Link key={s.id} href={`/students/${s.id}`} className="row-link">
              <span>
                <span className="row-link__main">{s.name}</span>
                <span className="row-link__sub">{summary(s.id)}</span>
              </span>
              <span className="chev" aria-hidden>
                ›
              </span>
            </Link>
          ))}
        {showArchived &&
          gone.map((s) => (
            <div key={s.id} className="row-link" style={{ opacity: 0.75 }}>
              <span>
                <span className="row-link__main">{s.name}</span>
                <span className="row-link__sub">Archived · history kept</span>
              </span>
              <button className="btn btn--sm" onClick={() => void setStudentArchived(s.id, false)}>
                Restore
              </button>
            </div>
          ))}
      </div>

      {!group.archived_at && (
        <form className="form-row" style={{ marginTop: 10 }} onSubmit={submitStudent}>
          <input
            className="input"
            placeholder={`Add student to ${group.name}`}
            aria-label={`Add student to ${group.name}`}
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button className="btn" type="submit" disabled={!name.trim()}>
            Add
          </button>
        </form>
      )}
    </section>
  );
}
