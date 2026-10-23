export type LessonResult =
  | "full"
  | "partial"
  | "not_done"
  | "not_understood"
  | "absent";

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

export interface Lesson {
  id: string;
  student_id: string;
  topic_id: string | null;
  topic_title: string;
  lesson_date: string; // YYYY-MM-DD, Asia/Tashkent calendar day
  result: LessonResult;
  created_at: string;
}
