"use client";

import Link from "next/link";
import { CalendarDays, CircleCheck, ClipboardCheck, Crown, Info, Medal, Trophy, Users } from "lucide-react";
import { useId, useMemo, useState, type ReactNode } from "react";
import { Avatar } from "@/components/Avatar";
import { IconCoin } from "@/components/icons";
import { HOMEWORK_COINS, STREAK_BONUS, STREAK_LENGTH, STUCK_AFTER } from "@/lib/config";
import { useData } from "@/lib/data";
import { useHomework } from "@/lib/homeworkData";
import { addDays, formatShort, todayISO, weekStart } from "@/lib/dates";
import { MEDAL, PODIUM_MAX_PER_CARD, initialsOf, podiumOrder, podiumTiers, type PodiumTier } from "@/lib/leaderboard";
import { currentTopic, repeatCount } from "@/lib/progress";
import { buildGroupStandings, buildStandings, inRange, type DateRange, type Standing } from "@/lib/scoring";

type Period = "week" | "month" | "all";
type Scope = "all" | "groups" | string; // string = a group id

const PERIODS: { id: Period; label: string }[] = [
  { id: "week", label: "Hafta" },
  { id: "month", label: "30 kun" },
  { id: "all", label: "Hammasi" },
];

const HINT = {
  full: "Darsdagi umumiy uy vazifasi bahosi «To‘liq» bo‘lgan darslar soni (tanlangan davrda).",
  attendance: "Kelgan darslar / davomati belgilangan darslar (tanlangan davrda). Belgilanmagan dars hisoblanmaydi.",
  coins: `Mavjud qoida bo‘yicha: darsdagi uy vazifasi bahosi (To‘liq ${HOMEWORK_COINS.full}, Chala ${HOMEWORK_COINS.partial}), har ${STREAK_LENGTH} ketma-ket To‘liq uchun +${STREAK_BONUS} bonus va Smart Homework’da To‘liq baholangan har bir vazifa uchun +1.`,
};

/** Small accessible tooltip: the button is focusable, the text is linked with aria-describedby. */
function Hint({ text, label }: { text: string; label: string }) {
  const id = useId();
  return (
    <span className="lbx-hint">
      <button type="button" className="lbx-hint__btn" aria-label={`${label}: izoh`} aria-describedby={id}>
        <Info aria-hidden size={13} strokeWidth={2} />
      </button>
      <span role="tooltip" id={id} className="lbx-hint__tip">
        {text}
      </span>
    </span>
  );
}

function Coins({ value, size = "md" }: { value: number | string; size?: "md" | "lg" }) {
  return (
    <span className={`lbx-coins lbx-coins--${size}`}>
      <IconCoin aria-hidden />
      <b>{value}</b>
      <span className="sr-only"> tanga</span>
    </span>
  );
}

function RankMark({ rank }: { rank: number }) {
  const medal = MEDAL[rank];
  if (!medal) return <span className="lbx-pos">{rank}</span>;
  return (
    <span className={`lbx-pos lbx-pos--medal lbx-medal--${medal}`} aria-label={`${rank}-o‘rin`}>
      {rank}
    </span>
  );
}

/** Two small laurel branches drawn around the first-place avatar (decorative). */
function Laurels() {
  const leaf = "M0 0c3-1.6 6-1.1 8 1.2-3 1.4-6 1-8-1.2Z";
  const branch = (
    <g fill="currentColor">
      <path d="M14 46C6 38 4 24 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      {[[10.5, 13, -70], [8.4, 20, -58], [7.8, 27.5, -44], [8.9, 35, -30], [11.6, 41.5, -16]].map(([x, y, r], i) => (
        <path key={i} d={leaf} transform={`translate(${x} ${y}) rotate(${r})`} />
      ))}
      {[[9.6, 16, 200], [7.2, 24, 186], [7, 31.5, 172], [8.9, 38.5, 160]].map(([x, y, r], i) => (
        <path key={`b${i}`} d={leaf} transform={`translate(${x} ${y}) rotate(${r})`} opacity="0.8" />
      ))}
    </g>
  );
  return (
    <span className="lbx-laurels" aria-hidden>
      <svg viewBox="0 0 24 50" className="lbx-laurels__l">{branch}</svg>
      <svg viewBox="0 0 24 50" className="lbx-laurels__r">{branch}</svg>
    </span>
  );
}

