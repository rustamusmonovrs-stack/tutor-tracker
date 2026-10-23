import type { Attendance, Homework } from "./types";

/** Coins per homework result. Change here and every ranking updates (nothing is stored). */
export const HOMEWORK_COINS: Record<Homework, number> = {
  full: 2,
  partial: 1,
  not_done: 0,
};

/** Every Nth consecutive "full" homework earns the bonus. Absences / unassessed days do not break a streak. */
export const STREAK_LENGTH = 3;
export const STREAK_BONUS = 1;

/** A topic repeated this many times is flagged on the Leaderboard. */
export const STUCK_AFTER = 3;

export const ATTENDANCE_ORDER: Attendance[] = ["present", "absent"];
export const ATTENDANCE_META: Record<Attendance, { label: string; hint: string }> = {
  present: { label: "Keldi", hint: "Darsda qatnashdi" },
  absent: { label: "Kelmadi", hint: "Darsda yo'q" },
};

export const HOMEWORK_ORDER: Homework[] = ["full", "partial", "not_done"];
export const HOMEWORK_META: Record<Homework, { label: string; hint: string }> = {
  full: { label: "To'liq", hint: "Uy vazifasi to'liq bajarildi" },
  partial: { label: "Chala", hint: "Uy vazifasi qisman bajarildi" },
  not_done: { label: "Qilmadi", hint: "Uy vazifasi bajarilmadi" },
};

export const TIME_ZONE = "Asia/Tashkent";
