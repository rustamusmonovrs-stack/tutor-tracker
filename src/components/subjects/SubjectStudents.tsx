"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { IconArchive, IconClose, IconEdit, IconPlus, IconRestore, IconSearch } from "@/components/icons";
import { Kpi } from "@/components/ui";
import { FormDialog } from "@/components/ui";
import { formatShort } from "@/lib/dates";
import { useSubjectScope } from "@/lib/subjects/data";
import { nameKey, personKey, personProgress, type Person } from "@/lib/subjects/people";
import { SUBJECTS, type SubjectRecord } from "@/lib/subjects/types";
import { PctBars } from "./PctBars";
import { StudentNameField, useRoster } from "./roster";
import { HW_LABEL, SubjectSaveChip, fmtPct, useStoredGroup } from "./shared";

const ATT = { present: "Keldi", absent: "Kelmadi" } as const;

export function SubjectStudents() {
  const { subject, groups, activeGroups, lessons, records } = useSubjectScope();
  const { people, enroll } = useRoster();
  const router = useRouter();
  const params = useSearchParams();
  const [query, setQuery] = useState("");
  const [groupId, setGroupId] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newGroup, pickNewGroup] = useStoredGroup(subject, activeGroups);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(params.get("p"));

  // One pass over the records, then each person only sees their own.
  const byStudent = useMemo(() => {
    const m = new Map<string, SubjectRecord[]>();
    for (const r of records) m.set(r.student_id, [...(m.get(r.student_id) ?? []), r]);
    return m;
  }, [records]);
  const progressOf = useMemo(() => {
    const cache = new Map<string, ReturnType<typeof personProgress>>();
    return (p: Person) => {
      let v = cache.get(p.key);
      if (!v) {
        v = personProgress(p, groups, lessons, p.memberships.flatMap((m) => byStudent.get(m.id) ?? []));
        cache.set(p.key, v);
      }
      return v;
    };
  }, [groups, lessons, byStudent]);

  const groupName = (id: string) => groups.find((g) => g.id === id)?.name ?? "";
  const visible = useMemo(
    () =>
      people.filter((p) => {
        const live = p.active.length > 0;
        if (!showArchived && !live) return false;
        if (query && !nameKey(p.name).includes(nameKey(query))) return false;
        if (groupId && !(showArchived ? p.memberships : p.active).some((m) => m.group_id === groupId)) return false;
        return true;
      }),
    [people, showArchived, query, groupId],
  );
  const open = openKey ? people.find((p) => p.key === openKey) ?? null : null;
  const activeCount = people.filter((p) => p.active.length > 0).length;
  const formerCount = people.length - activeCount;

  function select(key: string | null) {
    setOpenKey(key);
    router.replace(key ? `${SUBJECTS[subject].path}/students?p=${encodeURIComponent(key)}` : `${SUBJECTS[subject].path}/students`, { scroll: false });
  }

  async function create() {
    if (!newGroup) return;
    setBusy(true);
    setFormError(null);
    const r = await enroll(newGroup.id, newName);
    setBusy(false);
    if (r.ok) {
      setCreating(false);
      setNewName("");
    } else if (r.error) setFormError(r.error);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">O&apos;quvchilar</h1>
          <p className="page-sub">
            {SUBJECTS[subject].label} · {activeCount} ta o&apos;quvchi
          </p>
        </div>
        <div className="page-actions">
          <SubjectSaveChip />
          <button className="btn btn--primary" disabled={activeGroups.length === 0} onClick={() => setCreating(true)} title={activeGroups.length === 0 ? "Avval guruh yarating" : undefined}>
            <IconPlus aria-hidden /> O&apos;quvchi qo&apos;shish
          </button>
        </div>
      </div>

      {people.length === 0 ? (
        <div className="card empty sj-empty">
          <strong>Hali o&apos;quvchi yo&apos;q</strong>
          <p className="hint">{activeGroups.length === 0 ? "Avval guruh yarating, so'ng o'quvchi qo'shing." : "Birinchi o'quvchini qo'shing."}</p>
          {activeGroups.length === 0 ? (
            <Link className="btn btn--primary" href={`${SUBJECTS[subject].path}/groups`}>Guruh yaratish</Link>
          ) : (
            <button className="btn btn--primary" onClick={() => setCreating(true)}><IconPlus aria-hidden /> O&apos;quvchi qo&apos;shish</button>
          )}
        </div>
      ) : (
        <>
          <div className="sj-toolbar">
            <label className="sj-search">
              <IconSearch aria-hidden />
              <input className="input" type="search" value={query} placeholder="Ism bo'yicha qidirish" aria-label="O'quvchini qidirish" onChange={(e) => setQuery(e.target.value)} />
            </label>
            <select className="select sj-toolbar__select" aria-label="Guruh bo'yicha filtr" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              <option value="">Barcha guruhlar</option>
              {groups.filter((g) => showArchived || !g.archived_at).map((g) => <option key={g.id} value={g.id}>{g.name}{g.archived_at ? " (arxiv)" : ""}</option>)}
            </select>
            {formerCount > 0 && (
              <label className="sj-check">
                <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Chiqarilganlar ({formerCount})
              </label>
            )}
          </div>

          {visible.length === 0 ? (
            <div className="card empty sj-empty"><strong>Hech narsa topilmadi</strong><p className="hint">Qidiruv yoki guruh filtrini o&apos;zgartiring.</p></div>
          ) : (
            <ul className="card sj-people" aria-label="O'quvchilar">
              <li className="sj-prow sj-prow--head" aria-hidden>
                <span>O&apos;quvchi</span>
                <span>Guruhlar</span>
                <span>Davomat</span>
                <span>Vazifa</span>
                <span>Test</span>
              </li>
              {visible.map((p) => {
                const pr = progressOf(p);
                return (
                  <li key={p.key}>
                  <button type="button" className="sj-prow" onClick={() => select(p.key)} aria-label={`${p.name}: profilni ochish`}>
                    <span className="sj-who"><Avatar name={p.name} /><span className="sj-name">{p.name}{p.englishStudentId && <span className="chip chip--brand sj-chip">Ingliz tili</span>}{p.active.length === 0 && <span className="chip chip--warn sj-chip">Chiqarilgan</span>}</span></span>
                    <span className="sj-chips">{(p.active.length ? p.active : p.memberships).map((m) => <span className="chip" key={m.id}>{groupName(m.group_id)}</span>)}</span>
                    <span className="sj-m" data-label="Davomat">{fmtPct(pr.attendancePct)}</span>
                    <span className="sj-m" data-label="Vazifa">{fmtPct(pr.homeworkPct)}</span>
                    <span className="sj-m" data-label="Test">{fmtPct(pr.avgTestPct)}</span>
                  </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      <FormDialog
        open={creating}
        title="Yangi o'quvchi"
        submitLabel="Qo'shish"
        busy={busy}
        canSubmit={newName.trim().length > 0 && newGroup !== null}
        onSubmit={() => void create()}
        onCancel={() => { setCreating(false); setNewName(""); setFormError(null); }}
      >
        <label className="field">
          <span className="field__label">Guruh</span>
          <select className="select" value={newGroup?.id ?? ""} onChange={(e) => pickNewGroup(e.target.value)}>
            {activeGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </label>
        <StudentNameField label="Ism familiya" value={newName} groupId={newGroup?.id ?? null} autoFocus onChange={(v) => { setNewName(v); setFormError(null); }} />
        {formError && <span className="sj-err" role="alert">{formError}</span>}
      </FormDialog>

      <PersonDrawer person={open} progress={open ? progressOf(open) : null} onClose={() => select(null)} onRenamed={select} />
    </>
  );
}

function PersonDrawer({ person, progress, onClose, onRenamed }: { person: Person | null; progress: ReturnType<typeof personProgress> | null; onClose: () => void; onRenamed: (key: string) => void }) {
  const { subject, api, groups, activeGroups } = useSubjectScope();
  const { people } = useRoster();
  const ref = useRef<HTMLDialogElement>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [addTo, setAddTo] = useState("");
  const [all, setAll] = useState(false);
  const isOpen = person !== null;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (isOpen && !d.open) d.showModal();
    if (!isOpen && d.open) d.close();
  }, [isOpen]);
  // a different person must not inherit the previous one's half-typed edit
  const key = person?.key;
  useEffect(() => {
    setEditing(null);
    setEditError(null);
    setAddTo("");
    setAll(false);
  }, [key]);

  const gname = (id: string) => groups.find((g) => g.id === id)?.name ?? "";
  const joinable = person ? activeGroups.filter((g) => !person.memberships.some((m) => m.group_id === g.id && !m.archived_at)) : [];

  async function rename() {
    if (!person || editing === null) return;
    const clean = editing.trim().replace(/\s+/g, " ");
    if (!clean) return;
    const clash = people.find((p) => p.key !== person.key && !person.englishStudentId && nameKey(p.name) === nameKey(clean));
    if (clash) return setEditError("Bu ism bilan boshqa o'quvchi bor");
    const ok = await api.renameStudents(person.memberships.map((m) => m.id), clean);
    if (ok) {
      setEditing(null);
      setEditError(null);
      // the name is part of the identity key (unless linked to English), so keep this profile open under the new key
      onRenamed(person.englishStudentId ? person.key : personKey({ name: clean, english_student_id: null }));
    }
  }

  async function join() {
    if (!person || !addTo) return;
    const old = person.memberships.find((m) => m.group_id === addTo && m.archived_at);
    const ok = old ? await api.setStudentArchived(old.id, false) : Boolean(await api.addStudent(subject, addTo, person.name, person.englishStudentId));
    if (ok) setAddTo("");
  }

  const history = progress ? (all ? progress.history : progress.history.slice(0, 15)) : [];

  return (
    <dialog ref={ref} className="drawer sj-drawer" aria-label="O'quvchi profili" onCancel={(e) => { e.preventDefault(); onClose(); }} onClick={(e) => e.target === ref.current && onClose()}>
      {person && progress && (
        <div className="drawer__panel">
          <header className="drawer__head">
            <Avatar name={person.name} />
            <div style={{ minWidth: 0 }}>
              {editing === null ? (
                <>
                  <h2 className="drawer__name">{person.name}</h2>
                  <p className="drawer__sub">{SUBJECTS[subject].label}{person.englishStudentId ? " · Ingliz tili bilan bog'langan" : ""}</p>
                </>
              ) : (
                <form className="sj-inline" onSubmit={(e) => { e.preventDefault(); void rename(); }}>
                  <input className="input" aria-label="O'quvchi ismi" autoFocus value={editing} maxLength={80} onChange={(e) => { setEditing(e.target.value); setEditError(null); }} />
                  <button className="btn btn--primary btn--sm" type="submit" disabled={!editing.trim()}>Saqlash</button>
                  <button className="btn btn--sm" type="button" onClick={() => { setEditing(null); setEditError(null); }}>Bekor</button>
                </form>
              )}
              {editError && <p className="sj-err" role="alert">{editError}</p>}
            </div>
            <span className="sj-inline">
              {editing === null && <button className="icon-btn" aria-label="Ismni o'zgartirish" onClick={() => setEditing(person.name)}><IconEdit /></button>}
              <button className="icon-btn" aria-label="Yopish" onClick={onClose}><IconClose /></button>
            </span>
          </header>

          <div className="kpis sj-kpis">
            <Kpi label="Davomat" value={fmtPct(progress.attendancePct)} note={progress.attendancePct === null ? "belgilanmagan" : `${progress.present} keldi / ${progress.absent} kelmadi`} />
            <Kpi label="Vazifa" value={fmtPct(progress.homeworkPct)} note={progress.homeworkPct === null ? "baholanmagan" : `${progress.submitted} topshirdi / ${progress.notSubmitted} topshirmadi`} />
            <Kpi label="O'rtacha test" value={fmtPct(progress.avgTestPct)} note={progress.tests.length ? `${progress.tests.length} ta test` : "ball kiritilmagan"} />
          </div>

          <section aria-labelledby="sj-mem">
            <h3 className="sj-h2" id="sj-mem">Guruhlar</h3>
            <ul className="sj-members">
              {[...person.memberships].sort((a, b) => Number(Boolean(a.archived_at)) - Number(Boolean(b.archived_at))).map((m) => {
                const g = groups.find((x) => x.id === m.group_id);
                return (
                  <li className="sj-member" key={m.id}>
                    <span className="sj-name">{gname(m.group_id)}{m.archived_at && <span className="chip chip--warn sj-chip">Chiqarilgan</span>}{g?.archived_at && <span className="chip chip--warn sj-chip">Guruh arxivda</span>}</span>
                    {!g?.archived_at && (
                      <button className="btn btn--sm" onClick={() => void api.setStudentArchived(m.id, !m.archived_at)}>
                        {m.archived_at ? <><IconRestore aria-hidden /> Qaytarish</> : <><IconArchive aria-hidden /> Chiqarish</>}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            {joinable.length > 0 && (
              <div className="sj-inline" style={{ marginTop: 8 }}>
                <select className="select" aria-label="Guruhga qo'shish" value={addTo} onChange={(e) => setAddTo(e.target.value)}>
                  <option value="">Guruhga qo&apos;shish…</option>
                  {joinable.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
                <button className="btn btn--primary btn--sm" disabled={!addTo} onClick={() => void join()}>Qo&apos;shish</button>
              </div>
            )}
            <p className="hint" style={{ marginTop: 6 }}>Guruhdan chiqarish davomat va ball tarixini o&apos;chirmaydi; Ingliz tili ma&apos;lumoti o&apos;zgarmaydi.</p>
          </section>

          <section aria-labelledby="sj-tests">
            <h3 className="sj-h2" id="sj-tests">Test natijalari</h3>
            {progress.tests.length === 0 ? <p className="hint">Hali test balli kiritilmagan.</p> : (
              <PctBars label="Test natijalari" items={progress.tests.map((t, i) => ({ key: `${t.date}-${i}`, label: `${formatShort(t.date)} · ${t.score}/${t.max}`, value: t.pct }))} />
            )}
          </section>

          <section aria-labelledby="sj-hist">
            <h3 className="sj-h2" id="sj-hist">Davomat va vazifa tarixi</h3>
            {progress.history.length === 0 ? <p className="hint">Hali yozuv yo&apos;q.</p> : (
              <>
                <div className="sj-scroll">
                  <table className="sj-grid">
                    <thead><tr><th scope="col">Sana</th><th scope="col">Guruh</th><th scope="col">Davomat</th><th scope="col">Vazifa</th><th scope="col">Test</th></tr></thead>
                    <tbody>
                      {history.map((h, i) => (
                        <tr key={`${h.date}-${h.groupName}-${i}`}>
                          <td>{formatShort(h.date)}</td>
                          <td>{h.groupName}</td>
                          <td>{h.attendance ? ATT[h.attendance] : <span className="sj-missing">—</span>}</td>
                          <td>{h.homework ? HW_LABEL[h.homework] : <span className="sj-missing">—</span>}</td>
                          <td>{h.max === null ? <span className="sj-missing">—</span> : h.score === null ? <span className="sj-missing" title="Ball kiritilmagan">kiritilmagan</span> : <>{h.score}/{h.max}<small>{fmtPct(h.scorePct)}</small></>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {progress.history.length > 15 && (
                  <button className="btn btn--sm" style={{ marginTop: 8 }} onClick={() => setAll(!all)}>{all ? "Qisqartirish" : `Hammasini ko'rsatish (${progress.history.length})`}</button>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </dialog>
  );
}
