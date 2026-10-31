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

/** Remembers the chosen group per subject across refreshes (per browser tab). Falls back to the first group. */
export function useStoredGroup(subject: SubjectKey, groups: SubjectGroup[]): [SubjectGroup | null, (id: string) => void] {
  const key = `ark.${subject}.group`;
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    try {
      setId(window.sessionStorage.getItem(key));
    } catch {
      /* storage unavailable */
    }
  }, [key]);
  const group = groups.find((g) => g.id === id) ?? groups[0] ?? null;
  return [
    group,
    (next) => {
      setId(next);
      try {
        window.sessionStorage.setItem(key, next);
      } catch {
        /* ignore */
      }
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
      <p className="hint">Avval guruh va o&apos;quvchilarni qo&apos;shing.</p>
      <Link className="btn btn--primary" href={`${SUBJECTS[subject].path}/groups`}>
        Guruhlar va o&apos;quvchilar
      </Link>
    </div>
  );
}

export const HW_LABEL = { submitted: "Topshirdi", not_submitted: "Topshirmadi", unchecked: "Tekshirilmagan" } as const;
export const fmtPct = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("en-US", { maximumFractionDigits: 1 })}%`);
