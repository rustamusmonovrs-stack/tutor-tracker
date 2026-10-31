export type SubjectKey = "math" | "history";

export const SUBJECTS: Record<SubjectKey, { label: string; path: string }> = {
  math: { label: "Matematika", path: "/math" },
  history: { label: "Tarix", path: "/history" },
};

export function isSubjectKey(v: unknown): v is SubjectKey {
  return v === "math" || v === "history";
}

export type SubjectAttendance = "present" | "absent";
/** null (no record) = not marked; "unchecked" = teacher has not reviewed it yet. Neither counts as "not submitted". */
export type SubjectHomework = "submitted" | "not_submitted" | "unchecked";

export interface SubjectGroup {
  id: string;
  subject: SubjectKey;
  name: string;
  archived_at: string | null;
  created_at: string;
}

export interface SubjectStudent {
  id: string;
  subject: SubjectKey;
  group_id: string;
  name: string;
  english_student_id: string | null;
  archived_at: string | null;
  created_at: string;
}

export interface SubjectLesson {
  id: string;
  subject: SubjectKey;
  group_id: string;
  lesson_date: string; // YYYY-MM-DD
  topic: string | null;
  homework: string | null;
  has_test: boolean;
  test_title: string | null;
  test_max: number | null;
  updated_at: string;
}

export interface SubjectRecord {
  id: string;
  subject: SubjectKey;
  group_id: string;
  lesson_id: string;
  student_id: string;
  attendance: SubjectAttendance | null;
  homework: SubjectHomework | null;
  /** null = not entered. 0 is a real zero. */
  score: number | null;
  updated_at: string;
}
