"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { IconArchive, IconBook, IconChevronDown, IconEdit, IconPlus, IconRestore, IconSearch } from "@/components/icons";
import { ConfirmDialog, FormDialog } from "@/components/ui";
import { formatShort } from "@/lib/dates";
import { useSubjectScope } from "@/lib/subjects/data";
import { nameKey, personKey } from "@/lib/subjects/people";
import { SUBJECTS, type SubjectGroup } from "@/lib/subjects/types";
import { StudentNameField, useRoster, type Choice } from "./roster";
import { SubjectSaveChip, rememberGroup } from "./shared";

export function SubjectGroups() {
  const { subject, api, groups, students, lessons, activeGroups } = useSubjectScope();
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  const shown = useMemo(
    () =>
      groups
        .filter((g) => (showArchived || !g.archived_at) && nameKey(g.name).includes(nameKey(query)))
        .sort((a, b) => Number(Boolean(a.archived_at)) - Number(Boolean(b.archived_at)) || a.name.localeCompare(b.name, "uz", { numeric: true })),
    [groups, showArchived, query],
  );
  const memberCount = (id: string) => students.filter((s) => s.group_id === id && !s.archived_at).length;
  const lastLesson = (id: string) => lessons.filter((l) => l.group_id === id).reduce<string | null>((m, l) => (m === null || l.lesson_date > m ? l.lesson_date : m), null);
  const archivedCount = groups.length - activeGroups.length;

  const clash = activeGroups.some((g) => nameKey(g.name) === nameKey(newName));
  async function create() {
    setBusy(true);
    const g = await api.addGroup(subject, newName.trim());
    setBusy(false);
    if (g) {
      setCreating(false);
      setNewName("");
      setOpenId(g.id);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Guruhlar</h1>
          <p className="page-sub">
            {SUBJECTS[subject].label} · {activeGroups.length} ta faol guruh
          </p>
        </div>
        <div className="page-actions">
          <SubjectSaveChip />
          <button className="btn btn--primary" onClick={() => setCreating(true)}>
            <IconPlus aria-hidden /> Guruh yaratish
          </button>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="card empty sj-empty">
          <strong>Hali guruh yo&apos;q</strong>
          <p className="hint">{SUBJECTS[subject].label} bo&apos;yicha birinchi guruhni yarating, so&apos;ng o&apos;quvchilarni qo&apos;shing.</p>
          <button className="btn btn--primary" onClick={() => setCreating(true)}>
            <IconPlus aria-hidden /> Guruh yaratish
          </button>
        </div>
      ) : (
        <>
          <div className="sj-toolbar">
            <label className="sj-search">
              <IconSearch aria-hidden />
              <input className="input" type="search" value={query} placeholder="Guruh nomi bo'yicha qidirish" aria-label="Guruhni qidirish" onChange={(e) => setQuery(e.target.value)} />
            </label>
            {archivedCount > 0 && (
              <label className="sj-check">
                <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Arxivdagilar ({archivedCount})
              </label>
            )}
          </div>

          {shown.length === 0 ? (
            <div className="card empty sj-empty">
              <strong>Hech narsa topilmadi</strong>
              <p className="hint">Qidiruvni o&apos;zgartiring.</p>
            </div>
          ) : (
            <ul className="sj-list">
              {shown.map((g) => (
                <GroupCard
                  key={g.id}
                  group={g}
                  count={memberCount(g.id)}
                  last={lastLesson(g.id)}
                  open={openId === g.id}
                  onToggle={() => setOpenId(openId === g.id ? null : g.id)}
                />
              ))}
            </ul>
          )}
        </>
      )}

      <FormDialog
        open={creating}
        title="Yangi guruh"
        submitLabel="Yaratish"
        busy={busy}
        canSubmit={newName.trim().length > 0 && !clash}
        onSubmit={() => void create()}
        onCancel={() => {
          setCreating(false);
          setNewName("");
        }}
      >
        <label className="field">
          <span className="field__label">Guruh nomi</span>
          <input className="input" autoFocus value={newName} maxLength={60} placeholder={`Masalan: ${SUBJECTS[subject].label} 1`} aria-invalid={clash ? true : undefined} onChange={(e) => setNewName(e.target.value)} />
          {clash && <span className="sj-err">Bu nomdagi faol guruh allaqachon bor</span>}
        </label>
      </FormDialog>
    </>
  );
}

function GroupCard({ group, count, last, open, onToggle }: { group: SubjectGroup; count: number; last: string | null; open: boolean; onToggle: () => void }) {
  const { subject } = useSubjectScope();
  return (
    <li className="card sj-gcard">
      <div className="sj-gcard__head">
        <div className="sj-gcard__title">
          <h2 className="sj-group-name">{group.name}</h2>
          {group.archived_at && <span className="chip chip--warn">Arxivda</span>}
          <span className="sj-gcard__meta">
            {count} ta o&apos;quvchi · {last ? `oxirgi dars ${formatShort(last)}` : "dars hali yo'q"}
          </span>
        </div>
        <div className="sj-inline">
          {!group.archived_at && (
            <Link className="btn btn--sm" href={SUBJECTS[subject].path} onClick={() => rememberGroup(subject, group.id)}>
              <IconBook aria-hidden /> Jurnal
            </Link>
          )}
          <button className="btn btn--sm" aria-expanded={open} aria-controls={`grp-${group.id}`} onClick={onToggle}>
            Boshqarish <IconChevronDown aria-hidden className={open ? "sj-flip" : undefined} />
          </button>
        </div>
      </div>
      {open && <GroupPanel group={group} />}
    </li>
  );
}

