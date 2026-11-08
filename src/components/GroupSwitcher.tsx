"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { IconArchive, IconEdit, IconMore, IconRestore, IconTrash } from "@/components/icons";
import { ConfirmDialog, FormDialog } from "@/components/ui";

export interface SwitcherGroup {
  id: string;
  name: string;
  archived_at: string | null;
}

interface Props {
  /** Every group of the subject, archived ones included. */
  groups: SwitcherGroup[];
  value: string | null;
  onChange: (id: string) => void;
  /** Active (not archived) students of a group: shown in the archive / delete dialogs. */
  studentCount: (groupId: string) => number;
  onRename: (id: string, name: string) => Promise<boolean>;
  onArchive: (id: string) => Promise<boolean>;
  onRestore: (id: string) => Promise<boolean>;
  /** Permanent deletion. Omit when the subject does not support it at all. */
  onDelete?: (id: string) => Promise<boolean>;
  /** Why a group may not be deleted (empty = safe). Only used with `onDelete`. */
  deleteBlockers?: (id: string) => string[];
  /** Shown instead of the delete dialog when `onDelete` is not supported. */
  deleteUnsupported?: string;
  /** One sentence: what archiving keeps (differs a little per subject). */
  archiveKeeps: string;
}

const MENU_W = 248;

