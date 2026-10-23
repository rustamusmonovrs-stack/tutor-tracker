import { describe, expect, it } from "vitest";
import { addDays, todayISO, weekStart } from "./dates";
import { currentTopic, repeatCount } from "./progress";
import { buildGroupStandings, buildStandings, scoreLessons } from "./scoring";
import type { Group, Lesson, LessonResult, Student, Topic } from "./types";

let seq = 0;
function lesson(
  student_id: string,
  lesson_date: string,
  result: LessonResult,
  topic_id: string | null = null,
): Lesson {
  seq += 1;
  return {
    id: `l${seq}`,
    student_id,
    topic_id,
    topic_title: "t",
    lesson_date,
    result,
    created_at: `2026-01-01T00:00:${String(seq).padStart(2, "0")}Z`,
  };
}

const student = (id: string, group_id: string, name = id): Student => ({
  id,
  group_id,
  name,
  archived_at: null,
  created_at: "2026-01-01T00:00:00Z",
});

describe("scoreLessons", () => {
  it("gives 2 / 1 / 0 coins per result", () => {
    const scored = scoreLessons([
      lesson("a", "2026-10-05", "full"),
      lesson("a", "2026-10-06", "partial"),
      lesson("a", "2026-10-07", "not_done"),
      lesson("a", "2026-10-08", "not_understood"),
      lesson("a", "2026-10-09", "absent"),
    ]);
    expect(scored.map((s) => s.coins)).toEqual([2, 1, 0, 0, 0]);
  });

  it("adds +1 on every third consecutive full lesson", () => {
    const scored = scoreLessons(
      Array.from({ length: 6 }, (_, i) => lesson("a", `2026-10-0${i + 1}`, "full")),
    );
    expect(scored.map((s) => s.coins)).toEqual([2, 2, 3, 2, 2, 3]);
  });

  it("a partial lesson resets the streak, an absence does not", () => {
    const broken = scoreLessons([
      lesson("a", "2026-10-01", "full"),
      lesson("a", "2026-10-02", "full"),
      lesson("a", "2026-10-03", "partial"),
      lesson("a", "2026-10-04", "full"),
    ]);
    expect(broken.map((s) => s.bonus)).toEqual([0, 0, 0, 0]);

    const withAbsence = scoreLessons([
      lesson("a", "2026-10-01", "full"),
      lesson("a", "2026-10-02", "full"),
      lesson("a", "2026-10-03", "absent"),
      lesson("a", "2026-10-04", "full"),
    ]);
    expect(withAbsence.map((s) => s.bonus)).toEqual([0, 0, 0, 1]);
  });

  it("scores in date order regardless of input order", () => {
    const scored = scoreLessons([
      lesson("a", "2026-10-03", "full"),
      lesson("a", "2026-10-01", "full"),
      lesson("a", "2026-10-02", "full"),
    ]);
    expect(scored.map((s) => s.lesson.lesson_date)).toEqual([
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
    ]);
    expect(scored[2].bonus).toBe(1);
  });
});

describe("standings", () => {
  const students = [student("a", "g1", "Ali"), student("b", "g1", "Vali"), student("c", "g2", "Dilnoza")];

  it("ranks by coins in range, ties share a rank", () => {
    const lessons = [
      lesson("a", "2026-10-19", "full"),
      lesson("b", "2026-10-19", "full"),
      lesson("c", "2026-10-19", "partial"),
      lesson("c", "2026-10-12", "full"), // outside the week
    ];
    const rows = buildStandings(students, lessons, { from: "2026-10-19", to: "2026-10-25" });
    expect(rows.map((r) => [r.student.name, r.coins, r.rank])).toEqual([
      ["Ali", 2, 1],
      ["Vali", 2, 1],
      ["Dilnoza", 1, 3],
    ]);
  });

  it("overall (no range) includes everything", () => {
    const lessons = [lesson("c", "2026-10-12", "full"), lesson("c", "2026-10-19", "partial")];
    const rows = buildStandings(students, lessons, { from: null, to: null });
    expect(rows[0].student.name).toBe("Dilnoza");
    expect(rows[0].coins).toBe(3);
  });

  it("streak carries over from before the range", () => {
    const lessons = [
      lesson("a", "2026-10-12", "full"),
      lesson("a", "2026-10-13", "full"),
      lesson("a", "2026-10-19", "full"), // 3rd in a row, falls in this week
    ];
    const rows = buildStandings(students, lessons, { from: "2026-10-19", to: "2026-10-25" });
    expect(rows.find((r) => r.student.id === "a")?.coins).toBe(3);
  });

  it("group ranking uses the average so group size does not matter", () => {
    const groups: Group[] = [
      { id: "g1", name: "A", archived_at: null, created_at: "" },
      { id: "g2", name: "B", archived_at: null, created_at: "" },
    ];
    const lessons = [
      lesson("a", "2026-10-19", "full"), // g1: 2 coins / 2 students = 1
      lesson("c", "2026-10-19", "full"), // g2: 2 coins / 1 student = 2
    ];
    const standings = buildStandings(students, lessons, { from: null, to: null });
    const rows = buildGroupStandings(groups, standings);
    expect(rows.map((r) => [r.group.id, r.average, r.rank])).toEqual([
      ["g2", 2, 1],
      ["g1", 1, 2],
    ]);
  });
});

describe("topic progress", () => {
  const topics: Topic[] = [
    { id: "t1", student_id: "a", position: 1, title: "One" },
    { id: "t2", student_id: "a", position: 2, title: "Two" },
    { id: "t3", student_id: "a", position: 3, title: "Three" },
  ];

  it("advances only on full lessons", () => {
    expect(currentTopic(topics, [])?.id).toBe("t1");
    expect(currentTopic(topics, [lesson("a", "2026-10-01", "partial", "t1")])?.id).toBe("t1");
    expect(currentTopic(topics, [lesson("a", "2026-10-01", "full", "t1")])?.id).toBe("t2");
  });

  it("returns null when the plan is finished", () => {
    const all = topics.map((t, i) => lesson("a", `2026-10-0${i + 1}`, "full", t.id));
    expect(currentTopic(topics, all)).toBeNull();
  });

  it("counts repeats on the current topic, ignoring absences", () => {
    const ls = [
      lesson("a", "2026-10-01", "partial", "t1"),
      lesson("a", "2026-10-02", "not_understood", "t1"),
      lesson("a", "2026-10-03", "absent", "t1"),
    ];
    expect(repeatCount(topics[0], ls)).toBe(2);
    expect(repeatCount(null, ls)).toBe(0);
  });
});

describe("dates", () => {
  it("finds Monday of the week", () => {
    expect(weekStart("2026-10-23")).toBe("2026-10-19"); // Friday
    expect(weekStart("2026-10-19")).toBe("2026-10-19"); // Monday
    expect(weekStart("2026-10-25")).toBe("2026-10-19"); // Sunday
  });

  it("adds days across month boundaries", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("uses the Tashkent calendar day, not UTC", () => {
    // 20:00 UTC on the 22nd is already 01:00 on the 23rd in Tashkent (UTC+5)
    expect(todayISO(new Date("2026-10-22T20:00:00Z"))).toBe("2026-10-23");
    expect(todayISO(new Date("2026-10-22T18:59:00Z"))).toBe("2026-10-22");
  });
});
