"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { RESULT_META } from "@/lib/config";
import { useData } from "@/lib/data";
import { formatShort } from "@/lib/dates";
import { currentTopic, repeatCount, topicStatuses } from "@/lib/progress";
import { scoreLessons } from "@/lib/scoring";
import type { Topic } from "@/lib/types";

export default function StudentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const {
    students,
    groups,
    topicsByStudent,
    lessonsByStudent,
    updateStudent,
    setStudentArchived,
    deleteStudent,
    addTopics,
    renameTopic,
    removeTopic,
    moveTopic,
  } = useData();

  const student = students.find((s) => s.id === id);
  const topics = useMemo(() => topicsByStudent.get(id) ?? [], [topicsByStudent, id]);
  const lessons = useMemo(() => lessonsByStudent.get(id) ?? [], [lessonsByStudent, id]);

  const [name, setName] = useState(student?.name ?? "");
  const [bulk, setBulk] = useState("");
  const [editingTopic, setEditingTopic] = useState<string | null>(null);
  const [topicDraft, setTopicDraft] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (student) setName(student.name);
  }, [student]);

  const statuses = useMemo(() => topicStatuses(topics, lessons), [topics, lessons]);
  const scored = useMemo(() => scoreLessons(lessons), [lessons]);
  const history = useMemo(() => [...scored].reverse().slice(0, 20), [scored]);

  if (!student) {
    return (
      <div className="sheet empty">
        <strong>Student not found</strong>
        <p>They may have been deleted.</p>
        <p style={{ marginTop: 14 }}>
          <Link className="btn" href="/students">
            Back to students
          </Link>
        </p>
      </div>
    );
  }

  const current = currentTopic(topics, lessons);
  const doneCount = topics.filter((t) => statuses.get(t.id) === "done").length;
  const repeats = repeatCount(current, lessons);
  const totalCoins = scored.reduce((sum, s) => sum + s.coins, 0);
  const activeGroups = groups.filter((g) => !g.archived_at || g.id === student.group_id);

  async function saveName(e: FormEvent) {
    e.preventDefault();
    const value = name.trim();
    if (!value) return setName(student!.name);
    if (value !== student!.name) await updateStudent(student!.id, { name: value });
  }

  async function submitTopics(e: FormEvent) {
    e.preventDefault();
    const titles = bulk.split("\n");
    if (await addTopics(student!.id, titles)) setBulk("");
  }

  async function saveTopic(e: FormEvent, topic: Topic) {
    e.preventDefault();
    setEditingTopic(null);
    if (topicDraft.trim() && topicDraft.trim() !== topic.title) await renameTopic(topic.id, topicDraft);
  }

  async function onRemoveTopic(topic: Topic) {
    if (window.confirm(`Remove topic “${topic.title}”? Past lessons keep its name.`)) await removeTopic(topic.id);
  }

  async function onDelete() {
    setBusy(true);
    if (await deleteStudent(student!.id)) router.replace("/students");
    else setBusy(false);
  }

  const lines = bulk.split("\n").filter((l) => l.trim()).length;

  return (
    <>
      <p style={{ marginBottom: 10 }}>
        <Link href="/students" className="btn btn--quiet btn--sm" style={{ paddingInline: 0 }}>
          ‹ Students
        </Link>
      </p>

      <div className="page-head">
        <div>
          <h1 className="page-title">{student.name}</h1>
          <p className="page-sub">
            {student.archived_at ? "Archived · " : ""}
            {topics.length ? `${doneCount} of ${topics.length} topics done · ` : ""}
            {totalCoins} coins overall
          </p>
        </div>
      </div>

      <div className="sheet sheet--pad stack">
        <form className="form-row" onSubmit={saveName}>
          <label className="field" style={{ flex: 1 }}>
            <span className="field__label">Name</span>
            <input className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} onBlur={saveName} />
          </label>
        </form>
        <label className="field">
          <span className="field__label">Group</span>
          <select
            className="input"
            value={student.group_id}
            onChange={(e) => void updateStudent(student.id, { group_id: e.target.value })}
          >
            {activeGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
                {g.archived_at ? " (archived)" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      <h2 className="section-title">Topics</h2>
      {repeats >= 1 && current && (
        <p className="callout" style={{ background: "var(--partial-bg)", color: "var(--partial)" }}>
          “{current.title}” has been repeated {repeats}×.
        </p>
      )}

      <div className="sheet">
        {topics.length === 0 ? (
          <div className="empty">
            <strong>No topics yet</strong>
            <p>Paste the course plan below, one topic per line.</p>
          </div>
        ) : (
          topics.map((t, i) => {
            const status = statuses.get(t.id) ?? "upcoming";
            return (
              <div key={t.id} className={`topic-row topic-row--${status}`}>
                <span className="topic-row__pos">{status === "done" ? "✓" : i + 1}</span>
                {editingTopic === t.id ? (
                  <form className="form-row" onSubmit={(e) => void saveTopic(e, t)} style={{ gridColumn: "2 / 4" }}>
                    <input
                      className="input"
                      value={topicDraft}
                      autoFocus
                      aria-label="Topic title"
                      maxLength={200}
                      onChange={(e) => setTopicDraft(e.target.value)}
                      onKeyDown={(e) => e.key === "Escape" && setEditingTopic(null)}
                    />
                    <button className="btn btn--primary btn--sm" type="submit">
                      Save
                    </button>
                  </form>
                ) : (
                  <>
                    <span className="topic-row__title">
                      {t.title}
                      {status === "current" && (
                        <span className="badge" style={{ marginLeft: 8, background: "var(--brand)", color: "#fff" }}>
                          Next
                        </span>
                      )}
                    </span>
                    <span className="topic-row__tools">
                      <button className="tool" aria-label={`Move “${t.title}” up`} disabled={i === 0} onClick={() => void moveTopic(student.id, t.id, -1)}>
                        ↑
                      </button>
                      <button className="tool" aria-label={`Move “${t.title}” down`} disabled={i === topics.length - 1} onClick={() => void moveTopic(student.id, t.id, 1)}>
                        ↓
                      </button>
                      <button
                        className="tool"
                        aria-label={`Edit “${t.title}”`}
                        onClick={() => {
                          setEditingTopic(t.id);
                          setTopicDraft(t.title);
                        }}
                      >
                        ✎
                      </button>
                      <button className="tool" aria-label={`Remove “${t.title}”`} onClick={() => void onRemoveTopic(t)}>
                        ✕
                      </button>
                    </span>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>

      <form className="stack" style={{ marginTop: 12 }} onSubmit={submitTopics}>
        <label className="field">
          <span className="field__label">Add topics, one per line</span>
          <textarea
            className="input"
            value={bulk}
            placeholder={"Present perfect\nPast simple vs present perfect\nConditionals"}
            onChange={(e) => setBulk(e.target.value)}
          />
        </label>
        <div>
          <button className="btn btn--primary" type="submit" disabled={lines === 0}>
            {lines > 1 ? `Add ${lines} topics` : "Add topic"}
          </button>
        </div>
      </form>

      <h2 className="section-title">Recent lessons</h2>
      <div className="sheet">
        {history.length === 0 ? (
          <p className="empty">No lessons marked yet.</p>
        ) : (
          history.map(({ lesson, coins }) => (
            <div key={lesson.id} className="history-row">
              <span style={{ color: "var(--ink-faint)" }}>{formatShort(lesson.lesson_date)}</span>
              <span style={{ overflowWrap: "anywhere" }}>
                {lesson.topic_title}{" "}
                <span className={`badge badge--result res--${lesson.result}`}>{RESULT_META[lesson.result].label}</span>
              </span>
              <span style={{ fontWeight: 650 }}>{coins > 0 ? `+${coins}` : ""}</span>
            </div>
          ))
        )}
      </div>

      <section className="danger" aria-label="Archive or delete">
        <h3>Archive or delete</h3>
        <p className="hint">
          <strong>Archive</strong> hides {student.name} from Today and the leaderboard but keeps all history, and you can restore any time.
        </p>
        <div className="actions">
          <button className="btn" onClick={() => void setStudentArchived(student.id, !student.archived_at)}>
            {student.archived_at ? "Restore student" : "Archive student"}
          </button>
        </div>

        <p className="hint" style={{ marginTop: 18 }}>
          <strong>Delete permanently</strong> removes {student.name}, all topics and all lesson history. This cannot be undone. Type the name to confirm.
        </p>
        <div className="form-row" style={{ marginTop: 10 }}>
          <input
            className="input"
            value={confirmText}
            placeholder={student.name}
            aria-label="Type the student's name to confirm deletion"
            onChange={(e) => setConfirmText(e.target.value)}
          />
          <button className="btn btn--danger" disabled={busy || confirmText.trim() !== student.name} onClick={() => void onDelete()}>
            Delete
          </button>
        </div>
      </section>
    </>
  );
}
