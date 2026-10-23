/** Legacy single-status value (column kept for rollback; no longer written by the app). */
export type LegacyResult = "full" | "partial" | "not_done" | "not_understood" | "absent";

export type Attendance = "present" | "absent";
export type Homework = "full" | "partial" | "not_done";

export interface Group {
  id: string;
  name: string;
  archived_at: string | null;
  created_at: string;
}

export interface Student {
  id: string;
  group_id: string;
  name: string;
  archived_at: string | null;
  created_at: string;
}

export interface Topic {
  id: string;
  student_id: string;
  position: number;
  title: string;
}

/**
 * One row per student per day. `attendance` and `homework` are independent:
 * null means "not marked yet" (never the same as absent / not done).
 */
export interface Lesson {
  id: string;
  student_id: string;
  topic_id: string | null;
  topic_title: string;
  lesson_date: string; // YYYY-MM-DD, Asia/Tashkent calendar day
  attendance: Attendance | null;
  homework: Homework | null;
  created_at: string;
}

/** What was taught (topic) and what is assigned (homework) for a whole group on one day. */
export interface LessonPlan {
  id: string;
  group_id: string;
  lesson_date: string;
  topic: string | null;
  homework: string | null;
  updated_at: string;
}
