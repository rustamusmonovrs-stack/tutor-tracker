import { mean, pct, type ReportModel } from "./report";

/** Pooled figures over one or more group reports (same rules as a single report: no unmarked data in denominators). */
export function summarize(models: ReportModel[]) {
  const rows = models.flatMap((m) => m.rows);
  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((a, r) => a + f(r), 0);
  const pcts = models.flatMap((m) =>
    m.tests.flatMap((t) =>
      m.rows.map((r) => r.scores[t.lessonId]).filter((v): v is number => v !== null).map((v) => (v / t.max) * 100),
    ),
  );
  return {
    groups: models.length,
    students: rows.length,
    lessons: models.reduce((a, m) => a + m.summary.lessons, 0),
    attendancePct: pct(sum((r) => r.present), sum((r) => r.present + r.absent)),
    homeworkPct: pct(sum((r) => r.submitted), sum((r) => r.submitted + r.notSubmitted)),
    testsCount: models.reduce((a, m) => a + m.tests.length, 0),
    avgTestPct: mean(pcts),
  };
}

/** One student's normalised test results over time (only tests with an entered score). */
export function studentTestHistory(model: ReportModel, studentId: string) {
  const row = model.rows.find((r) => r.studentId === studentId);
  if (!row) return [];
  return model.tests.flatMap((t) => {
    const score = row.scores[t.lessonId];
    return score === null ? [] : [{ date: t.date, title: t.title, score, max: t.max, pct: Math.round((score / t.max) * 1000) / 10 }];
  });
}
