import type { LessonResult } from "./types";

/** Coins per result. Change here and every ranking updates (nothing is stored). */
export const COINS: Record<LessonResult, number> = {
  full: 2,
  partial: 1,
  not_done: 0,
  not_understood: 0,
  absent: 0,
};

/** Every Nth consecutive "full" lesson earns the bonus. Absences do not break a streak. */
export const STREAK_LENGTH = 3;
export const STREAK_BONUS = 1;

/** A topic repeated this many times is flagged on the Leaderboard. */
export const STUCK_AFTER = 3;

export const RESULT_ORDER: LessonResult[] = [
  "full",
  "partial",
  "not_done",
  "absent",
];

export const RESULT_META: Record<
  LessonResult,
  { label: string; hint: string; advances: boolean }
> = {
  full: { label: "To'liq", hint: "Mavzu o'tildi", advances: true },
  partial: { label: "Chala", hint: "Yarmi qilindi", advances: false },
  not_done: { label: "Keldi", hint: "Darsga keldi, vazifa yo'q", advances: false },
  not_understood: { label: "Tushunmadi", hint: "Qayta tushuntirish", advances: false },
  absent: { label: "Kelmadi", hint: "Darsda yo'q", advances: false },
};

export const TIME_ZONE = "Asia/Tashkent";