/** Places a top-layer popover under its trigger (fixed, so no scroll container can clip it). */
function place(menu: HTMLElement, trigger: HTMLElement) {
  const r = trigger.getBoundingClientRect();
  const w = Math.min(MENU_W, window.innerWidth - 16);
  menu.style.width = `${w}px`;
  menu.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - w - 8))}px`;
  const below = r.bottom + 6;
  const h = menu.offsetHeight;
  menu.style.top = `${below + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 6) : below}px`;
}

function useMenu() {
  const id = useId();
  const menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const m = menu.current;
    if (!m) return;
    const onToggle = (e: Event) => {
      const isOpen = (e as ToggleEvent).newState === "open";
      setOpen(isOpen);
      if (isOpen && trigger.current) {
        place(m, trigger.current);
        m.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
      }
    };
    m.addEventListener("toggle", onToggle);
    return () => m.removeEventListener("toggle", onToggle);
  }, []);

  const close = () => menu.current?.hidePopover();
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
    const items = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    if (!items.length) return;
    e.preventDefault();
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : (i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[next].focus();
  };
  return { id, menu, trigger, open, close, onKeyDown };
}

type Dialog = null | "rename" | "archive" | "delete" | "blocked" | "unsupported";

/**
 * Group tabs with a visible "..." action menu next to every group name (never hover-only), plus a list of archived
 * groups that can be restored. Archiving only sets `archived_at`: students, lessons, attendance, homework, coins,
 * rankings and mock results stay exactly as they are.
 */
export function GroupSwitcher(p: Props) {
  const active = p.groups.filter((g) => !g.archived_at);
  const archived = p.groups.filter((g) => g.archived_at);
  return (
    <div className="gtabs" role="group" aria-label="Guruhlar">
      {active.map((g) => (
        <GroupTab key={g.id} group={g} selected={g.id === p.value} others={active.filter((x) => x.id !== g.id)} p={p} />
      ))}
      {archived.length > 0 && <ArchivedGroups archived={archived} p={p} />}
    </div>
  );
}

function GroupTab({ group, selected, others, p }: { group: SwitcherGroup; selected: boolean; others: SwitcherGroup[]; p: Props }) {
  const m = useMenu();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [title, setTitle] = useState(group.name);
  const [busy, setBusy] = useState(false);
  const students = p.studentCount(group.id);
  const reasons = p.onDelete ? (p.deleteBlockers?.(group.id) ?? []) : [];
  const clash = others.some((o) => o.name.trim().toLowerCase() === title.trim().toLowerCase());
  const unchanged = title.trim() === group.name;

  async function run(fn: () => Promise<boolean>) {
    setBusy(true);
    const ok = await fn();
    setBusy(false);
    if (ok) setDialog(null);
  }

  function pick(next: Dialog) {
    m.close();
    if (next === "rename") setTitle(group.name);
    setDialog(next);
  }

  return (
    <div className="gtab" data-selected={selected || undefined}>
      <button type="button" className="gtab__btn" aria-pressed={selected} onClick={() => p.onChange(group.id)}>
        {group.name}
      </button>
      <button
        ref={m.trigger}
        type="button"
        className="gtab__more"
        aria-label={`${group.name}: guruh amallari`}
        aria-haspopup="menu"
        aria-expanded={m.open}
        popoverTarget={m.id}
      >
        <IconMore aria-hidden />
      </button>
      <div ref={m.menu} id={m.id} className="gmenu" popover="auto" role="menu" aria-label={`${group.name} amallari`} onKeyDown={m.onKeyDown}>
        <button type="button" role="menuitem" className="gmenu__item" onClick={() => pick("rename")}>
          <IconEdit aria-hidden /> Guruhni tahrirlash
        </button>
        <button type="button" role="menuitem" className="gmenu__item" onClick={() => pick("archive")}>
          <IconArchive aria-hidden /> Guruhni arxivlash
        </button>
        <div className="gmenu__sep" role="separator" />
        <button
          type="button"
          role="menuitem"
          className="gmenu__item gmenu__item--danger"
          aria-disabled={reasons.length > 0 || !p.onDelete ? true : undefined}
          onClick={() => pick(!p.onDelete ? "unsupported" : reasons.length > 0 ? "blocked" : "delete")}
        >
          <IconTrash aria-hidden /> Guruhni o&apos;chirish
          {(reasons.length > 0 || !p.onDelete) && <small>Tarix bor — arxivlang</small>}
        </button>
      </div>

      <FormDialog
        open={dialog === "rename"}
        title="Guruhni tahrirlash"
        submitLabel="Saqlash"
        busy={busy}
        canSubmit={title.trim().length > 0 && !unchanged && !clash}
        onSubmit={() => void run(() => p.onRename(group.id, title.trim()))}
        onCancel={() => setDialog(null)}
      >
        <label className="field">
          <span className="field__label">Guruh nomi</span>
          <input className="input" autoFocus value={title} maxLength={60} aria-invalid={clash || undefined} onChange={(e) => setTitle(e.target.value)} />
          {clash && <span className="sj-err">Bu nomdagi faol guruh allaqachon bor</span>}
        </label>
        <p className="hint">Faqat nom o&apos;zgaradi. O&apos;quvchilar, davomat va baholar joyida qoladi.</p>
      </FormDialog>

      <ConfirmDialog
        open={dialog === "archive"}
        title={`“${group.name}” guruhini arxivlash?`}
        confirmLabel={busy ? "Saqlanmoqda…" : "Arxivlash"}
        onCancel={() => setDialog(null)}
        onConfirm={() => void run(() => p.onArchive(group.id))}
      >
        <span className="stack" style={{ gap: 6 }}>
          <span>
            Guruhda <b>{students}</b> ta faol o&apos;quvchi bor. Guruh jurnal tablaridan yashiriladi.
          </span>
          <span>{p.archiveKeeps}</span>
          <span>Istalgan payt &quot;Arxiv&quot; ro&apos;yxatidan tiklash mumkin.</span>
        </span>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === "blocked"}
        title="Guruhni o'chirib bo'lmaydi"
        confirmLabel="Arxivlash"
        onCancel={() => setDialog(null)}
        onConfirm={() => setDialog("archive")}
      >
        <span className="stack" style={{ gap: 6 }}>
          <span>
            “{group.name}” guruhida tarix bor, doimiy o&apos;chirish uni yo&apos;qotardi:
          </span>
          <ul className="gdialog__list">
            {reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <span>Xavfsiz yo&apos;l — arxivlash: hech narsa o&apos;chmaydi va guruhni qaytarish mumkin.</span>
        </span>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === "unsupported"}
        title="Guruhni o'chirib bo'lmaydi"
        confirmLabel="Arxivlash"
        onCancel={() => setDialog(null)}
        onConfirm={() => setDialog("archive")}
      >
        {p.deleteUnsupported ?? "Bu fanda guruhni doimiy o'chirish yo'q."} Xavfsiz yo&apos;l — arxivlash.
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === "delete"}
        title={`“${group.name}” guruhini o'chirasizmi?`}
        confirmLabel={busy ? "O'chirilmoqda…" : "Doimiy o'chirish"}
        danger
        onCancel={() => setDialog(null)}
        onConfirm={() => void run(() => p.onDelete!(group.id))}
      >
        <span className="stack" style={{ gap: 6 }}>
          <span>
            Guruh: <b>{group.name}</b> · O&apos;quvchilar: <b>{students}</b> ta
          </span>
          <span>Guruh to&apos;liq bo&apos;sh: o&apos;quvchi, dars rejasi, vazifa va tarix yozuvlari yo&apos;q. O&apos;chirish qaytarilmaydi.</span>
        </span>
      </ConfirmDialog>
    </div>
  );
}

function ArchivedGroups({ archived, p }: { archived: SwitcherGroup[]; p: Props }) {
  const m = useMenu();
  const [busyId, setBusyId] = useState<string | null>(null);
  return (
    <div className="gtab gtab--archive">
      <button ref={m.trigger} type="button" className="gtab__btn gtab__btn--ghost" aria-haspopup="menu" aria-expanded={m.open} popoverTarget={m.id}>
        <IconArchive aria-hidden /> Arxiv · {archived.length}
      </button>
      <div ref={m.menu} id={m.id} className="gmenu" popover="auto" role="menu" aria-label="Arxivdagi guruhlar" onKeyDown={m.onKeyDown}>
        {archived.map((g) => (
          <div className="gmenu__row" key={g.id}>
            <span className="gmenu__name" title={g.name}>
              {g.name}
            </span>
            <button
              type="button"
              role="menuitem"
              className="btn btn--sm"
              disabled={busyId === g.id}
              aria-label={`${g.name}: guruhni tiklash`}
              onClick={() => {
                setBusyId(g.id);
                void p.onRestore(g.id).then((ok) => {
                  setBusyId(null);
                  if (ok) m.close();
                });
              }}
            >
              <IconRestore aria-hidden /> Guruhni tiklash
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
