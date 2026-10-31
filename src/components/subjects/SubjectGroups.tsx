"use client";

import { useMemo, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { IconArchive, IconEdit, IconPlus, IconRestore } from "@/components/icons";
import { ConfirmDialog } from "@/components/ui";
import { useData } from "@/lib/data";
import { useSubjectScope } from "@/lib/subjects/data";
import { SUBJECTS } from "@/lib/subjects/types";
import { GroupTabs, SubjectSaveChip, useStoredGroup } from "./shared";

export function SubjectGroups() {
  const { subject, api, groups, students, activeGroups } = useSubjectScope();
  const english = useData().activeStudents; // read-only: used only to LINK an existing person, never modified
  const [showArchived, setShowArchived] = useState(false);
  const visible = showArchived ? groups : activeGroups;
  const [group, pick] = useStoredGroup(subject, visible);

  const [newGroup, setNewGroup] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [newStudent, setNewStudent] = useState("");
  const [linkId, setLinkId] = useState("");
  const [renamingStudent, setRenamingStudent] = useState<{ id: string; name: string } | null>(null);

  const roster = useMemo(
    () => (group ? students.filter((s) => s.group_id === group.id && (showArchived || !s.archived_at)).sort((a, b) => a.name.localeCompare(b.name, "uz")) : []),
    [students, group, showArchived],
  );
  const linkable = useMemo(
    () => english.filter((e) => !roster.some((s) => s.english_student_id === e.id)).sort((a, b) => a.name.localeCompare(b.name, "uz")),
    [english, roster],
  );

  async function createGroup() {
    const name = newGroup.trim();
    if (!name) return;
    const g = await api.addGroup(subject, name);
    if (g) {
      setNewGroup("");
      pick(g.id);
    }
  }
  async function createStudent() {
    if (!group) return;
    const link = english.find((e) => e.id === linkId);
    const name = (link ? link.name : newStudent).trim();
    if (!name) return;
    const s = await api.addStudent(subject, group.id, name, link?.id ?? null);
    if (s) {
      setNewStudent("");
      setLinkId("");
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Guruhlar va o&apos;quvchilar</h1>
          <p className="page-sub">{SUBJECTS[subject].label} · {activeGroups.length} ta faol guruh</p>
        </div>
        <div className="page-actions">
          <SubjectSaveChip />
          <label className="sj-check"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Arxivdagilar</label>
        </div>
      </div>

      <form className="card card--pad sj-add" onSubmit={(e) => { e.preventDefault(); void createGroup(); }}>
        <label className="field" style={{ flex: 1 }}>
          <span className="field__label">Yangi guruh</span>
          <input className="input" value={newGroup} maxLength={60} placeholder={`Masalan: ${SUBJECTS[subject].label} 1`} onChange={(e) => setNewGroup(e.target.value)} />
        </label>
        <button className="btn btn--primary" type="submit" disabled={!newGroup.trim()}><IconPlus aria-hidden /> Guruh qo&apos;shish</button>
      </form>

      {visible.length === 0 ? (
        <div className="card empty" style={{ marginTop: 12 }}><strong>Hali guruh yo&apos;q</strong><p className="hint">Yuqorida birinchi guruhni yarating.</p></div>
      ) : (
        <>
          <div style={{ margin: "12px 0" }}><GroupTabs groups={visible} value={group?.id ?? null} onChange={pick} /></div>
          {group && (
            <div className="card">
              <div className="sj-group-head">
                {renaming !== null ? (
                  <form className="sj-inline" onSubmit={(e) => { e.preventDefault(); void api.renameGroup(group.id, renaming).then((ok) => ok && setRenaming(null)); }}>
                    <input className="input" aria-label="Guruh nomi" autoFocus value={renaming} maxLength={60} onChange={(e) => setRenaming(e.target.value)} />
                    <button className="btn btn--primary btn--sm" type="submit" disabled={!renaming.trim()}>Saqlash</button>
                    <button className="btn btn--sm" type="button" onClick={() => setRenaming(null)}>Bekor</button>
                  </form>
                ) : (
                  <>
                    <h2 className="sj-group-name">{group.name}{group.archived_at && <span className="chip chip--warn" style={{ marginLeft: 8 }}>Arxivda</span>}</h2>
                    <div className="sj-inline">
                      <button className="btn btn--sm" onClick={() => setRenaming(group.name)}><IconEdit aria-hidden /> Nomini o&apos;zgartirish</button>
                      {group.archived_at ? (
                        <button className="btn btn--sm" onClick={() => void api.setGroupArchived(group.id, false)}><IconRestore aria-hidden /> Tiklash</button>
                      ) : (
                        <button className="btn btn--sm" onClick={() => setConfirmArchive(true)}><IconArchive aria-hidden /> Arxivlash</button>
                      )}
                    </div>
                  </>
                )}
              </div>

              {!group.archived_at && (
                <form className="sj-add sj-add--student" onSubmit={(e) => { e.preventDefault(); void createStudent(); }}>
                  <label className="field" style={{ flex: 1 }}>
                    <span className="field__label">Yangi o&apos;quvchi</span>
                    <input className="input" value={linkId ? english.find((x) => x.id === linkId)?.name ?? "" : newStudent} disabled={Boolean(linkId)} maxLength={80} placeholder="Ism familiya" onChange={(e) => setNewStudent(e.target.value)} />
                  </label>
                  <label className="field" style={{ flex: 1 }}>
                    <span className="field__label">yoki mavjud o&apos;quvchi (Ingliz tili)</span>
                    <select className="select" value={linkId} onChange={(e) => setLinkId(e.target.value)} aria-label="Mavjud o'quvchi">
                      <option value="">— yangi o&apos;quvchi —</option>
                      {linkable.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                  </label>
                  <button className="btn btn--primary" type="submit" disabled={!linkId && !newStudent.trim()}><IconPlus aria-hidden /> Qo&apos;shish</button>
                </form>
              )}

              {roster.length === 0 ? (
                <div className="empty"><strong>Guruhda o&apos;quvchi yo&apos;q</strong></div>
              ) : (
                <ul className="roster">
                  {roster.map((s) => (
                    <li className="sj-student" key={s.id}>
                      <span className="sj-who"><Avatar name={s.name} />
                        {renamingStudent?.id === s.id ? (
                          <form className="sj-inline" onSubmit={(e) => { e.preventDefault(); void api.renameStudent(s.id, renamingStudent.name).then((ok) => ok && setRenamingStudent(null)); }}>
                            <input className="input" aria-label="O'quvchi ismi" autoFocus value={renamingStudent.name} maxLength={80} onChange={(e) => setRenamingStudent({ id: s.id, name: e.target.value })} />
                            <button className="btn btn--primary btn--sm" type="submit" disabled={!renamingStudent.name.trim()}>Saqlash</button>
                            <button className="btn btn--sm" type="button" onClick={() => setRenamingStudent(null)}>Bekor</button>
                          </form>
                        ) : (
                          <span className="sj-name">{s.name}{s.english_student_id && <span className="chip chip--brand" style={{ marginLeft: 8 }} title="Ingliz tili o'quvchisi bilan bog'langan">Ingliz tili</span>}{s.archived_at && <span className="chip chip--warn" style={{ marginLeft: 8 }}>Arxivda</span>}</span>
                        )}
                      </span>
                      {renamingStudent?.id !== s.id && (
                        <span className="sj-inline">
                          {!s.archived_at && activeGroups.filter((g) => g.id !== group.id).length > 0 && (
                            <select className="select sj-move" aria-label={`${s.name}: boshqa guruhga qo'shish`} value="" onChange={(e) => e.target.value && void api.addStudent(subject, e.target.value, s.name, s.english_student_id)}>
                              <option value="">Boshqa guruhga qo&apos;shish…</option>
                              {activeGroups.filter((g) => g.id !== group.id).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                            </select>
                          )}
                          <button className="icon-btn" aria-label={`${s.name}: ismni o'zgartirish`} onClick={() => setRenamingStudent({ id: s.id, name: s.name })}><IconEdit /></button>
                          <button className="icon-btn" aria-label={s.archived_at ? `${s.name}: tiklash` : `${s.name}: arxivlash`} onClick={() => void api.setStudentArchived(s.id, !s.archived_at)}>{s.archived_at ? <IconRestore /> : <IconArchive />}</button>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <p className="hint" style={{ padding: "8px 16px 12px" }}>Arxivlash ma&apos;lumotni o&apos;chirmaydi: davomat va ballar tarixi saqlanadi. O&apos;quvchini boshqa guruhga ko&apos;chirish uchun uni u yerga qo&apos;shing va eskisini arxivlang.</p>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirmArchive}
        title={`"${group?.name ?? ""}" guruhini arxivlash?`}
        confirmLabel="Arxivlash"
        onCancel={() => setConfirmArchive(false)}
        onConfirm={() => { setConfirmArchive(false); if (group) void api.setGroupArchived(group.id, true); }}
      >
        Guruh jurnal va statistikadan yashiriladi. Barcha davomat, vazifa va ball yozuvlari saqlanadi, istalgan payt tiklash mumkin.
      </ConfirmDialog>
    </>
  );
}
