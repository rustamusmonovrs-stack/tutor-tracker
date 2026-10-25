"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { MockScoreInput } from "@/components/MockScoreInput";
import { IconAlert, IconCheck, IconChevronLeft, IconEdit, IconPlus, IconTrash } from "@/components/icons";
import { ConfirmDialog, Kpi, Meter } from "@/components/ui";
import { useData } from "@/lib/data";
import { formatShort } from "@/lib/dates";
import {
  buildRanking,
  buildRows,
  buildStats,
  finishProblems,
  formatPct,
  type MockAttendance,
  type MockPayment,
  type MockResult,
  type MockScore,
  type MockSection,
  type Row,
} from "@/lib/mock";
import { useMockStore, type MockStore } from "@/lib/mockData";

const PAYMENT_LABEL: Record<MockPayment, string> = { paid: "To'langan", unpaid: "To'lanmagan" };

function SaveState({ store }: { store: MockStore }) {
  const [recent, setRecent] = useState(false);
  useEffect(() => {
    if (!store.lastSavedAt) return;
    setRecent(true);
    const t = setTimeout(() => setRecent(false), 2200);
    return () => clearTimeout(t);
  }, [store.lastSavedAt]);
  if (store.pending > 0)
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

function Toggle<T extends string>({
  value,
  options,
  label,
  disabled,
  onChange,
}: {
  value: T | null;
  options: { id: T; label: string; tone: "ok" | "bad" }[];
  label: string;
  disabled?: boolean;
  onChange: (v: T | null) => void;
}) {
  return (
    <div className="mock-tg" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className={`mock-tg__btn mock-tg__btn--${o.tone}`}
          aria-pressed={value === o.id}
          disabled={disabled}
          onClick={() => onChange(value === o.id ? null : o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const ATT_OPTIONS = [
  { id: "present", label: "Keldi", tone: "ok" },
  { id: "absent", label: "Kelmadi", tone: "bad" },
] as const;
const PAY_OPTIONS = [
  { id: "paid", label: "To'langan", tone: "ok" },
  { id: "unpaid", label: "To'lanmagan", tone: "bad" },
] as const;

export default function MockDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { students, activeStudents, groups, notify } = useData();
  const store = useMockStore();

  const mock = store.mocks.find((m) => m.id === id);
  const [editing, setEditing] = useState(false);
  const [live, setLive] = useState<Record<string, number | null>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [typed, setTyped] = useState("");
  const [deleteError, setDeleteError] = useState(false);

  const sections: MockSection[] = useMemo(
    () => store.sections.filter((s) => s.mock_id === id).sort((a, b) => a.position - b.position),
    [store.sections, id],
  );
  const results: MockResult[] = useMemo(() => store.results.filter((r) => r.mock_id === id), [store.results, id]);

  const nameOf = useMemo(() => {
    const m = new Map(students.map((s) => [s.id, s.name]));
    return (sid: string) => m.get(sid) ?? "Noma'lum o'quvchi";
  }, [students]);

  // Stored scores with the cells being typed right now layered on top (real-time overall).
  const effectiveScores: MockScore[] = useMemo(() => {
    const ids = new Set(results.map((r) => r.id));
    const base = store.scores.filter((s) => ids.has(s.result_id));
    const keys = Object.keys(live);
    if (!keys.length) return base;
    const out = base.filter((s) => !(`${s.result_id}:${s.section_id}` in live));
    for (const k of keys) {
      const v = live[k];
      if (v === null) continue;
      const [result_id, section_id] = k.split(":");
      out.push({ id: `live-${k}`, result_id, section_id, correct: v });
    }
    return out;
  }, [store.scores, results, live]);

  const rows: Row[] = useMemo(
    () => buildRows(sections, results, effectiveScores, nameOf).sort((a, b) => a.name.localeCompare(b.name, "uz")),
    [sections, results, effectiveScores, nameOf],
  );
  const stats = useMemo(() => buildStats(rows), [rows]);
  const ranking = useMemo(() => buildRanking(rows), [rows]);

  const missing = useMemo(() => {
    if (!mock) return [];
    const have = new Set(results.map((r) => r.student_id));
    return activeStudents.filter((s) => s.group_id === mock.group_id && !have.has(s.id));
  }, [mock, results, activeStudents]);

  if (store.status === "loading") {
    return (
      <div className="stack" aria-busy="true" aria-label="Yuklanmoqda">
        <div className="skeleton" style={{ height: 48, width: "50%" }} />
        <div className="skeleton" style={{ height: 90 }} />
        <div className="skeleton" style={{ height: 280 }} />
      </div>
    );
  }
  if (store.status === "error") {
    return (
      <div className="card card--pad stack" role="alert">
        <div>
          <strong>Mock yuklanmadi</strong>
          <p className="hint" style={{ marginTop: 6 }}>
            {store.error}
          </p>
        </div>
        <div>
          <button className="btn btn--primary" onClick={() => void store.reload()}>
            Qayta urinish
          </button>
        </div>
      </div>
    );
  }
  if (!mock) {
    return (
      <div className="card empty">
        <strong>Mock topilmadi.</strong>
        <p>U o&apos;chirilgan yoki havola noto&apos;g&apos;ri bo&apos;lishi mumkin.</p>
        <p style={{ marginTop: 14 }}>
          <Link className="btn btn--primary" href="/mock">
            Mocklar ro&apos;yxati
          </Link>
        </p>
      </div>
    );
  }

  const groupName = groups.find((g) => g.id === mock.group_id)?.name ?? "Guruh";
  const completed = mock.status === "completed";
  const entryMode = !completed || editing;
  const maxQuestions = sections.reduce((a, s) => a + s.total_questions, 0);

  const check = (): string | null => {
    const p = finishProblems(rows);
    const parts: string[] = [];
    if (p.unmarked) parts.push(`${p.unmarked} ta o'quvchining qatnashuvi belgilanmagan`);
    if (p.incomplete) parts.push(`${p.incomplete} ta qatnashgan o'quvchining ballari to'liq emas`);
    return parts.length ? parts.join("; ") + "." : null;
  };

  const onFinish = () => {
    const msg = check();
    setProblem(msg);
    if (!msg) setConfirmFinish(true);
  };

  const onLeaveEdit = () => {
    const msg = check();
    setProblem(msg);
    if (!msg) setEditing(false);
  };

  const liveKey = (r: string, s: string) => `${r}:${s}`;
  const setLiveCell = (r: string, s: string, v: number | null | undefined) =>
    setLive((cur) => {
      const k = liveKey(r, s);
      if (v === undefined) {
        if (!(k in cur)) return cur;
        const { [k]: _gone, ...rest } = cur;
        void _gone;
        return rest;
      }
      return { ...cur, [k]: v };
    });

  return (
    <>
      <div className="page-head">
        <div style={{ minWidth: 0 }}>
          <Link href="/mock" className="mock-back">
            <IconChevronLeft aria-hidden /> Mock imtihonlari
          </Link>
          <h1 className="page-title">{mock.name}</h1>
          <p className="page-sub">
            {groupName} · {formatShort(mock.mock_date)} {mock.mock_date.slice(0, 4)} · {sections.length} bo&apos;lim ·{" "}
            {maxQuestions} savol{" "}
            <span className={`chip ${completed ? "chip--ok" : "chip--warn"}`} style={{ marginLeft: 6 }}>
              {completed ? "Yakunlangan" : "Jarayonda"}
            </span>
          </p>
        </div>
        <div className="page-actions">
          <SaveState store={store} />
          {!completed && (
            <button className="btn btn--primary" onClick={onFinish}>
              <IconCheck aria-hidden /> Tugatish
            </button>
          )}
          {completed && !editing && (
            <button className="btn" onClick={() => setEditing(true)}>
              <IconEdit aria-hidden /> Tahrirlash
            </button>
          )}
          {completed && editing && (
            <button className="btn btn--primary" onClick={onLeaveEdit}>
              <IconCheck aria-hidden /> Tahrirlashni tugatish
            </button>
          )}
          <button
            className="btn btn--ghost"
            aria-label="Mockni o'chirish"
            onClick={() => {
              setTyped("");
              setDeleteError(false);
              setConfirmDelete(true);
            }}
          >
            <IconTrash aria-hidden />
          </button>
        </div>
      </div>

      {completed && editing && (
        <div className="mock-banner" role="status">
          <IconEdit aria-hidden /> Tahrirlash rejimi: o&apos;zgarishlar avtomatik saqlanadi va natijalar qayta hisoblanadi.
        </div>
      )}
      {problem && (
        <div className="mock-banner mock-banner--bad" role="alert">
          <IconAlert aria-hidden /> {problem}
        </div>
      )}

      <div className="kpis mock-kpis">
        <Kpi label="Jami o'quvchilar" value={stats.total} />
        <Kpi
          label="Qatnashganlar"
          value={stats.present}
          note={stats.attendanceUnmarked ? `${stats.attendanceUnmarked} ta belgilanmagan` : undefined}
        />
        <Kpi label="Qatnashmaganlar" value={stats.absent} />
        <Kpi
          label="To'lov qilganlar"
          value={stats.paid}
          note={stats.paymentUnmarked ? `${stats.paymentUnmarked} ta belgilanmagan` : undefined}
        />
        <Kpi label="To'lov qilmaganlar" value={stats.unpaid} />
        <Kpi
          label="O'rtacha overall"
          value={stats.avgPct === null ? "—" : formatPct(stats.avgPct)}
          note={stats.avgPct === null ? "to'liq baholanganlar yo'q" : undefined}
        />
        <Kpi
          label="Eng yuqori"
          value={stats.topPct === null ? "—" : formatPct(stats.topPct)}
          note={stats.topNames.length ? stats.topNames.join(", ") : undefined}
        />
      </div>

      {entryMode && missing.length > 0 && !completed && (
        <div className="mock-banner">
          <span>Guruhda mockda yo&apos;q {missing.length} ta o&apos;quvchi bor.</span>
          <button className="btn btn--sm" onClick={() => void store.addStudents(mock.id, missing.map((s) => s.id))}>
            <IconPlus aria-hidden /> Qo&apos;shish
          </button>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="card empty">
          <strong>Bu mockda o&apos;quvchi yo&apos;q.</strong>
          <p>Guruhga o&apos;quvchi qo&apos;shilgan bo&apos;lsa, yuqoridagi “Qo&apos;shish” tugmasidan foydalaning.</p>
        </div>
      ) : entryMode ? (
        <div className="card mock-tablewrap">
          <table className="mock-table">
            <thead>
              <tr>
                <th className="mock-col-n">#</th>
                <th className="mock-col-name">O&apos;quvchi</th>
                <th>To&apos;lov</th>
                <th>Qatnashuv</th>
                {sections.map((s) => (
                  <th key={s.id} className="mock-col-score">
                    {s.name}
                    <small>/ {s.total_questions}</small>
                  </th>
                ))}
                <th className="mock-col-num">Jami</th>
                <th className="mock-col-num">Overall</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const present = r.result.attendance === "present";
                return (
                  <tr key={r.result.id} className={r.result.attendance === "absent" ? "is-absent" : undefined}>
                    <td className="mock-col-n" data-label="#">
                      {i + 1}
                    </td>
                    <td className="mock-col-name">{r.name}</td>
                    <td data-label="To'lov">
                      <Toggle
                        value={r.result.payment}
                        options={PAY_OPTIONS as unknown as { id: MockPayment; label: string; tone: "ok" | "bad" }[]}
                        label={`To'lov: ${r.name}`}
                        onChange={(v) => void store.setPayment(r.result.id, v)}
                      />
                    </td>
                    <td data-label="Qatnashuv">
                      <Toggle
                        value={r.result.attendance}
                        options={ATT_OPTIONS as unknown as { id: MockAttendance; label: string; tone: "ok" | "bad" }[]}
                        label={`Qatnashuv: ${r.name}`}
                        onChange={(v) => void store.setAttendance(r.result.id, v)}
                      />
                    </td>
                    {sections.map((s) => (
                      <td key={s.id} className="mock-col-score" data-label={`${s.name} / ${s.total_questions}`}>
                        <MockScoreInput
                          value={store.scores.find((x) => x.result_id === r.result.id && x.section_id === s.id)?.correct}
                          max={s.total_questions}
                          disabled={!present}
                          label={`${r.name}, ${s.name}`}
                          onLive={(v) => setLiveCell(r.result.id, s.id, v)}
                          onCommit={(v) => void store.saveScore(r.result.id, s.id, v)}
                          onInvalid={(m) => notify(m, { kind: "error" })}
                        />
                      </td>
                    ))}
                    <td className="mock-col-num" data-label="Jami">
                      {present && r.totals.entered > 0 ? `${r.totals.correct}/${r.totals.total}` : "—"}
                    </td>
                    <td className="mock-col-num" data-label="Overall">
                      {!present ? (
                        "—"
                      ) : r.totals.complete && r.totals.pct !== null ? (
                        <strong>{formatPct(r.totals.pct)}</strong>
                      ) : (
                        <span className="chip chip--warn">To&apos;liq emas</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="stack">
          <div className="card mock-tablewrap">
            <table className="mock-table mock-table--results">
              <thead>
                <tr>
                  <th className="mock-col-n">Rank</th>
                  <th className="mock-col-name">O&apos;quvchi</th>
                  {sections.map((s) => (
                    <th key={s.id} className="mock-col-score">
                      {s.name}
                      <small>/ {s.total_questions}</small>
                    </th>
                  ))}
                  <th className="mock-col-num">Jami</th>
                  <th className="mock-col-bar">Overall</th>
                  <th>To&apos;lov</th>
                  <th>Qatnashuv</th>
                </tr>
              </thead>
              <tbody>
                {ranking.ranked.map((r) => (
                  <tr key={r.result.id} className={r.rank <= 3 ? `mock-medal mock-medal--${r.rank}` : undefined}>
                    <td className="mock-col-n" data-label="Rank">
                      <span className="mock-pos">{r.rank}</span>
                    </td>
                    <td className="mock-col-name">{r.name}</td>
                    {sections.map((s) => (
                      <td key={s.id} className="mock-col-score" data-label={s.name}>
                        {r.scores.get(s.id) ?? "—"}/{s.total_questions}
                      </td>
                    ))}
                    <td className="mock-col-num" data-label="Jami">
                      {r.totals.correct}/{r.totals.total}
                    </td>
                    <td className="mock-col-bar" data-label="Overall">
                      <span className="mock-bar">
                        <Meter value={r.totals.pct ?? 0} max={100} />
                        <strong>{formatPct(r.totals.pct ?? 0)}</strong>
                      </span>
                    </td>
                    <td data-label="To'lov">
                      <PayChip p={r.result.payment} />
                    </td>
                    <td data-label="Qatnashuv">
                      <span className="chip chip--ok">Keldi</span>
                    </td>
                  </tr>
                ))}
                {ranking.ranked.length === 0 && (
                  <tr className="mock-empty">
                    <td colSpan={sections.length + 6}>Hali to&apos;liq baholangan o&apos;quvchi yo&apos;q.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {ranking.absent.length > 0 && (
            <div className="card card--pad">
              <h2 className="section-title">Qatnashmaganlar</h2>
              <ul className="mock-absent">
                {ranking.absent.map((r) => (
                  <li key={r.result.id}>
                    <span>{r.name}</span>
                    <span className="mock-absent__tags">
                      <PayChip p={r.result.payment} />
                      <span className="chip chip--bad">Kelmadi</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmFinish}
        title="Mockni yakunlaymizmi?"
        confirmLabel="Yakunlash"
        onCancel={() => setConfirmFinish(false)}
        onConfirm={async () => {
          setConfirmFinish(false);
          if (await store.finish(mock.id)) {
            setProblem(null);
            notify("Mock yakunlandi");
          }
        }}
      >
        {stats.present} ta qatnashgan, {stats.absent} ta qatnashmagan o&apos;quvchi. Keyin ham “Tahrirlash” orqali
        ballarni tuzatish mumkin.
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmDelete}
        title="Mockni o'chirish"
        confirmLabel="O'chirish"
        danger
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          if (typed.trim() !== mock.name) return setDeleteError(true);
          setConfirmDelete(false);
          if (await store.deleteMock(mock.id)) {
            notify("Mock o'chirildi");
            router.push("/mock");
          }
        }}
      >
        <p>
          Barcha natijalar, to&apos;lov va qatnashuv ma&apos;lumotlari qaytarib bo&apos;lmaydigan tarzda o&apos;chadi.
          Tasdiqlash uchun mock nomini yozing: <strong>{mock.name}</strong>
        </p>
        <input
          className="input"
          style={{ marginTop: 10 }}
          aria-label="Mock nomi"
          value={typed}
          onChange={(e) => {
            setTyped(e.target.value);
            setDeleteError(false);
          }}
        />
        {deleteError && <p className="mock-error">Nom mos kelmadi.</p>}
      </ConfirmDialog>
    </>
  );
}

function PayChip({ p }: { p: MockPayment | null }) {
  if (p === null) return <span className="chip">Belgilanmagan</span>;
  return <span className={`chip ${p === "paid" ? "chip--ok" : "chip--bad"}`}>{PAYMENT_LABEL[p]}</span>;
}
