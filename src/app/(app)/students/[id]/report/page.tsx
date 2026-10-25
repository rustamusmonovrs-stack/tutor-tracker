"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { BookSegments } from "@/components/LearningProgressCard";
import { IconChevronLeft, IconPrint } from "@/components/icons";
import { useData } from "@/lib/data";
import { addDays, formatDate, todayISO } from "@/lib/dates";
import { formatPct, totalsFor } from "@/lib/mock";
import { useMockStore } from "@/lib/mockData";
import { buildOutlook, durationText, NO_DATA, sortBooks, summarizeStudent, weeksText, approxMonth, type Book } from "@/lib/stages";
import { useStages } from "@/lib/stagesData";

export default function ParentReportPage() {
  const { id } = useParams<{ id: string }>();
  const { students, groups, lessonsByStudent } = useData();
  const stages = useStages();
  const mock = useMockStore();
  const today = todayISO();

  const student = students.find((s) => s.id === id);
  const group = groups.find((g) => g.id === student?.group_id);
  const lessons = useMemo(() => lessonsByStudent.get(id) ?? [], [lessonsByStudent, id]);
  const sum = useMemo(
    () =>
      summarizeStudent({
        stints: stages.stintsByStudent.get(id) ?? [],
        progress: stages.progressByStudent.get(id) ?? null,
        books: stages.books,
        lessons,
        today,
      }),
    [stages.stintsByStudent, stages.progressByStudent, stages.books, lessons, id, today],
  );

  // Only THIS student's rows are read below; nothing about other students reaches the page.
  const mocks = useMemo(() => {
    if (mock.status !== "ready") return [];
    const mine = mock.results.filter((r) => r.student_id === id && r.attendance !== "absent");
    return mine
      .map((r) => {
        const m = mock.mocks.find((x) => x.id === r.mock_id);
        if (!m || m.status !== "completed") return null;
        const secs = mock.sections.filter((s) => s.mock_id === m.id);
        const map = new Map(mock.scores.filter((s) => s.result_id === r.id).map((s) => [s.section_id, s.correct]));
        const t = totalsFor(secs, map);
        return t.complete ? { mock: m, totals: t } : null;
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x))
      .sort((a, b) => b.mock.mock_date.localeCompare(a.mock.mock_date))
      .slice(0, 5);
  }, [mock.status, mock.results, mock.mocks, mock.sections, mock.scores, id]);

  if (!student) {
    return (
      <div className="card empty">
        <strong>O&apos;quvchi topilmadi</strong>
        <p style={{ marginTop: 14 }}>
          <Link className="btn" href="/students">O&apos;quvchilarga qaytish</Link>
        </p>
      </div>
    );
  }
  if (stages.status !== "ready") {
    return (
      <div className="card card--pad">
        <p className="hint">{stages.status === "loading" ? "Yuklanmoqda…" : "Bosqichlar moduli yuklanmadi, hisobot tayyor emas."}</p>
      </div>
    );
  }

  const { view, book } = sum;
  const progress = stages.progressByStudent.get(id) ?? null;
  const ordered = sortBooks(stages.books);
  const completed = view.completedBookIds.map((b) => stages.bookById.get(b)).filter((b): b is Book => Boolean(b));
  const last30 = lessons.filter((l) => l.lesson_date >= addDays(today, -29));
  const present30 = last30.filter((l) => l.attendance === "present").length;
  const absent30 = last30.filter((l) => l.attendance === "absent").length;
  const present = lessons.filter((l) => l.attendance === "present").length;
  const absent = lessons.filter((l) => l.attendance === "absent").length;

  const outlook = buildOutlook({
    stage: view.state,
    bookTitle: book?.title ?? null,
    attendanceRate: sum.attendance,
    book: sum.forecast,
    program: sum.program,
  });

  return (
    <>
      <div className="report-actions">
        <Link href={`/students/${id}`} className="btn btn--ghost btn--sm" style={{ paddingLeft: 4 }}>
          <IconChevronLeft aria-hidden /> Profil
        </Link>
        <button className="btn btn--primary" onClick={() => window.print()}>
          <IconPrint aria-hidden /> Chop etish / PDF saqlash
        </button>
      </div>

      <article className="report" aria-label="Ota-onalar hisoboti">
        <header className="report__head">
          <div className="report__brand">
            <span className="nav__mark" aria-hidden>A</span>
            <div>
              <strong>ARK Education</strong>
              <small>Ota-onalar hisoboti</small>
            </div>
          </div>
          <time className="report__date" dateTime={today}>{formatDate(today)}</time>
        </header>

        <section className="report__who">
          <h1>{student.name}</h1>
          <dl>
            <div><dt>Guruh</dt><dd>{group?.name ?? "—"}</dd></div>
            <div><dt>Hozirgi level</dt><dd>{sum.level ?? "Belgilanmagan"}</dd></div>
            <div>
              <dt>Hozirgi kitob</dt>
              <dd>{view.state === "done" ? "Dastur yakunlangan" : book ? book.title : "Belgilanmagan"}</dd>
            </div>
          </dl>
        </section>

        <section className="report__sec">
          <h2>{ordered.length || 9} kitoblik dastur</h2>
          {ordered.length > 0 ? (
            <>
              <BookSegments books={stages.books} completed={view.completedBookIds} activeId={view.state === "active" ? (book?.id ?? null) : null} />
              <p className="report__legend">
                <span><i className="dot dot--done" /> Tugatilgan</span>
                <span><i className="dot dot--now" /> Hozir o‘qilmoqda</span>
                <span><i className="dot dot--todo" /> Boshlanmagan</span>
              </p>
            </>
          ) : (
            <p className="hint">O‘quv dasturi kiritilmagan.</p>
          )}
          <p>
            <strong>Tugatilgan kitoblar:</strong>{" "}
            {completed.length ? sortBooks(completed).map((b) => b.title).join(", ") : "Hali tugatilgan kitob yo‘q"}
          </p>
          {view.active && (
            <p>
              <strong>Joriy kitobda:</strong> {formatDate(view.active.started_on)} dan beri ({durationText(view.active.started_on, today)})
            </p>
          )}
        </section>

        <section className="report__sec">
          <h2>Taxminiy muddatlar</h2>
          {view.state === "active" && sum.forecast?.ok ? (
            <ul>
              <li>
                Joriy kitobning tugashi:{" "}
                <strong>{sum.forecast.due ? "rejalashtirilgan muddat yakunlanmoqda" : `taxminan ${weeksText(sum.forecast.remainingWeeks ?? 0)} (≈ ${approxMonth(sum.forecast.finishOn!)})`}</strong>
              </li>
              {sum.program?.ok && (sum.program.futureBooks ?? 0) > 0 ? (
                <li>
                  Oxirgi kitobgacha: <strong>taxminan {weeksText(sum.program.remainingWeeks ?? 0)} (≈ {approxMonth(sum.program.finishOn!)})</strong>
                </li>
              ) : (
                (sum.program?.futureBooks ?? 1) > 0 && <li>Oxirgi kitobgacha: {NO_DATA.toLowerCase()}</li>
              )}
            </ul>
          ) : (
            <p className="hint">{view.state === "done" ? "Dastur yakunlangan." : NO_DATA + "."}</p>
          )}
          <p className="report__note">Muddatlar taxminiy; o‘quvchining haqiqiy sur’atiga qarab o‘zgarishi mumkin.</p>
        </section>

        <section className="report__cols">
          <div className="report__sec">
            <h2>Davomat</h2>
            {present + absent ? (
              <>
                <p className="report__big">{sum.attendance}%</p>
                <p className="hint">Barcha vaqt: {present} keldi · {absent} kelmadi</p>
                <p className="hint">Oxirgi 30 kun: {present30} keldi · {absent30} kelmadi</p>
              </>
            ) : (
              <p className="hint">Davomat hali belgilanmagan.</p>
            )}
          </div>
          <div className="report__sec">
            <h2>Mock natijalari</h2>
            {mocks.length ? (
              <ul className="report__mocks">
                {mocks.map(({ mock: m, totals }) => (
                  <li key={m.id}>
                    <span>{m.name} <small>{formatDate(m.mock_date)}</small></span>
                    <strong>{totals.correct}/{totals.total} · {formatPct(totals.pct ?? 0)}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hint">Hali yakunlangan mock natijasi yo‘q.</p>
            )}
          </div>
        </section>

        <section className="report__sec">
          <h2>O‘qituvchi xulosasi</h2>
          <p>{progress?.teacher_note ?? <span className="hint">O‘qituvchi xulosasi hali kiritilmagan.</span>}</p>
          <h2 style={{ marginTop: 14 }}>Keyingi o‘quv maqsadi</h2>
          <p>{progress?.next_goal ?? <span className="hint">Keyingi maqsad hali belgilanmagan.</span>}</p>
        </section>

        <section className="report__outlook">
          <h2>Agar farzandingiz shu sur’atda o‘qishda davom etsa…</h2>
          <p>{outlook}</p>
        </section>

        <footer className="report__foot">ARK Education · {formatDate(today)} holatiga ko‘ra tayyorlandi</footer>
      </article>
    </>
  );
}
