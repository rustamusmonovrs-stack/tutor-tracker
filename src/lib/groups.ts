/**
 * Permanent group deletion is only offered when nothing would be lost. Verified against the live schema
 * (foreign keys referencing public.groups): students and mocks are RESTRICT; homework_tasks, lesson_plans,
 * saturday_plans and homework_watch_cases CASCADE (so they would silently disappear); student_book_history and
 * student_group_transfer_history are SET NULL (history would lose its group). Any of those blocks deletion here.
 * Mocks cannot be counted on the Bugun page; the database refuses that delete (RESTRICT) and the error is shown.
 */
export interface GroupFacts {
  groupId: string;
  students: { group_id: string }[];
  lessonPlans: { group_id: string }[];
  tasks: { group_id: string }[];
  watchCases: { group_id: string }[];
  saturdayPlans: { group_id?: string | null }[];
  transfers: { from_group_id: string | null; to_group_id: string | null }[];
  stints: { group_id?: string | null }[];
}

export interface DeleteBlockers {
  students: number;
  lessonPlans: number;
  tasks: number;
  watchCases: number;
  saturdayPlans: number;
  history: number;
  total: number;
}

export function groupDeleteBlockers(f: GroupFacts): DeleteBlockers {
  const students = f.students.filter((s) => s.group_id === f.groupId).length;
  const lessonPlans = f.lessonPlans.filter((p) => p.group_id === f.groupId).length;
  const tasks = f.tasks.filter((t) => t.group_id === f.groupId).length;
  const watchCases = f.watchCases.filter((c) => c.group_id === f.groupId).length;
  const saturdayPlans = f.saturdayPlans.filter((p) => p.group_id === f.groupId).length;
  const history =
    f.transfers.filter((t) => t.from_group_id === f.groupId || t.to_group_id === f.groupId).length +
    f.stints.filter((s) => s.group_id === f.groupId).length;
  return { students, lessonPlans, tasks, watchCases, saturdayPlans, history, total: students + lessonPlans + tasks + watchCases + saturdayPlans + history };
}

/** Human-readable reasons (Uzbek), empty when the group is empty and may be deleted. */
export function blockerLines(b: DeleteBlockers): string[] {
  const out: string[] = [];
  if (b.students) out.push(`${b.students} ta o'quvchi (arxivdagilar bilan)`);
  if (b.lessonPlans) out.push(`${b.lessonPlans} ta dars rejasi / mavzu yozuvi`);
  if (b.tasks) out.push(`${b.tasks} ta vazifa (arxivdagilar bilan)`);
  if (b.watchCases) out.push(`${b.watchCases} ta nazorat yozuvi`);
  if (b.saturdayPlans) out.push(`${b.saturdayPlans} ta shanba rejasi`);
  if (b.history) out.push(`${b.history} ta bosqich / ko'chirish tarixi`);
  return out;
}
