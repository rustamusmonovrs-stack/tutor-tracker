"use client";

import { useId, useMemo } from "react";
import { useData } from "@/lib/data";
import { useSubjectScope } from "@/lib/subjects/data";
import { buildPeople, identify, nameKey, type Person } from "@/lib/subjects/people";

/**
 * Shared by the Guruhlar and O'quvchilar pages: finds out who a typed name is, and enrols them into a group
 * without ever creating a stranger copy of an existing person or touching English data (English is read-only here).
 */
export function useRoster() {
  const { subject, api, groups, students } = useSubjectScope();
  const english = useData().activeStudents;
  const people = useMemo(() => buildPeople(students, groups), [students, groups]);

  /** What a typed name means right now (also drives the hint under the input). */
  function resolve(raw: string) {
    const clean = raw.trim().replace(/\s+/g, " ");
    const matches = english.filter((e) => nameKey(e.name) === nameKey(clean));
    const en = matches.length === 1 ? matches[0] : null; // two English students with one name: not guessing
    const known = identify(clean, en?.id ?? null, people);
    return { ...known, linkedEnglish: Boolean(known.englishStudentId) };
  }

  /** Adds the person to the group; restores an archived membership instead of creating a second row. */
  async function enroll(groupId: string, raw: string): Promise<{ ok: boolean; error?: string }> {
    const clean = raw.trim().replace(/\s+/g, " ");
    if (!clean) return { ok: false, error: "Ism kiriting" };
    const r = resolve(clean);
    const mine = r.existing?.memberships.filter((m) => m.group_id === groupId) ?? [];
    if (mine.some((m) => !m.archived_at)) return { ok: false, error: `${r.name} bu guruhda allaqachon bor` };
    const archived = mine[0];
    if (archived) return { ok: await api.setStudentArchived(archived.id, false) };
    const s = await api.addStudent(subject, groupId, r.name, r.englishStudentId);
    return { ok: Boolean(s) };
  }

  return { subject, api, people, english, resolve, enroll };
}

/** Name input with suggestions (existing people of this subject + English students) and an honest hint about what will happen. */
export function StudentNameField({
  label,
  value,
  onChange,
  groupId,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  /** Suggest only people who are not yet active in this group. */
  groupId?: string | null;
  autoFocus?: boolean;
}) {
  const listId = useId();
  const { people, english, resolve } = useRoster();

  const suggestions = useMemo(() => {
    const out = new Map<string, string>();
    for (const p of people) if (!groupId || !p.active.some((m) => m.group_id === groupId)) out.set(nameKey(p.name), p.name);
    for (const e of english) if (!out.has(nameKey(e.name))) out.set(nameKey(e.name), e.name);
    return [...out.values()].sort((a, b) => a.localeCompare(b, "uz"));
  }, [people, english, groupId]);

  const text = value.trim();
  const r = text ? resolve(text) : null;
  const inGroup = Boolean(groupId && r?.existing?.active.some((m) => m.group_id === groupId));
  let hint = "Yangi o'quvchi yaratiladi. Mavjud o'quvchini ro'yxatdan tanlang.";
  if (r?.existing) hint = inGroup ? `${r.name} bu guruhda allaqachon bor.` : `Mavjud o'quvchi: yangi nusxa yaratilmaydi, shu guruhga qo'shiladi.`;
  else if (r?.linkedEnglish) hint = "Ingliz tili o'quvchisi bilan bog'lanadi (Ingliz tili ma'lumoti o'zgarmaydi).";

  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <input
        className="input"
        list={listId}
        value={value}
        maxLength={80}
        autoFocus={autoFocus}
        autoComplete="off"
        placeholder="Ism familiya"
        aria-invalid={inGroup ? true : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id={listId}>
        {suggestions.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      {text && <span className={inGroup ? "sj-err" : "hint"}>{hint}</span>}
    </label>
  );
}

export type { Person };
