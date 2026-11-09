import { describe, expect, it } from "vitest";
import { MEDAL, initialsOf, podiumOrder, podiumTiers } from "./leaderboard";
import { buildStandings } from "./scoring";
import type { Lesson, Student } from "./types";

const D = "2026-11-09";
const student = (id: string, name: string, group_id = "g"): Student => ({ id, group_id, name, archived_at: null, created_at: "2026-09-01T05:00:00Z" }) as Student;
/** Coins come from the existing rules only: Smart Homework coin events (1 per To'liq task). */
const coins = (id: string, n: number) => Array.from({ length: n }, () => ({ student_id: id, date: D, coins: 1 }));

function rank(rows: [string, number][], group = "g") {
  const students = rows.map(([name], i) => student(`s${i}`, name, group));
  const events = rows.flatMap(([, n], i) => coins(`s${i}`, n));
  return buildStandings(students, [] as Lesson[], { from: null, to: null }, events);
}

describe("Reyting podium: real ranks only (competition ranking from buildStandings)", () => {
  it("13, 12, 12, 11: both 12s are 2nd, nobody is shown as 3rd, 11 is 4th", () => {
    const s = rank([["Haydarov Abdurahmon", 13], ["Choriyev Nasim", 12], ["Ravshanova Jasmina", 12], ["Faxriddinov Amir", 11]]);
    expect(s.map((x) => [x.student.name, x.coins, x.rank])).toEqual([
      ["Haydarov Abdurahmon", 13, 1], ["Choriyev Nasim", 12, 2], ["Ravshanova Jasmina", 12, 2], ["Faxriddinov Amir", 11, 4],
    ]);
    const tiers = podiumTiers(s);
    expect(tiers.map((t) => [t.rank, t.coins, t.members.map((m) => m.student.name)])).toEqual([
      [1, 13, ["Haydarov Abdurahmon"]],
      [2, 12, ["Choriyev Nasim", "Ravshanova Jasmina"]],
    ]);
    expect(tiers.some((t) => t.rank === 3)).toBe(false);
  });

  it("three distinct ranks: shown 2 · 1 · 3 with gold, silver, bronze on the real ranks", () => {
    const tiers = podiumTiers(rank([["A A", 9], ["B B", 7], ["C C", 5], ["D D", 1]]));
    expect(podiumOrder(tiers).map((t) => t.rank)).toEqual([2, 1, 3]);
    expect(tiers.map((t) => MEDAL[t.rank])).toEqual(["gold", "silver", "bronze"]);
  });

  it("many tied for first: one first-place tier, no 2nd/3rd invented", () => {
    const tiers = podiumTiers(rank([["A A", 4], ["B B", 4], ["C C", 4], ["D D", 4], ["E E", 4], ["F F", 2]]));
    expect(tiers.map((t) => [t.rank, t.members.length])).toEqual([[1, 5]]);
  });

  it("1st tied by two -> next rank is 3 (bronze), never 2", () => {
    const tiers = podiumTiers(rank([["A A", 6], ["B B", 6], ["C C", 3], ["D D", 3], ["E E", 1]]));
    expect(tiers.map((t) => [t.rank, t.members.length])).toEqual([[1, 2], [3, 2]]);
    expect(podiumOrder(tiers).map((t) => t.rank)).toEqual([1, 3]);
  });

  it("zero coins are never on the podium; one student or nobody with coins", () => {
    expect(podiumTiers(rank([["A A", 0], ["B B", 0]]))).toEqual([]);
    expect(podiumTiers(rank([["A A", 2]])).map((t) => t.rank)).toEqual([1]);
    expect(podiumTiers([])).toEqual([]);
  });

  it("podium and table use the same rows: every podium member has the same rank and coins in the full list", () => {
    const s = rank([["A A", 5], ["B B", 5], ["C C", 4], ["D D", 2], ["E E", 2], ["F F", 0]]);
    for (const t of podiumTiers(s)) for (const m of t.members) expect(s.find((x) => x.student.id === m.student.id)).toMatchObject({ rank: t.rank, coins: t.coins });
  });

  it("group filter: ranks are recomputed inside the selected group only", () => {
    const students = [student("a", "A A", "g1"), student("b", "B B", "g2"), student("c", "C C", "g1")];
    const events = [...coins("a", 3), ...coins("b", 9), ...coins("c", 1)];
    const g1 = buildStandings(students.filter((x) => x.group_id === "g1"), [], { from: null, to: null }, events);
    expect(g1.map((x) => [x.student.id, x.rank])).toEqual([["a", 1], ["c", 2]]);
    expect(podiumTiers(g1).map((t) => t.members[0].student.id)).toEqual(["a", "c"]);
  });

  it("time filter: coins outside the period do not count", () => {
    const students = [student("a", "A A"), student("b", "B B")];
    const events = [{ student_id: "a", date: "2026-10-01", coins: 5 }, { student_id: "b", date: D, coins: 1 }];
    const week = buildStandings(students, [], { from: "2026-11-09", to: "2026-11-15" }, events);
    expect(week.map((x) => [x.student.id, x.coins, x.rank])).toEqual([["b", 1, 1], ["a", 0, 2]]);
  });

  it("initials", () => {
    expect(initialsOf("Haydarov Abdurahmon")).toBe("HA");
    expect(initialsOf("Zokir")).toBe("Z");
    expect(initialsOf(" ")).toBe("?");
  });
});
