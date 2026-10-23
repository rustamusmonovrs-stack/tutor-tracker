"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { STUCK_AFTER } from "@/lib/config";
import { useData } from "@/lib/data";
import { addDays, formatShort, todayISO, weekStart } from "@/lib/dates";
import { currentTopic, repeatCount } from "@/lib/progress";
import { buildGroupStandings, buildStandings, type DateRange } from "@/lib/scoring";

type Period = "week" | "month" | "all";
type Scope = "all" | "groups" | string; // string = a group id

const PERIODS: { id: Period; label: string }[] = [
  { id: "week", label: "Weekly" },
  { id: "month", label: "30 days" },
  { id: "all", label: "Overall" },
];

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

  const groupStandings = useMemo(
    () => buildGroupStandings(activeGroups, buildStandings(activeStudents, lessons, range)),
    [activeGroups, activeStudents, lessons, range],
  );

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
      ? `${formatShort(thisWeek)} – ${formatShort(addDays(thisWeek, 6))}, resets every Monday`
      : period === "month"
        ? "Last 30 days"
        : "All time";

  if (!activeStudents.length) {
    return (
      <>
        <div className="page-head">
          <h1 className="page-title">Leaderboard</h1>
        </div>
        <div className="sheet empty">
          <strong>Nothing to rank yet</strong>
          <p>Add students and mark a lesson. Coins appear here automatically.</p>
          <p style={{ marginTop: 14 }}>
            <Link className="btn btn--primary" href="/students">
              Add students
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
          <h1 className="page-title">Leaderboard</h1>
          <p className="page-sub">{periodSub}</p>
        </div>
      </div>

      <div className="controls">
        <div className="seg" role="group" aria-label="Period">
          {PERIODS.map((p) => (
            <button key={p.id} className="seg__btn" aria-pressed={period === p.id} onClick={() => setPeriod(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="Scope">
          <button className="seg__btn" aria-pressed={scope === "all"} onClick={() => setScope("all")}>
            Everyone
          </button>
          {activeGroups.map((g) => (
            <button key={g.id} className="seg__btn" aria-pressed={scope === g.id} onClick={() => setScope(g.id)}>
              {g.name}
            </button>
          ))}
          <button className="seg__btn" aria-pressed={scope === "groups"} onClick={() => setScope("groups")}>
            Groups
          </button>
        </div>
      </div>

      {period === "week" && lastWeekStar && scope !== "groups" && (
        <p className="callout">
          <span aria-hidden>★</span>
          <span>
            Last week&apos;s star: {lastWeekStar.names.join(", ")} ({lastWeekStar.coins} coins)
          </span>
        </p>
      )}

      <div className="sheet">
        {scope === "groups" ? (
          <ol className="rank-list">
            {groupStandings.map((g) => (
              <li key={g.group.id} className={`rank${g.rank <= 3 && g.average > 0 ? " rank--top" : ""}`}>
                <span className="rank__pos">{g.rank}</span>
                <span className="rank__name">
                  {g.group.name}
                  <span className="rank__sub">
                    {g.students} students · {g.total} coins total
                  </span>
                </span>
                <span className="rank__score">
                  {g.average.toFixed(1)}
                  <small>avg per student</small>
                </span>
              </li>
            ))}
          </ol>
        ) : standings.length === 0 ? (
          <div className="empty">
            <strong>No students in this group</strong>
          </div>
        ) : (
          <ol className="rank-list">
            {standings.map((s) => (
              <li key={s.student.id} className={`rank${s.rank <= 3 && s.coins > 0 ? " rank--top" : ""}`}>
                <span className="rank__pos">{s.rank}</span>
                <span className="rank__name">
                  <Link href={`/students/${s.student.id}`} style={{ color: "inherit", textDecoration: "none" }}>
                    {s.student.name}
                  </Link>
                  <span className="rank__sub">
                    {scopeGroup ? "" : `${groupName.get(s.student.group_id) ?? ""} · `}
                    {s.full} full · {s.lessons} lessons
                  </span>
                </span>
                <span className="rank__score">
                  {s.coins}
                  <small>coins</small>
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {attention.length > 0 && (
        <>
          <h2 className="section-title">Needs attention</h2>
          <p className="hint" style={{ marginBottom: 8 }}>
            Current topic was repeated. {STUCK_AFTER}+ times means it is time to try a different approach.
          </p>
          <div className="sheet">
            {attention.map((a) => (
              <Link key={a.student.id} href={`/students/${a.student.id}`} className="row-link">
                <span>
                  <span className="row-link__main">{a.student.name}</span>
                  <span className="row-link__sub">{a.topic?.title}</span>
                </span>
                <span className={`flag${a.repeats >= STUCK_AFTER ? "" : " flag--soft"}`}>
                  {a.repeats}× repeated
                </span>
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  );
}
