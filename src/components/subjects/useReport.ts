"use client";

import { useMemo } from "react";
import { todayISO } from "@/lib/dates";
import { useSubjectScope } from "@/lib/subjects/data";
import { buildReport, type ReportModel } from "@/lib/subjects/report";

/** Report model for one group of the current subject. All inputs are already subject-scoped by useSubjectScope. */
export function useGroupReport(groupId: string | null, from: string, to: string, studentId?: string | null): ReportModel | null {
  const { subject, groups, students, lessons, records } = useSubjectScope();
  return useMemo(() => {
    const group = groups.find((g) => g.id === groupId);
    if (!group) return null;
    return buildReport({ subject, group, students, lessons, records, from, to, studentId, generatedOn: todayISO() });
  }, [subject, groups, students, lessons, records, groupId, from, to, studentId]);
}
