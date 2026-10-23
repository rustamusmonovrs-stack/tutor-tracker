import type { Attendance, Homework, LegacyResult } from "./types";

/**
 * Mapping used by the SQL migration (supabase/migrations/20261023_attendance_homework.sql),
 * mirrored here so tests can prove old and new scoring agree.
 * `not_understood` is deliberately unmapped: the migration aborts if such rows exist.
 */
export function mapLegacy(result: Exclude<LegacyResult, "not_understood">): {
  attendance: Attendance;
  homework: Homework | null;
} {
  switch (result) {
    case "full":
      return { attendance: "present", homework: "full" };
    case "partial":
      return { attendance: "present", homework: "partial" };
    case "not_done":
      return { attendance: "present", homework: "not_done" };
    case "absent":
      return { attendance: "absent", homework: null };
  }
}
