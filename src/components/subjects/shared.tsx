"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SUBJECTS, type SubjectGroup, type SubjectKey } from "@/lib/subjects/types";
import { useSubjectApi } from "@/lib/subjects/data";
import { IconCheck } from "@/components/icons";

/** "Saqlanmoqda… / Saqlandi" for the subject writes (mirrors the English SaveChip). */
export function SubjectSaveChip() {
  const { pendingWrites, lastSavedAt } = useSubjectApi();
  const [recent, setRecent] = useState(false);
  useEffect(() => {
    if (!lastSavedAt) return;
    setRecent(true);
    const t = setTimeout(() => setRecent(false), 2200);
    return () => clearTimeout(t);
  }, [lastSavedAt]);
  if (pendingWrites > 0)
    return (
      <span className="save-chip save-chip--saving" role="status">
        <span className="dot" /> Saqlanmoqda…
      </span>
    );
  if (recent)
    return (
      <span className="save-chip save-chip--saved" role="status">
        <IconCheck /> Saqlandi
      </span>
    );
  return null;
}

const groupKey = (subject: SubjectKey) => `ark.${subject}.group`;

/** Remember the group the journal / tests / reports should open with (per browser tab). */
export function rememberGroup(subject: SubjectKey, id: string) {
  try {
    window.sessionStorage.setItem(groupKey(subject), id);
  } catch {
    /* storage unavailable */
  }
}

/**
 * Remembers the chosen group per subject across pages and refreshes (per browser tab); falls back to the first group.
 * Read synchronously: these pages only render after the data has loaded on the client, so there is no server render to
 * mismatch and no one-frame flash of the wrong group.
 */
export function useStoredGroup(subject: SubjectKey, groups: SubjectGroup[]): [SubjectGroup | null, (id: string) => void] {
  const [id, setId] = useState<string | null>(() => {
    try {
      return typeof window === "undefined" ? null : window.sessionStorage.getItem(groupKey(subject));
    } catch {
      return null;
    }
  });
  const group = groups.find((g) => g.id === id) ?? groups[0] ?? null;
  return [
    group,
    (next) => {
      setId(next);
      rememberGroup(subject, next);
    },
  ];
}

export function GroupTabs({ groups, value, onChange }: { groups: SubjectGroup[]; value: string | null; onChange: (id: string) => void }) {
  return (
    <div className="seg" role="tablist" aria-label="Guruhlar">
      {groups.map((g) => (
        <button key={g.id} type="button" role="tab" className="seg__btn" aria-selected={g.id === value} onClick={() => onChange(g.id)}>
          {g.name}
        </button>
      ))}
    </div>
  );
}

export function NoGroups({ subject }: { subject: SubjectKey }) {
  return (
    <div className="card empty">
      <strong>{SUBJECTS[subject].label}: hali guruh yo&apos;q</strong>
      <p className="hint">Avval guruh yarating, so&apos;ng o&apos;quvchilarni qo&apos;shing.</p>
      <Link className="btn btn--primary" href={`${SUBJECTS[subject].path}/groups`}>
        Guruh yaratish
      </Link>
    </div>
  );
}

export const HW_LABEL = { submitted: "Topshirdi", not_submitted: "Topshirmadi", unchecked: "Tekshirilmagan" } as const;
export const fmtPct = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("en-US", { maximumFractionDigits: 1 })}%`);
