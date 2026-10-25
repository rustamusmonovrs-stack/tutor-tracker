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

  // Podium = everyone with a real rank 1-3 (ties share a rank and are never split between podium and list).
  const { top, rest, tiers } = useMemo(() => {
    const winners = standings.filter((s) => s.coins > 0 && s.rank <= 3);
    const ranks = [...new Set(winners.map((s) => s.rank))];
    return {
      top: winners,
      rest: standings.filter((s) => !winners.includes(s)),
      tiers: ranks.map((rank) => ({ rank, members: winners.filter((s) => s.rank === rank) })),
    };
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
    <div className="lb">
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
            {top.length > 0 && (top.length <= 3 ? (
              <ol className={`lb-podium lb-podium--${top.length}${top.length > 1 && top[0].rank < top[1].rank ? " lb-podium--lead" : ""}`} aria-label="Top 3">
                {top.map((s) => (
                  <li key={s.student.id} className={`lb-slot lb-slot--${s.rank}`}>
                    <Link href={`/students/${s.student.id}`} className="lb-card">
                      <span className="lb-card__rank">{s.rank}-o&apos;rin</span>
                      <span className="lb-initials" aria-hidden>{initialsOf(s.student.name)}</span>
                      <span className="lb-card__name">{s.student.name}</span>
                      <span className="lb-card__group">{groupName.get(s.student.group_id) ?? ""}</span>
                      <span className="lb-card__score">
                        <IconCoin width={15} height={15} aria-hidden />
                        {s.coins}
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="lb-tiers" aria-label="Top 3">
                {tiers.map((t) => (
                  <section key={t.rank} className={`lb-tier lb-slot--${t.rank}`}>
                    <header className="lb-tier__head">
                      <span className="lb-card__rank">{t.rank}-o&apos;rin</span>
                      <span className="lb-tier__meta">{t.members.length} ta o&apos;quvchi</span>
                      <span className="lb-card__score">
                        <IconCoin width={15} height={15} aria-hidden />
                        {t.members[0].coins}
                      </span>
                    </header>
                    <ul className={`lb-tier__list${t.members.length === 1 ? " lb-tier__list--solo" : ""}`}>
                      {t.members.map((s) => (
                        <li key={s.student.id}>
                          <Link href={`/students/${s.student.id}`} className="lb-chip">
                            <span className="lb-initials lb-initials--sm" aria-hidden>{initialsOf(s.student.name)}</span>
                            <span className="lb-chip__text">
                              <span className="lb-chip__name">{s.student.name}</span>
                              <span className="lb-chip__sub">{groupName.get(s.student.group_id) ?? ""}</span>
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            ))}
            {rest.length > 0 && (
              <>
                {top.length > 0 && <h2 className="lb-list-title">Barcha o&apos;quvchilar reytingi</h2>}
                <ol className="lb-list">
                  {rest.map((s) => (
                    <li key={s.student.id} className="lb-row">
                      <span className="lb-row__pos">{s.rank}</span>
                      <Link href={`/students/${s.student.id}`} className="lb-row__who">
                        <span className="lb-initials lb-initials--sm" aria-hidden>{initialsOf(s.student.name)}</span>
                        <span className="lb-row__text">
                          <span className="lb-row__name">{s.student.name}</span>
                          <span className="lb-row__sub">
                            {scopeGroup ? "" : (groupName.get(s.student.group_id) ?? "")}
                            <span className="lb-row__inline">{scopeGroup ? "" : " · "}{s.full} to&apos;liq · {s.attended}/{s.attended + s.absent} davomat</span>
                          </span>
                        </span>
                      </Link>
                      <span className="lb-row__stat">{s.full}<small>to&apos;liq</small></span>
                      <span className="lb-row__stat">{s.attended}/{s.attended + s.absent}<small>davomat</small></span>
                      <span className="lb-row__coins">{s.coins}<small>tanga</small></span>
                    </li>
                  ))}
                </ol>
              </>
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
    </div>
  );
}
