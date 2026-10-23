import { describe, expect, it } from "vitest";
import { addDays, diffDays, formatDay, todayISO, weekStart } from "./dates";
import { mapLegacy } from "./legacy";
import { currentTopic, repeatCount } from "./progress";
import { buildGroupStandings, buildStandings, currentStreak, scoreLessons, summarize } from "./scoring";
import type { Attendance, Group, Homework, Lesson, LegacyResult, Student, Topic } from "./types";

let seq = 0;
/** Shorthand: `hw` = homework grade (attendance defaults to present, or absent when hw is null and `abs`). */
function lesson(
  student_id: string,
  lesson_date: string,
  homework: Homework | null,
  topic_id: string | null = null,
  attendance: Attendance | null = homework ? "present" : "absent",
): Lesson {
  seq += 1;
  return {
    id: `l${seq}`,
    student_id,
    topic_id,
    topic_title: "t",
    lesson_date,
    attendance,
    homework,
    created_at: `2026-01-01T00:00:${String(seq).padStart(2, "0")}Z`,
  };
}
const absent = (id: string, date: string) => lesson(id, date, null, null, "absent");

const student = (id: string, group_id: string, name = id): Student => ({
  id,
  group_id,
  name,
  archived_at: null,
  created_at: "2026-01-01T00:00:00Z",
});

describe("scoreLessons", () => {
  it("gives 2 / 1 / 0 coins per homework grade and 0 for attendance alone", () => {
    const scored = scoreLessons([
      lesson("a", "2026-10-05", "full"),
      lesson("a", "2026-10-06", "partial"),
      lesson("a", "2026-10-07", "not_done"),
      absent("a", "2026-10-08"),
      lesson("a", "2026-10-09", null, null, "present"), // came, homework not graded yet
    ]);
    expect(scored.map((s) => s.coins)).toEqual([2, 1, 0, 0, 0]);
  });

  it("adds +1 on every third consecutive full homework", () => {
    const scored = scoreLessons(
      Array.from({ length: 6 }, (_, i) => lesson("a", `2026-10-0${i + 1}`, "full")),
    );
    expect(scored.map((s) => s.coins)).toEqual([2, 2, 3, 2, 2, 3]);
  });

  it("partial / not_done homework resets the streak; absence and ungraded days do not", () => {
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
      absent("a", "2026-10-03"),
      lesson("a", "2026-10-04", "full"),
    ]);
    expect(withAbsence.map((s) => s.bonus)).toEqual([0, 0, 0, 1]);

    const ungraded = scoreLessons([
      lesson("a", "2026-10-01", "full"),
      lesson("a", "2026-10-02", "full"),
      lesson("a", "2026-10-03", null, null, "present"),
      lesson("a", "2026-10-04", "full"),
    ]);
    expect(ungraded.map((s) => s.bonus)).toEqual([0, 0, 0, 1]);
  });

  it("scores in date order regardless of input order", () => {
    const scored = scoreLessons([
      lesson("a", "2026-10-03", "full"),
      lesson("a", "2026-10-01", "full"),
      lesson("a", "2026-10-02", "full"),
    ]);
    expect(scored.map((s) => s.lesson.lesson_date)).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
    expect(scored[2].bonus).toBe(1);
  });

  it("editing an old lesson re-scores everything after it", () => {
    const base = [
      lesson("a", "2026-10-01", "full"),
      lesson("a", "2026-10-02", "full"),
      lesson("a", "2026-10-03", "full"),
      lesson("a", "2026-10-04", "full"),
    ];
    const total = (ls: Lesson[]) => scoreLessons(ls).reduce((s, x) => s + x.coins, 0);
    expect(total(base)).toBe(9); // 4*2 + bonus on the 3rd
    const edited = base.map((l, i) => (i === 1 ? { ...l, homework: "partial" as const } : l));
    expect(total(edited)).toBe(2 + 1 + 2 + 2); // streak broken, no bonus
  });

  it("current streak ignores absences and counts only trailing full homework", () => {
    expect(
      currentStreak([
        lesson("a", "2026-10-01", "partial"),
        lesson("a", "2026-10-02", "full"),
        absent("a", "2026-10-03"),
        lesson("a", "2026-10-04", "full"),
      ]),
    ).toBe(2);
    expect(currentStreak([])).toBe(0);
  });
});

describe("legacy migration equivalence", () => {
  /** The pre-2.0 algorithm, copied verbatim, operating on the single status. */
  function oldScore(results: Exclude<LegacyResult, "not_understood">[]): number[] {
    const coins = { full: 2, partial: 1, not_done: 0, absent: 0 } as const;
    let streak = 0;
    return results.map((r) => {
      let bonus = 0;
      if (r === "full") {
        streak += 1;
        if (streak % 3 === 0) bonus = 1;
      } else if (r !== "absent") streak = 0;
      return coins[r] + bonus;
    });
  }

  it("mapped lessons earn exactly the coins the old rules gave, for many random histories", () => {
    const kinds = ["full", "partial", "not_done", "absent"] as const;
    let state = 12345;
    const rnd = () => (state = (state * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let run = 0; run < 200; run++) {
      const history = Array.from({ length: 25 }, () => kinds[Math.floor(rnd() * kinds.length)]);
      const lessons = history.map((r, i) => {
        const m = mapLegacy(r);
        return lesson("a", addDays("2026-09-01", i), m.homework, null, m.attendance);
      });
      expect(scoreLessons(lessons).map((s) => s.coins)).toEqual(oldScore([...history]));
    }
  });

  it("maps statuses as documented", () => {
    expect(mapLegacy("full")).toEqual({ attendance: "present", homework: "full" });
    expect(mapLegacy("not_done")).toEqual({ attendance: "present", homework: "not_done" });
    expect(mapLegacy("absent")).toEqual({ attendance: "absent", homework: null });
  });
});

describe("summarize", () => {
  it("keeps unmarked, absent and not-done separate", () => {
    const s = summarize(
      scoreLessons([
        lesson("a", "2026-10-01", "full"),
        lesson("a", "2026-10-02", "not_done"),
        absent("a", "2026-10-03"),
        lesson("a", "2026-10-04", null, null, "present"),
      ]),
    );
    expect(s).toMatchObject({ lessons: 4, present: 3, absent: 1, full: 1, notDone: 1, graded: 2, coins: 2 });
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

  it("with no lessons everyone has 0 coins and shares rank 1 (empty data, not a bug)", () => {
    const rows = buildStandings(students, [], { from: null, to: null });
    expect(rows.every((r) => r.coins === 0 && r.rank === 1)).toBe(true);
    expect(rows.every((r) => r.marked === 0)).toBe(true);
  });

  it("group average of an empty group is 0, never NaN", () => {
    const groups: Group[] = [{ id: "g9", name: "Empty", archived_at: null, created_at: "" }];
    const rows = buildGroupStandings(groups, buildStandings(students, [], { from: null, to: null }));
    expect(rows[0].average).toBe(0);
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
      lesson("a", "2026-10-02", "not_done", "t1"),
      lesson("a", "2026-10-03", null, "t1", "absent"),
    ];
    expect(repeatCount(topics[0], ls)).toBe(2);
    expect(repeatCount(null, ls)).toBe(0);
  });
});

describe("dates", () => {
  it("formats Uzbek labels and day differences", () => {
    expect(formatDay("2026-10-23")).toBe("Jum, 23 okt");
    expect(diffDays("2026-10-01", "2026-10-31")).toBe(30);
  });

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