function GroupPanel({ group }: { group: SubjectGroup }) {
  const { subject, api, students } = useSubjectScope();
  const { enroll, ready } = useRoster();
  const [choice, setChoice] = useState<Choice>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showFormer, setShowFormer] = useState(false);

  const members = useMemo(() => students.filter((s) => s.group_id === group.id).sort((a, b) => a.name.localeCompare(b.name, "uz")), [students, group.id]);
  const active = members.filter((s) => !s.archived_at);
  const former = members.filter((s) => s.archived_at);
  const rows = showFormer ? members : active;

  async function add() {
    setAdding(true);
    setFormError(null);
    const r = await enroll(group.id, name, choice);
    setAdding(false);
    if (r.ok) {
      setName("");
      setChoice(null);
    }
    else if (r.error) setFormError(r.error);
  }

  return (
    <div className="sj-gcard__body" id={`grp-${group.id}`}>
      <div className="sj-inline">
        {renaming !== null ? (
          <form
            className="sj-inline"
            onSubmit={(e) => {
              e.preventDefault();
              void api.renameGroup(group.id, renaming).then((ok) => ok && setRenaming(null));
            }}
          >
            <input className="input" aria-label="Guruh nomi" autoFocus value={renaming} maxLength={60} onChange={(e) => setRenaming(e.target.value)} />
            <button className="btn btn--primary btn--sm" type="submit" disabled={!renaming.trim()}>Saqlash</button>
            <button className="btn btn--sm" type="button" onClick={() => setRenaming(null)}>Bekor</button>
          </form>
        ) : (
          <>
            <button className="btn btn--sm" onClick={() => setRenaming(group.name)}><IconEdit aria-hidden /> Nomini o&apos;zgartirish</button>
            {group.archived_at ? (
              <button className="btn btn--sm" onClick={() => void api.setGroupArchived(group.id, false)}><IconRestore aria-hidden /> Tiklash</button>
            ) : (
              <button className="btn btn--sm" onClick={() => setConfirmArchive(true)}><IconArchive aria-hidden /> Arxivlash</button>
            )}
          </>
        )}
      </div>

      {!group.archived_at && (
        <form
          className="sj-add"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <div style={{ flex: 1, minWidth: 220 }}>
            <StudentNameField label="O'quvchi qo'shish" value={name} groupId={group.id} choice={choice} onChoice={setChoice} onChange={(v) => { setName(v); setFormError(null); }} />
            {formError && <span className="sj-err" role="alert">{formError}</span>}
          </div>
          <button className="btn btn--primary" type="submit" disabled={adding || !ready(name, choice)}>
            <IconPlus aria-hidden /> Qo&apos;shish
          </button>
        </form>
      )}

      {rows.length === 0 ? (
        <div className="empty sj-empty--inline"><strong>Guruhda o&apos;quvchi yo&apos;q</strong></div>
      ) : (
        <ul className="sj-members">
          {rows.map((s) => (
            <li className="sj-member" key={s.id}>
              <span className="sj-who">
                <Avatar name={s.name} />
                <span className="sj-name">
                  {s.name}
                  {s.english_student_id && <span className="chip chip--brand sj-chip" title="Ingliz tili o'quvchisi bilan bog'langan">Ingliz tili</span>}
                  {s.archived_at && <span className="chip chip--warn sj-chip">Chiqarilgan</span>}
                </span>
              </span>
              <span className="sj-inline">
                <Link className="btn btn--sm" href={`${SUBJECTS[subject].path}/students?p=${encodeURIComponent(personKey(s))}`}>Profil</Link>
                {!group.archived_at &&
                  (s.archived_at ? (
                    <button className="btn btn--sm" onClick={() => void api.setStudentArchived(s.id, false)}>
                      <IconRestore aria-hidden /> Qaytarish
                    </button>
                  ) : (
                    <button className="btn btn--sm" aria-label={`${s.name}: guruhdan chiqarish`} onClick={() => setRemoving({ id: s.id, name: s.name })}>
                      Guruhdan chiqarish
                    </button>
                  ))}
              </span>
            </li>
          ))}
        </ul>
      )}
      {former.length > 0 && (
        <label className="sj-check">
          <input type="checkbox" checked={showFormer} onChange={(e) => setShowFormer(e.target.checked)} /> Chiqarilganlar ({former.length})
        </label>
      )}

      <ConfirmDialog
        open={confirmArchive}
        title={`"${group.name}" guruhini arxivlash?`}
        confirmLabel="Arxivlash"
        onCancel={() => setConfirmArchive(false)}
        onConfirm={() => {
          setConfirmArchive(false);
          void api.setGroupArchived(group.id, true);
        }}
      >
        Guruh jurnal va statistikadan yashiriladi. Davomat, vazifa va ball yozuvlari saqlanadi, istalgan payt tiklash mumkin.
      </ConfirmDialog>
      <ConfirmDialog
        open={removing !== null}
        title={`${removing?.name ?? ""}ni guruhdan chiqarish?`}
        confirmLabel="Chiqarish"
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          const r = removing;
          setRemoving(null);
          if (r) void api.setStudentArchived(r.id, true);
        }}
      >
        O&apos;quvchi shu guruh ro&apos;yxatidan chiqadi. Uning avvalgi davomat, vazifa va test natijalari saqlanadi; boshqa guruhlari va Ingliz tili ma&apos;lumoti o&apos;zgarmaydi. Qaytarish mumkin.
      </ConfirmDialog>
    </div>
  );
}