function TierBadge({ rank }: { rank: number }) {
  if (rank === 1) return <Crown className="lbx-tier__icon" aria-hidden strokeWidth={1.8} />;
  return (
    <span className="lbx-tier__medal" aria-hidden>
      <Medal strokeWidth={1.8} />
      <b>{rank}</b>
    </span>
  );
}

function PodiumCard({ tier, groupOf, stacked }: { tier: PodiumTier; groupOf: (s: Standing) => string; stacked: boolean }) {
  const medal = MEDAL[tier.rank];
  const solo = tier.members.length === 1;
  const s = tier.members[0];
  return (
    <li className={`lbx-tier lbx-medal--${medal}${solo ? "" : " lbx-tier--group"}${tier.rank === 1 ? " lbx-tier--first" : ""}`}>
      <TierBadge rank={tier.rank} />
      {solo && !stacked ? (
        <Link href={`/students/${s.student.id}`} className="lbx-tier__solo">
          <span className="lbx-tier__place">{tier.rank}-o‘rin</span>
          <span className="lbx-tier__avatar">
            {tier.rank === 1 && <Laurels />}
            <span className="lbx-avatar lbx-avatar--lg" aria-hidden>{initialsOf(s.student.name)}</span>
          </span>
          <span className="lbx-tier__name">{s.student.name}</span>
          <span className="lbx-tier__group">{groupOf(s)}</span>
          <Coins value={tier.coins} size="lg" />
        </Link>
      ) : (
        <div className="lbx-tier__body">
          <div className="lbx-tier__head">
            <span className="lbx-tier__place">
              {tier.rank}-o‘rin · {tier.members.length} nafar o‘quvchi
            </span>
            <Coins value={tier.coins} size="lg" />
          </div>
          <ul className="lbx-tier__list">
            {tier.members.map((m) => (
              <li key={m.student.id}>
                <Link href={`/students/${m.student.id}`} className="lbx-person">
                  <span className="lbx-avatar" aria-hidden>{initialsOf(m.student.name)}</span>
                  <span className="lbx-person__text">
                    <span className="lbx-person__name">{m.student.name}</span>
                    <span className="lbx-person__sub">{groupOf(m)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

function Seg<T extends string>({ label, icon, value, options, onChange }: { label: string; icon: ReactNode; value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="lbx-filter" role="group" aria-label={label}>
      <span className="lbx-filter__label">
        {icon}
        {label}:
      </span>
      <div className="lbx-filter__opts">
        {options.map((o) => (
          <button key={o.id} type="button" className="lbx-chip" aria-pressed={value === o.id} onClick={() => onChange(o.id)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function LeaderboardPage() {
  const { activeGroups, activeStudents, lessons, lessonsByStudent, topicsByStudent } = useData();
  const hw = useHomework();
  const { coinEvents } = hw;
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
  const groupOf = (s: Standing) => groupName.get(s.student.group_id) ?? "";

  // Existing ranking, unchanged: buildStandings (competition ranking, ties share a rank).
  const standings = useMemo(() => {
    const pool = scopeGroup ? activeStudents.filter((s) => s.group_id === scopeGroup.id) : activeStudents;
    return buildStandings(pool, lessons, range, coinEvents);
  }, [activeStudents, lessons, range, scopeGroup, coinEvents]);

  const tiers = useMemo(() => podiumTiers(standings), [standings]);
  const stacked = tiers.some((t) => t.members.length > PODIUM_MAX_PER_CARD);

  const groupStandings = useMemo(
    () => buildGroupStandings(activeGroups, buildStandings(activeStudents, lessons, range, coinEvents)),
    [activeGroups, activeStudents, lessons, range, coinEvents],
  );

  // "No results" means no lesson has been marked in this period for the people shown.
  const hasResults = useMemo(() => {
    const ids = new Set(standings.map((s) => s.student.id));
    return lessons.some((l) => ids.has(l.student_id) && inRange(l.lesson_date, range));
  }, [lessons, standings, range]);

  const lastWeekStar = useMemo(() => {
    const from = addDays(thisWeek, -7);
    const top = buildStandings(activeStudents, lessons, { from, to: addDays(from, 6) }, coinEvents);
    const best = top[0]?.coins ?? 0;
    if (best <= 0) return null;
    return { names: top.filter((s) => s.coins === best).map((s) => s.student.name), coins: best };
  }, [activeStudents, lessons, thisWeek, coinEvents]);

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

  const periodText =
    period === "week"
      ? `Hafta: ${formatShort(thisWeek)} – ${formatShort(addDays(thisWeek, 6))}`
      : period === "month"
        ? "Oxirgi 30 kun"
        : "Butun davr";
  const subtitle = `${scope === "groups" ? "Guruhlar natijalari" : "O‘quvchilar natijalari"} · ${periodText}${scopeGroup ? ` · ${scopeGroup.name}` : ""}`;

  const scopeOptions: { id: Scope; label: string }[] = [
    { id: "all", label: "Hamma" },
    ...activeGroups.map((g) => ({ id: g.id, label: g.name })),
    { id: "groups", label: "Guruhlar" },
  ];

  const header = (
    <header className="lbx-head">
      <span className="lbx-head__icon" aria-hidden>
        <Trophy strokeWidth={1.9} />
      </span>
      <div>
        <h1 className="page-title">Reyting</h1>
        {activeStudents.length > 0 && <p className="page-sub" aria-live="polite">{subtitle}</p>}
      </div>
    </header>
  );

  if (!activeStudents.length) {
    return (
      <div className="lbx">
        {header}
        <div className="card empty">
          <strong>Hali natijalar mavjud emas.</strong>
          <p>O&apos;quvchi qo&apos;shing va birinchi darsni belgilang, tangalar shu yerda paydo bo&apos;ladi.</p>
          <p style={{ marginTop: 14 }}>
            <Link className="btn btn--primary" href="/students">
              O&apos;quvchi qo&apos;shish
            </Link>
          </p>
        </div>
      </div>
    );
  }

  // Smart Homework coins are part of every total: never show a ranking computed without them.
  const hwLoading = hw.status === "loading";

  return (
    <div className="lbx">
      {header}

      <div className="lbx-filters">
        <Seg label="Davr" icon={<CalendarDays aria-hidden size={15} strokeWidth={1.9} />} value={period} options={PERIODS} onChange={setPeriod} />
        <Seg label="Guruh" icon={<Users aria-hidden size={15} strokeWidth={1.9} />} value={scope} options={scopeOptions} onChange={setScope} />
      </div>

      {hw.status === "error" && (
        <div className="lbx-alert" role="alert">
          Smart Homework tangalari yuklanmadi, shuning uchun reyting ko‘rsatilmaydi.
          <button type="button" className="btn btn--sm" onClick={() => void hw.reload()}>
            Qayta urinish
          </button>
        </div>
      )}

      {period === "week" && lastWeekStar && scope !== "groups" && !hwLoading && hw.status !== "error" && (
        <p className="callout">
          <IconCoin width={18} height={18} aria-hidden />
          O&apos;tgan hafta yulduzi: {lastWeekStar.names.join(", ")} ({lastWeekStar.coins} tanga)
        </p>
      )}

      {hwLoading ? (
        <div className="lbx-skel" aria-busy="true" aria-label="Reyting yuklanmoqda">
          <div className="skeleton" style={{ height: 168 }} />
          <div className="skeleton" style={{ height: 260 }} />
        </div>
      ) : hw.status === "error" ? null : !hasResults ? (
        <div className="card empty">
          <strong>Hali natijalar mavjud emas.</strong>
          <p>Bu davrda hali birorta dars belgilanmagan.</p>
        </div>
      ) : scope === "groups" ? (
        <section className="card lbx-board" aria-labelledby="lbx-groups-title">
          <div className="lbx-board__head">
            <h2 id="lbx-groups-title" className="lbx-board__title">
              <Users aria-hidden size={18} strokeWidth={1.9} /> Guruhlar reytingi
            </h2>
          </div>
          <table className="lbx-table lbx-table--groups">
            <thead>
              <tr>
                <th scope="col" className="lbx-c-pos">O‘rin</th>
                <th scope="col">Guruh</th>
                <th scope="col" className="lbx-c-num">O‘quvchilar</th>
                <th scope="col" className="lbx-c-num">Jami tanga</th>
                <th scope="col" className="lbx-c-coin">O‘rtacha</th>
              </tr>
            </thead>
            <tbody>
              {groupStandings.map((g) => (
                <tr key={g.group.id}>
                  <td className="lbx-c-pos">{g.average > 0 ? <RankMark rank={g.rank} /> : <span className="lbx-pos">{g.rank}</span>}</td>
                  <th scope="row" className="lbx-c-who">
                    <span className="lbx-person__name">{g.group.name}</span>
                  </th>
                  <td className="lbx-c-num" data-label="O‘quvchilar">{g.students}</td>
                  <td className="lbx-c-num" data-label="Jami tanga">{g.total}</td>
                  <td className="lbx-c-coin" data-label="O‘rtacha"><Coins value={g.average.toFixed(1)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : standings.length === 0 ? (
        <div className="card empty">
          <strong>Bu guruhda o&apos;quvchi yo&apos;q</strong>
        </div>
      ) : (
        <>
          {tiers.length > 0 && (
            <section className="lbx-stage" aria-label="G‘oliblar">
              <ol className={`lbx-podium lbx-podium--${tiers.length}${stacked ? " lbx-podium--stack" : ""}`}>
                {(stacked ? tiers : podiumOrder(tiers)).map((t) => (
                  <PodiumCard key={t.rank} tier={t} groupOf={groupOf} stacked={stacked} />
                ))}
              </ol>
            </section>
          )}

          <section className="card lbx-board" aria-labelledby="lbx-all-title">
            <div className="lbx-board__head">
              <h2 id="lbx-all-title" className="lbx-board__title">
                <Users aria-hidden size={18} strokeWidth={1.9} /> Barcha o‘quvchilar reytingi
              </h2>
              <span className="lbx-board__meta">{standings.length} nafar o‘quvchi</span>
            </div>
            <table className="lbx-table">
              <thead>
                <tr>
                  <th scope="col" className="lbx-c-pos">O‘rin</th>
                  <th scope="col">O‘quvchi</th>
                  <th scope="col" className="lbx-c-num">
                    <span className="lbx-th">
                      <CircleCheck aria-hidden size={14} strokeWidth={2} className="lbx-th__ok" /> To‘liq <Hint label="To‘liq" text={HINT.full} />
                    </span>
                  </th>
                  <th scope="col" className="lbx-c-num">
                    <span className="lbx-th">
                      <ClipboardCheck aria-hidden size={14} strokeWidth={2} /> Davomat <Hint label="Davomat" text={HINT.attendance} />
                    </span>
                  </th>
                  <th scope="col" className="lbx-c-coin">
                    <span className="lbx-th">
                      Tanga <Hint label="Tanga" text={HINT.coins} />
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {standings.map((s) => {
                  const medal = s.coins > 0 ? MEDAL[s.rank] : undefined;
                  return (
                    <tr key={s.student.id} className={medal ? `lbx-row--${medal}` : undefined}>
                      <td className="lbx-c-pos">{medal ? <RankMark rank={s.rank} /> : <span className="lbx-pos">{s.rank}</span>}</td>
                      <th scope="row" className="lbx-c-who">
                        <Link href={`/students/${s.student.id}`} className="lbx-person">
                          <span className={`lbx-avatar${medal ? ` lbx-medal--${medal}` : ""}`} aria-hidden>{initialsOf(s.student.name)}</span>
                          <span className="lbx-person__text">
                            <span className="lbx-person__name">{s.student.name}</span>
                            {!scopeGroup && <span className="lbx-person__sub">{groupOf(s)}</span>}
                          </span>
                        </Link>
                      </th>
                      <td className="lbx-c-num" data-label="To‘liq">
                        <span className={`lbx-full${s.full > 0 ? "" : " lbx-full--zero"}`}>{s.full}</span>
                      </td>
                      <td className="lbx-c-num" data-label="Davomat">
                        {s.attended}/{s.attended + s.absent}
                      </td>
                      <td className="lbx-c-coin" data-label="Tanga">
                        <Coins value={s.coins} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </>
      )}

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
