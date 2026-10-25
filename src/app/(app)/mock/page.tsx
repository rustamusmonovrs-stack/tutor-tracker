"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { MockCreateDialog } from "@/components/MockCreateDialog";
import { IconCalendar, IconChevronRight, IconPlus } from "@/components/icons";
import { Meter } from "@/components/ui";
import { useData } from "@/lib/data";
import { formatShort } from "@/lib/dates";
import { buildRows, buildStats, formatPct, type MockStatus } from "@/lib/mock";
import { useMockStore } from "@/lib/mockData";

type StatusFilter = "all" | MockStatus;

export default function MockListPage() {
  const router = useRouter();
  const { groups, activeGroups } = useData();
  const store = useMockStore();
  const [creating, setCreating] = useState(false);
  const [groupId, setGroupId] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const groupName = useMemo(() => new Map(groups.map((g) => [g.id, g.name])), [groups]);

  const cards = useMemo(() => {
    return store.mocks
      .filter((m) => (groupId === "all" || m.group_id === groupId) && (status === "all" || m.status === status))
      .filter((m) => (!from || m.mock_date >= from) && (!to || m.mock_date <= to))
      .map((m) => {
        const secs = store.sections.filter((s) => s.mock_id === m.id).sort((a, b) => a.position - b.position);
        const res = store.results.filter((r) => r.mock_id === m.id);
        const resIds = new Set(res.map((r) => r.id));
        const rows = buildRows(secs, res, store.scores.filter((s) => resIds.has(s.result_id)), () => "");
        return { m, secs, stats: buildStats(rows), max: secs.reduce((a, s) => a + s.total_questions, 0) };
      });
  }, [store.mocks, store.sections, store.results, store.scores, groupId, status, from, to]);

  const filtered = groupId !== "all" || status !== "all" || from !== "" || to !== "";

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Mock imtihonlari</h1>
          <p className="page-sub">Guruhlar bo&apos;yicha imtihonlar tarixi va natijalar</p>
        </div>
        <div className="page-actions">
          <button className="btn btn--primary" onClick={() => setCreating(true)} disabled={activeGroups.length === 0}>
            <IconPlus aria-hidden /> Yangi Mock yaratish
          </button>
        </div>
      </div>

      <div className="toolbar mock-filters">
        <select className="select" aria-label="Guruh" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
          <option value="all">Barcha guruhlar</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <div className="seg" role="group" aria-label="Holat">
          {(
            [
              ["all", "Hammasi"],
              ["draft", "Jarayonda"],
              ["completed", "Yakunlangan"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} className="seg__btn" aria-pressed={status === id} onClick={() => setStatus(id)}>
              {label}
            </button>
          ))}
        </div>
        <div className="mock-dates">
          <input className="input" type="date" aria-label="Sanadan" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          <span aria-hidden>–</span>
          <input className="input" type="date" aria-label="Sanagacha" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        </div>
        {filtered && (
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => {
              setGroupId("all");
              setStatus("all");
              setFrom("");
              setTo("");
            }}
          >
            Tozalash
          </button>
        )}
      </div>

      {store.status === "loading" && (
        <div className="stack" aria-busy="true" aria-label="Yuklanmoqda">
          <div className="skeleton" style={{ height: 120 }} />
          <div className="skeleton" style={{ height: 120 }} />
        </div>
      )}

      {store.status === "error" && (
        <div className="card card--pad stack" role="alert">
          <div>
            <strong>Mocklar yuklanmadi</strong>
            <p className="hint" style={{ marginTop: 6 }}>
              {store.error}
            </p>
            <p className="hint" style={{ marginTop: 6 }}>
              Agar jadval topilmadi degan xabar chiqsa, Mock migratsiyasi hali qo&apos;llanmagan (
              <code>supabase/migrations/20261025_mock.sql</code>).
            </p>
          </div>
          <div>
            <button className="btn btn--primary" onClick={() => void store.reload()}>
              Qayta urinish
            </button>
          </div>
        </div>
      )}

      {store.status === "ready" && cards.length === 0 && (
        <div className="card empty">
          <strong>{filtered ? "Filtrga mos mock topilmadi." : "Hali mock yaratilmagan."}</strong>
          <p>{filtered ? "Filtrni o'zgartiring yoki tozalang." : "Birinchi mock imtihonini yarating — natijalar shu yerda saqlanadi."}</p>
          {!filtered && (
            <p style={{ marginTop: 14 }}>
              <button className="btn btn--primary" onClick={() => setCreating(true)} disabled={activeGroups.length === 0}>
                <IconPlus aria-hidden /> Yangi Mock yaratish
              </button>
            </p>
          )}
        </div>
      )}

      {store.status === "ready" && cards.length > 0 && (
        <ul className="mock-list">
          {cards.map(({ m, secs, stats, max }) => (
            <li key={m.id}>
              <Link href={`/mock/${m.id}`} className="card mock-card">
                <div className="mock-card__top">
                  <div style={{ minWidth: 0 }}>
                    <div className="mock-card__title">{m.name}</div>
                    <div className="mock-card__meta">
                      <span className="mock-card__date">
                        <IconCalendar aria-hidden /> {formatShort(m.mock_date)} {m.mock_date.slice(0, 4)}
                      </span>
                      <span>{groupName.get(m.group_id) ?? "Guruh"}</span>
                    </div>
                  </div>
                  <span className={`chip ${m.status === "completed" ? "chip--ok" : "chip--warn"}`}>
                    {m.status === "completed" ? "Yakunlangan" : "Jarayonda"}
                  </span>
                </div>

                <div className="mock-card__sections">
                  {secs.map((s) => (
                    <span key={s.id} className="chip">
                      {s.name} · {s.total_questions}
                    </span>
                  ))}
                </div>

                <div className="mock-card__foot">
                  <span>
                    <b>{max}</b> savol
                  </span>
                  <span>
                    <b>{stats.present}</b>/{stats.total} qatnashdi
                  </span>
                  <span className="mock-card__avg">
                    {stats.avgPct === null ? (
                      <span className="hint">O&apos;rtacha: —</span>
                    ) : (
                      <>
                        <Meter value={stats.avgPct} max={100} />
                        <b>{formatPct(stats.avgPct)}</b>
                      </>
                    )}
                  </span>
                  <IconChevronRight aria-hidden className="mock-card__go" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <MockCreateDialog
        open={creating}
        store={store}
        defaultGroupId={groupId !== "all" ? groupId : null}
        onClose={() => setCreating(false)}
        onCreated={(id) => {
          setCreating(false);
          router.push(`/mock/${id}`);
        }}
      />
    </>
  );
}
