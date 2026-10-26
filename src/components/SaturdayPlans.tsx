"use client";

import { useMemo, useState, type FormEvent } from "react";
import { IconCalendar, IconChevronDown, IconTrash } from "@/components/icons";
import { useData } from "@/lib/data";
import { addDays, formatDate, todayISO } from "@/lib/dates";
import { SATURDAY_MODES, isSaturday, saturdayModeFor, type SaturdayMode, type SaturdayPlan, type SaturdayScope } from "@/lib/stages";
import { useStages } from "@/lib/stagesData";

const SCOPES: { id: SaturdayScope; label: string }[] = [
  { id: "default", label: "Hamma uchun (standart)" },
  { id: "program", label: "O‘quv dasturi" },
  { id: "group", label: "Guruh" },
  { id: "student", label: "Alohida o‘quvchi" },
];

const modeLabel = (m: SaturdayMode) => SATURDAY_MODES.find((x) => x.id === m)?.label ?? m;

function nextSaturday(from: string): string {
  let d = from;
  for (let i = 0; i < 7 && !isSaturday(d); i++) d = addDays(d, 1);
  return d;
}

/**
 * Saturday is configurable per default / program / group / student (every Saturday or one date).
 * Nothing configured = ordinary lesson, exactly as before. IELTS/CEFR mock data is never touched here.
 */
export function SaturdayPlans() {
  const { groups, activeGroups, activeStudents } = useData();
  const { programs, plans, savePlan, deletePlan } = useStages();
  const [scope, setScope] = useState<SaturdayScope>("group");
  const [target, setTarget] = useState("");
  const [when, setWhen] = useState<"every" | "date">("every");
  const [date, setDate] = useState(nextSaturday(todayISO()));
  const [mode, setMode] = useState<SaturdayMode>("mock");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const targets = useMemo(() => {
    if (scope === "program") return programs.map((p) => ({ id: p.id, label: p.name }));
    if (scope === "group") return activeGroups.map((g) => ({ id: g.id, label: g.name }));
    if (scope === "student") return [...activeStudents].sort((a, b) => a.name.localeCompare(b.name)).map((s) => ({ id: s.id, label: s.name }));
    return [];
  }, [scope, programs, activeGroups, activeStudents]);

  const nameOf = (p: SaturdayPlan) => {
    if (p.scope === "default") return "Hamma uchun";
    if (p.scope === "program") return programs.find((x) => x.id === p.program_id)?.name ?? "Dastur";
    if (p.scope === "group") return groups.find((x) => x.id === p.group_id)?.name ?? "Guruh";
    return activeStudents.find((x) => x.id === p.student_id)?.name ?? "O‘quvchi";
  };

  const canSave = (scope === "default" || Boolean(target)) && (when === "every" || (Boolean(date) && isSaturday(date)));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setBusy(true);
    const ok = await savePlan({
      scope,
      program_id: scope === "program" ? target : null,
      group_id: scope === "group" ? target : null,
      student_id: scope === "student" ? target : null,
      on_date: when === "date" ? date : null,
      mode,
      note,
    });
    setBusy(false);
    if (ok) setNote("");
  }

  const upcoming = nextSaturday(todayISO());
  const sorted = [...plans].sort((a, b) => (a.on_date ?? "").localeCompare(b.on_date ?? "") || a.scope.localeCompare(b.scope));
  const individual = plans.some((p) => p.scope === "student");

  return (
    <details className="card sat">
      <summary className="sat__sum">
        <IconCalendar aria-hidden />
        <span>
          <strong>Shanba rejimi</strong>
          <small>Dars, mock, mini-test yoki mashg‘ulotsiz — guruh, dastur yoki o‘quvchi uchun</small>
        </span>
        <IconChevronDown aria-hidden className="sat__chev" />
      </summary>

      <div className="sat__body stack">
        <p className="hint">
          Sozlanmagan bo‘lsa, shanba oddiy dars hisoblanadi. Mock yoki mini-test belgilangan shanba kitob progressidagi darslar soniga qo‘shilmaydi; mock topshirmagan o‘quvchiga 0 qo‘yilmaydi.
        </p>

        <div className="sat__upcoming" aria-label="Keyingi shanba">
          <strong>Keyingi shanba · {formatDate(upcoming)}</strong>
          <ul>
            {activeGroups.map((g) => {
              const m = saturdayModeFor(plans, { studentId: "-", groupId: g.id, programId: null, date: upcoming });
              return (
                <li key={g.id}>
                  <span>{g.name}</span>
                  <span className={`chip ${m && m !== "lesson" ? "chip--brand" : ""}`}>{m ? modeLabel(m) : "Oddiy dars"}</span>
                </li>
              );
            })}
          </ul>
          {individual && <small className="hint">Alohida o‘quvchilar uchun istisnolar ham mavjud.</small>}
        </div>

        {sorted.length > 0 && (
          <ul className="sat__rules" aria-label="Qoidalar">
            {sorted.map((p) => (
              <li key={p.id}>
                <span>
                  <strong>{nameOf(p)}</strong>
                  <small className="hint">
                    {SCOPES.find((s) => s.id === p.scope)?.label} · {p.on_date ? formatDate(p.on_date) : "har shanba"}
                    {p.note ? ` · ${p.note}` : ""}
                  </small>
                </span>
                <span className="chip chip--brand">{modeLabel(p.mode)}</span>
                <button className="icon-btn icon-btn--bare" aria-label={`${nameOf(p)}: qoidani o‘chirish`} onClick={() => void deletePlan(p.id)}>
                  <IconTrash aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}

        <form className="sat__form" onSubmit={submit}>
          <label className="field">
            <span className="field__label">Kim uchun</span>
            <select className="select" value={scope} onChange={(e) => { setScope(e.target.value as SaturdayScope); setTarget(""); }}>
              {SCOPES.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </label>
          {scope !== "default" && (
            <label className="field">
              <span className="field__label">Tanlang</span>
              <select className="select" value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">—</option>
                {targets.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </label>
          )}
          <label className="field">
            <span className="field__label">Qachon</span>
            <select className="select" value={when} onChange={(e) => setWhen(e.target.value as "every" | "date")}>
              <option value="every">Har shanba</option>
              <option value="date">Aniq sana</option>
            </select>
          </label>
          {when === "date" && (
            <label className="field">
              <span className="field__label">Shanba sanasi</span>
              <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-invalid={Boolean(date) && !isSaturday(date)} />
              {date && !isSaturday(date) && <span className="form-error">Bu sana shanba emas.</span>}
            </label>
          )}
          <label className="field">
            <span className="field__label">Rejim</span>
            <select className="select" value={mode} onChange={(e) => setMode(e.target.value as SaturdayMode)}>
              {SATURDAY_MODES.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </label>
          <label className="field sat__note">
            <span className="field__label">Izoh (ixtiyoriy)</span>
            <input className="input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Masalan: yoshiga mos test" />
          </label>
          <div className="sat__submit">
            <button className="btn btn--primary" type="submit" disabled={!canSave || busy}>
              {busy ? "Saqlanmoqda…" : "Qoidani saqlash"}
            </button>
          </div>
        </form>
      </div>
    </details>
  );
}
