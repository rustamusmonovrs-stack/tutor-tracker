"use client";

import { useId, useMemo } from "react";
import { useData } from "@/lib/data";
import { useSubjectScope } from "@/lib/subjects/data";
import { buildPeople, candidatesByName, nameKey, type Person } from "@/lib/subjects/people";

/** What the teacher decided when the typed name matches someone who already exists. */
export type Choice = { kind: "existing"; personId: string } | { kind: "new" } | null;

/**
 * Shared by the Guruhlar and O'quvchilar pages. Identity is the permanent person_id: a typed name that matches
 * existing people is NEVER merged automatically, the teacher picks "this existing person" or "a different, new person".
 * English data is read-only here (only its id is stored as an optional link).
 */
export function useRoster() {
  const { subject, api, groups, students } = useSubjectScope();
  const english = useData().activeStudents;
  const people = useMemo(() => buildPeople(students, groups), [students, groups]);

  const candidates = (raw: string) => candidatesByName(raw, people);

  /** The English student with exactly this name (two with one name: not guessed). */
  const englishMatch = (raw: string) => {
    const m = english.filter((e) => nameKey(e.name) === nameKey(raw));
    return m.length === 1 ? m[0] : null;
  };

  /** Ready to submit: a name, and a decision whenever the name already exists. */
  const ready = (raw: string, choice: Choice) => raw.trim().length > 0 && (candidates(raw).length === 0 || choice !== null);

  async function enroll(groupId: string, raw: string, choice: Choice): Promise<{ ok: boolean; error?: string }> {
    const clean = raw.trim().replace(/\s+/g, " ");
    if (!clean) return { ok: false, error: "Ism kiriting" };
    if (candidates(clean).length > 0 && choice === null) return { ok: false, error: "Mavjud o'quvchini yoki yangi o'quvchini tanlang" };

    if (choice?.kind === "existing") {
      const person = people.find((p) => p.key === choice.personId);
      if (!person) return { ok: false, error: "O'quvchi topilmadi" };
      const mine = person.memberships.filter((m) => m.group_id === groupId);
      if (mine.some((m) => !m.archived_at)) return { ok: false, error: `${person.name} bu guruhda allaqachon bor` };
      if (mine[0]) return { ok: await api.setStudentArchived(mine[0].id, false) };
      const s = await api.addStudent(subject, groupId, person.name, person.englishStudentId, person.key);
      return { ok: Boolean(s) };
    }

    const en = englishMatch(clean);
    const taken = en ? people.some((p) => p.englishStudentId === en.id) : false;
    const s = await api.addStudent(subject, groupId, clean, en && !taken ? en.id : null);
    return { ok: Boolean(s) };
  }

  return { subject, api, people, english, candidates, englishMatch, ready, enroll };
}

/** Name input with suggestions, plus an explicit choice when the name already exists. */
export function StudentNameField({
  label,
  value,
  onChange,
  choice,
  onChoice,
  groupId,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  choice: Choice;
  onChoice: (c: Choice) => void;
  groupId?: string | null;
  autoFocus?: boolean;
}) {
  const listId = useId();
  const radioName = useId();
  const { groups } = useSubjectScope();
  const { people, english, candidates, englishMatch } = useRoster();

  const suggestions = useMemo(() => {
    const out = new Map<string, string>();
    for (const p of people) out.set(nameKey(p.name), p.name);
    for (const e of english) if (!out.has(nameKey(e.name))) out.set(nameKey(e.name), e.name);
    return [...out.values()].sort((a, b) => a.localeCompare(b, "uz"));
  }, [people, english]);

  const text = value.trim();
  const found = text ? candidates(text) : [];
  const gname = (id: string) => groups.find((g) => g.id === id)?.name ?? "";
  const here = (p: Person) => Boolean(groupId && p.active.some((m) => m.group_id === groupId));
  const linked = text && found.length === 0 ? englishMatch(text) : null;

  return (
    <div className="field">
      <label className="field__label" htmlFor={`${listId}-in`}>{label}</label>
      <input
        id={`${listId}-in`}
        className="input"
        list={listId}
        value={value}
        maxLength={80}
        autoFocus={autoFocus}
        autoComplete="off"
        placeholder="Ism familiya"
        onChange={(e) => {
          onChange(e.target.value);
          onChoice(null);
        }}
      />
      <datalist id={listId}>
        {suggestions.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>

      {found.length > 0 && (
        <fieldset className="sj-choice">
          <legend className="hint">Bu ism bilan o&apos;quvchi bor. Qaysi biri?</legend>
          {found.map((p) => {
            const groupsOf = [...new Set(p.memberships.filter((m) => !m.archived_at).map((m) => gname(m.group_id)))].join(", ");
            const inHere = here(p);
            return (
              <label className="sj-choice__opt" key={p.key}>
                <input type="radio" name={radioName} disabled={inHere} checked={choice?.kind === "existing" && choice.personId === p.key} onChange={() => onChoice({ kind: "existing", personId: p.key })} />
                <span>
                  Mavjud o&apos;quvchi: <b>{p.name}</b>{groupsOf ? ` (${groupsOf})` : " (guruhsiz)"}
                  {inHere && <span className="sj-err"> · bu guruhda allaqachon bor</span>}
                </span>
              </label>
            );
          })}
          <label className="sj-choice__opt">
            <input type="radio" name={radioName} checked={choice?.kind === "new"} onChange={() => onChoice({ kind: "new" })} />
            <span>Boshqa odam: yangi o&apos;quvchi yaratish</span>
          </label>
        </fieldset>
      )}
      {text && found.length === 0 && <span className="hint">{linked ? "Yangi o'quvchi yaratiladi va Ingliz tili o'quvchisi bilan bog'lanadi (Ingliz tili ma'lumoti o'zgarmaydi)." : "Yangi o'quvchi yaratiladi."}</span>}
    </div>
  );
}

export type { Person };
