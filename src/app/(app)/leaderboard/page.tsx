"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { IconCoin } from "@/components/icons";
import { STUCK_AFTER } from "@/lib/config";
import { useData } from "@/lib/data";
import { addDays, formatShort, todayISO, weekStart } from "@/lib/dates";
import { currentTopic, repeatCount } from "@/lib/progress";
import { buildGroupStandings, buildStandings, inRange, type DateRange, type Standing } from "@/lib/scoring";

type Period = "week" | "month" | "all";
type Scope = "all" | "groups" | string; // string = a group id

const PERIODS: { id: Period; label: string }[] = [
  { id: "week", label: "Hafta" },
  { id: "month", label: "30 kun" },
  { id: "all", label: "Hammasi" },
];

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

/** Visual order: 2nd on the left, 1st in the middle (and larger), 3rd on the right. Works for 1 or 2 people too. */
function podiumOrder(p: Standing[]): Standing[] {
  if (p.length >= 3) return [p[1], p[0], p[2]];
  if (p.length === 2) return [p[1], p[0]];
  return p;
}

export default function LeaderboardPage() {
  const { activeGroups, activeStudents, lessons, lessonsByStudent, topicsByStudent } = useData();
  const [period, setPeriod] = useState<Period>("week");
  const [scope, setScope] = useState<Scope>("all");

  const today = todayISO();
  const thisWeek = weekStart(today);

  const range: DateRange = useMemo(() => {
    if (period === "week") return { from: thisWeek, to: addDays(thisWeek, 6) };
    if (period === "month") return { from: addDays(today, -29), to: today };
    return { from: null, to: null };
  }, [period, today, thisWeek]);

  const scopeGroup = activeGroups.find((g) => g.id === scope);
  const groupName = useMemo(() => new Map(activeGroups.map((g) => [g.id, g.name])), [activeGroups]);

  const standings = useMemo(() => {
    const pool = scopeGroup ? activeStudents.filter((s) => s.group_id === scopeGroup.id) : activeStudents;
    return buildStandings(pool, lessons, range);
  }, [activeStudents, lessons, range, scopeGroup]);

  // Top 3 = first three people with coins; they keep their true (tied) rank. Everyone else goes to the list.
  const { podium, rest } = useMemo(() => {
    const winners = standings.filter((s) => s.coins > 0).slice(0, 3);
    return { podium: winners, rest: standings.filter((s) => !winners.includes(s)) };
  }, [standings]);

  const groupStandings = useMemo(
    () => buildGroupStandings(activeGroups, buildStandings(activeStudents, lessons, range)),
    [activeGroups, activeStudents, lessons, range],
  );

  // "No results" means no lesson has been marked in this period for the people shown.
  const hasResults = useMemo(() => {
    const ids = new Set(standings.map((s) => s.student.id));
    return lessons.some((l) => ids.has(l.student_id) && inRange(l.lesson_date, range));
  }, [lessons, standings, range]);

  const lastWeekStar = useMemo(() => {
    const from = addDays(thisWeek, -7);
    const top = buildStandings(activeStudents, lessons, { from, to: addDays(from, 6) });
    const best = top[0]?.coins ?? 0;
    if (best <= 0) return null;
    return { names: top.filter((s) => s.coins === best).map((s) => s.student.name), coins: best };
  }, [activeStudents, lessons, thisWeek]);

  const attention = useMemo(
    () =>
      activeStudents
        .map((student) => {
          const all = lessonsByStudent.get(student.id) ?? [];
          const topic = currentTopic(topicsByStudent.get(student.id) ?? [], all);
          return { student, topic, repeats: repeatCount(topic, all) };
        })
        .filter((r) => r.topic && r.repeats > 0)
        .sort((a, b) => b.repeats - a.repeats || a.student.name.localeCompare(b.student.name)),
    [activeStudents, lessonsByStudent, topicsByStudent],
  );

  const periodSub =
    period === "week"
      ? `${formatShort(thisWeek)} – ${formatShort(addDays(thisWeek, 6))} · har dushanba yangilanadi`
      : period === "month"
        ? "Oxirgi 30 kun"
        : "Butun davr";

  if (!activeStudents.length) {
    return (
      <>
        <div className="page-head">
          <h1 className="page-title">Reyting</h1>
        </div>
        <div className="card empty">
          <strong>Hali natijalar mavjud emas.</strong>
          <p>O&apos;quvchi qo&apos;shing va birinchi darsni belgilang, tangalar shu yerda paydo bo&apos;ladi.</p>
          <p style={{ marginTop: 14 }}>
            <Link className="btn btn--primary" href="/students">
              O&apos;quvchi qo&apos;shish
            </Link>
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Reyting</h1>
          <p className="page-sub">{periodSub}</p>
        </div>
      </div>

      <div className="toolbar">
        <div className="seg" role="group" aria-label="Davr">
          {PERIODS.map((p) => (
            <button key={p.id} className="seg__btn" aria-pressed={period === p.id} onClick={() => setPeriod(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="Guruh">
          <button className="seg__btn" aria-pressed={scope === "all"} onClick={() => setScope("all")}>
            Hamma
          </button>
          {activeGroups.map((g) => (
            <button key={g.id} className="seg__btn" aria-pressed={scope === g.id} onClick={() => setScope(g.id)}>
              {g.name}
            </button>
          ))}
          <button className="seg__btn" aria-pressed={scope === "groups"} onClick={() => setScope("groups")}>
            Guruhlar
          </button>
        </div>
      </div>

      {period === "week" && lastWeekStar && scope !== "groups" && (
        <p className="callout">
          <IconCoin width={18} height={18} aria-hidden />
          O&apos;tgan hafta yulduzi: {lastWeekStar.names.join(", ")} ({lastWeekStar.coins} tanga)
        </p>
      )}

      <div className="card">
        {!hasResults ? (
          <div className="empty">
            <strong>Hali natijalar mavjud emas.</strong>
            <p>Bu davrda hali birorta dars belgilanmagan.</p>
          </div>
        ) : scope === "groups" ? (
          <ol className="list">
            {groupStandings.map((g) => (
              <li key={g.group.id} className={`rank rank--simple${g.rank <= 3 && g.average > 0 ? " rank--top" : ""}`}>
                <span className="rank__pos">{g.rank}</span>
                <span className="row__who">
                  <span style={{ minWidth: 0 }}>
                    <span className="row__main">{g.group.name}</span>
                    <span className="row__sub">
                      {g.students} o&apos;quvchi · jami {g.total} tanga
                    </span>
                  </span>
                </span>
                <span className="rank__score">
                  {g.average.toFixed(1)}
                  <small>o&apos;rtacha</small>
                </span>
              </li>
            ))}
          </ol>
        ) : standings.length === 0 ? (
          <div className="empty">
            <strong>Bu guruhda o&apos;quvchi yo&apos;q</strong>
          </div>
        ) : (
          <>
            {podium.length > 0 && (
              <ol className={`podium podium--${podium.length}`} aria-label="Top 3">
                {podiumOrder(podium).map((s) => (
                  <li key={s.student.id} className={`podium__slot podium__slot--${Math.min(s.rank, 3)}${s === podium[0] ? " podium__slot--first" : ""}`}>
                    <Link href={`/students/${s.student.id}`} className="podium__card">
                      <span className="podium__rank" aria-label={`${s.rank}-o'rin`}>{s.rank}</span>
                      <span className="podium__initials" aria-hidden>{initialsOf(s.student.name)}</span>
                      <span className="podium__name">{s.student.name}</span>
                      <span className="podium__group">{groupName.get(s.student.group_id) ?? ""}</span>
                      <span className="podium__score">
                        <IconCoin width={16} height={16} aria-hidden />
                        {s.coins}
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
            {rest.length > 0 && (
              <ol className="list" start={rest[0].rank}>
                {rest.map((s) => (
                  <li key={s.student.id} className="rank">
                    <span className="rank__pos">{s.rank}</span>
                    <Link href={`/students/${s.student.id}`} className="row__who" style={{ color: "inherit", textDecoration: "none" }}>
                      <Avatar name={s.student.name} />
                      <span style={{ minWidth: 0 }}>
                        <span className="row__main">{s.student.name}</span>
                        <span className="row__sub">
                          {scopeGroup ? "" : `${groupName.get(s.student.group_id) ?? ""} · `}
                          {s.full} to&apos;liq · {s.attended} dars
                        </span>
                      </span>
                    </Link>
                    <span className="rank__meta">{s.full} to&apos;liq</span>
                    <span className="rank__meta">
                      {s.attended}/{s.attended + s.absent} davomat
                    </span>
                    <span className="rank__score">
                      {s.coins}
                      <small>tanga</small>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </div>

      {attention.length > 0 && (
        <>
          <h2 className="section-title">E&apos;tibor kerak</h2>
          <p className="hint" style={{ marginBottom: 8 }}>
            Joriy mavzu qayta o&apos;tilgan. {STUCK_AFTER}+ marta bo&apos;lsa, boshqa yondashuv sinab ko&apos;ring.
          </p>
          <div className="card">
            {attention.map((a) => (
              <Link key={a.student.id} href={`/students/${a.student.id}`} className="row">
                <span className="row__who">
                  <Avatar name={a.student.name} />
                  <span style={{ minWidth: 0 }}>
                    <span className="row__main">{a.student.name}</span>
                    <span className="row__sub">{a.topic?.title}</span>
                  </span>
                </span>
                <span className={`flag${a.repeats >= STUCK_AFTER ? "" : " flag--soft"}`}>{a.repeats}× qaytarildi</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  );
}
