"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { HBars, Legend, StackedBars } from "@/components/charts";
import { HomeworkWeekChart } from "@/components/HomeworkWeekChart";
import { Kpi } from "@/components/ui";
import { useData } from "@/lib/data";
import { useHomework } from "@/lib/homeworkData";
import { addDays, formatShort, todayISO, weekStart } from "@/lib/dates";
import { homeworkItems, homeworkWeeks, summarizeItems } from "@/lib/homeworkStats";
import { buildGroupStandings, buildStandings, scoreLessons, summarize, type ScoredLesson } from "@/lib/scoring";

type Days = 7 | 30 | 90;

export default function StatsPage() {
  const { activeGroups, activeStudents, lessons, lessonsByStudent } = useData();
  const hw = useHomework();
  const { coinEvents } = hw;
  const [days, setDays] = useState<Days>(30);
  const [groupId, setGroupId] = useState("all");

  const today = todayISO();
  const from = addDays(today, -(days - 1));

  const pool = useMemo(
    () => (groupId === "all" ? activeStudents : activeStudents.filter((s) => s.group_id === groupId)),
    [activeStudents, groupId],
  );
  const ids = useMemo(() => new Set(pool.map((s) => s.id)), [pool]);

  // Score each student over their full history (streaks need it), then cut to the period.
  const scoredAll = useMemo(() => {
    const list: ScoredLesson[] = [];
    for (const s of pool) list.push(...scoreLessons(lessonsByStudent.get(s.id) ?? []));
    return list;
  }, [pool, lessonsByStudent]);
  const inPeriod = useMemo(
    () => scoredAll.filter((s) => s.lesson.lesson_date >= from && s.lesson.lesson_date <= today),
    [scoredAll, from, today],
  );
  const sum = useMemo(() => summarize(inPeriod), [inPeriod]);

  // Homework: Smart Homework assessments + old per-lesson grades, dated by the checking lesson (see homeworkStats.ts).
  // The summary card and the weekly chart are built from the same items.
  const hwItems = useMemo(
    () => homeworkItems({ studentIds: ids, lessons, tasks: hw.tasks, assignments: hw.assignments, assessments: hw.assessMap, from, to: today }),
    [ids, lessons, hw.tasks, hw.assignments, hw.assessMap, from, today],
  );
  const hwSum = useMemo(() => summarizeItems(hwItems), [hwItems]);
  const hwWeeks = useMemo(() => homeworkWeeks(hwItems, from, today), [hwItems, from, today]);
  const hwReady = hw.status === "ready";

  const todays = useMemo(
    () => lessons.filter((l) => l.lesson_date === today && ids.has(l.student_id)),
    [lessons, today, ids],
  );
  const todayPresent = todays.filter((l) => l.attendance === "present").length;
  const todayAbsent = todays.filter((l) => l.attendance === "absent").length;
  const todayUnmarked = pool.length - todays.filter((l) => l.attendance).length;

  const weekFrom = weekStart(today);
  const taskCoin = (a: string, b: string) => coinEvents.filter((e) => ids.has(e.student_id) && e.date >= a && e.date <= b).reduce((t, e) => t + e.coins, 0);
  const taskPeriod = taskCoin(from, today);
  const taskWeek = taskCoin(weekFrom, addDays(weekFrom, 6));
  const weekCoins = scoredAll
    .filter((s) => s.lesson.lesson_date >= weekFrom && s.lesson.lesson_date <= addDays(weekFrom, 6))
    .reduce((t, s) => t + s.coins, 0);

  // Attendance per day (only days that have records), homework + coins per week.
  const perDay = useMemo(() => {
    const map = new Map<string, { present: number; absent: number }>();
    for (const { lesson } of inPeriod) {
      if (!lesson.attendance) continue;
      const e = map.get(lesson.lesson_date) ?? { present: 0, absent: 0 };
      e[lesson.attendance] += 1;
      map.set(lesson.lesson_date, e);
    }
    return [...map.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  }, [inPeriod]);

  const weekBuckets = useMemo(() => {
    const first = weekStart(from);
    const out: { start: string; items: ScoredLesson[] }[] = [];
    for (let w = first; w <= today; w = addDays(w, 7)) {
      out.push({
        start: w,
        items: inPeriod.filter((s) => s.lesson.lesson_date >= w && s.lesson.lesson_date <= addDays(w, 6)),
      });
    }
    return out;
  }, [inPeriod, from, today]);

  const groupRows = useMemo(() => {
    const standings = buildStandings(activeStudents, lessons, { from, to: today }, coinEvents);
    return buildGroupStandings(activeGroups, standings);
  }, [activeGroups, activeStudents, lessons, from, today, coinEvents]);

  const top = useMemo(
    () => buildStandings(pool, lessons, { from, to: today }, coinEvents).filter((s) => s.coins > 0).slice(0, 5),
    [pool, lessons, from, today, coinEvents],
  );

  const attSeries = [
    { key: "present", label: "Keldi", color: "var(--ok)" },
    { key: "absent", label: "Kelmadi", color: "var(--bad)" },
  ];
  const hwSeries = [
    { key: "full", label: "To'liq", color: "var(--ok)" },
    { key: "partial", label: "Chala", color: "#e0a526" },
    { key: "notDone", label: "Qilmadi", color: "var(--bad)" },
  ];
  const coinSeries = [{ key: "coins", label: "Tanga", color: "var(--brand)" }];

  if (!activeStudents.length) {
    return (
      <>
        <div className="page-head">
          <h1 className="page-title">Statistika</h1>
        </div>
        <div className="card empty">
          <strong>Hali ma&apos;lumot yo&apos;q</strong>
          <p>O&apos;quvchilarni qo&apos;shing va darslarni belgilang.</p>
          <p style={{ marginTop: 14 }}>
            <Link className="btn btn--primary" href="/students">
              O&apos;quvchi qo&apos;shish
            </Link>
          </p>
        </div>
      </>
    );
  }

  const hasData = inPeriod.length > 0 || hwItems.length > 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Statistika</h1>
          <p className="page-sub">
            {formatShort(from)} – {formatShort(today)}
          </p>
        </div>
        <div className="page-actions">
          <select className="select" style={{ width: "auto" }} aria-label="Guruh" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="all">Barcha guruhlar</option>
            {activeGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <div className="seg" role="group" aria-label="Davr">
            {([7, 30, 90] as Days[]).map((d) => (
              <button key={d} className="seg__btn" aria-pressed={days === d} onClick={() => setDays(d)}>
                {d} kun
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="kpis">
        <Kpi label="Faol o'quvchilar" value={pool.length} note={`${groupId === "all" ? activeGroups.length : 1} ta guruhda`} />
        <Kpi
          label="Bugun belgilandi"
          value={pool.length - todayUnmarked}
          unit={`/${pool.length}`}
          note={`${todayPresent} keldi · ${todayAbsent} kelmadi · ${todayUnmarked} belgilanmagan`}
        />
        <Kpi
          label="To'liq vazifa"
          value={!hwReady ? "…" : hwSum.graded ? Math.round((hwSum.full / hwSum.graded) * 100) : "—"}
          unit={hwReady && hwSum.graded ? "%" : undefined}
          note={!hwReady ? "Vazifalar yuklanmoqda" : hwSum.graded ? `${hwSum.full} / ${hwSum.graded} baholangan` : "Baholangan vazifa yo'q"}
        />
        <Kpi label="Hafta tangalari" value={weekCoins + taskWeek} note={`Davrda jami: ${sum.coins + taskPeriod}`} />
      </div>

      {!hasData ? (
        <div className="card empty">
          <strong>Hali natijalar mavjud emas.</strong>
          <p>Bu davrda belgilangan dars yo&apos;q, grafiklar ma&apos;lumot paydo bo&apos;lgach chiqadi.</p>
        </div>
      ) : (
        <div className="charts">
          <div className="card chart">
            <span className="chart__title">Davomat (kunlar bo&apos;yicha)</span>
            <StackedBars
              data={perDay.map(([d, v]) => ({ label: formatShort(d), values: v }))}
              series={attSeries}
              summary="Kunlar bo'yicha keldi va kelmadi soni"
            />
            <Legend series={attSeries} />
          </div>
          <div className="card chart">
            <span className="chart__title">Uy vazifasi (haftalar bo&apos;yicha)</span>
            {hw.status === "loading" ? (
              <div className="skeleton" style={{ height: 180 }} aria-label="Yuklanmoqda" />
            ) : hw.status === "error" ? (
              <p className="hint">Smart Homework ma&apos;lumotlari yuklanmadi, shuning uchun bu grafik ko&apos;rsatilmaydi.</p>
            ) : (
              <>
                <HomeworkWeekChart weeks={hwWeeks} from={from} to={today} />
                <Legend series={hwSeries} />
                <span className="hint">
                  Sana — vazifa tekshirilgan dars. Smart Homework baholari va eski (dars bo&apos;yicha) baholar birga
                  hisoblanadi. Ustunsiz hafta — o&apos;sha haftada baholangan uy vazifasi yo&apos;q.
                </span>
              </>
            )}
          </div>
          <div className="card chart">
            <span className="chart__title">Tangalar (haftalar bo&apos;yicha)</span>
            <StackedBars
              data={weekBuckets.map((w) => ({
                label: formatShort(w.start),
                // Lesson coins + Smart Homework coins of the week (inside the period), as in the "Hafta tangalari" card.
                values: { coins: summarize(w.items).coins + taskCoin(w.start < from ? from : w.start, addDays(w.start, 6) > today ? today : addDays(w.start, 6)) },
              }))}
              series={coinSeries}
              summary="Haftalar bo'yicha yig'ilgan tangalar"
            />
          </div>
          <div className="card chart">
            <span className="chart__title">Guruhlar taqqoslash (o&apos;rtacha tanga)</span>
            <HBars rows={groupRows.map((g) => ({ label: g.group.name, value: Number(g.average.toFixed(1)) }))} format={(n) => n.toFixed(1)} />
            <span className="hint">Jami tanga / faol o&apos;quvchilar soni</span>
          </div>
        </div>
      )}

      {top.length > 0 && (
        <>
          <h2 className="section-title">Eng yaxshi o&apos;quvchilar</h2>
          <div className="card">
            {top.map((t) => (
              <Link key={t.student.id} href={`/students/${t.student.id}`} className="row">
                <span className="row__who">
                  <Avatar name={t.student.name} />
                  <span className="row__main">{t.student.name}</span>
                </span>
                <span className="coins">{t.coins} tanga</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  );
}
