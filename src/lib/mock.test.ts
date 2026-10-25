import { describe, expect, it } from "vitest";
import {
  buildRanking,
  buildStats,
  checkScore,
  defaultMockName,
  finishProblems,
  formatPct,
  totalsFor,
  validateSections,
  type MockAttendance,
  type MockSection,
  type Row,
} from "./mock";

const sec = (id: string, total: number): MockSection => ({ id, mock_id: "m", position: 1, name: id, total_questions: total });

function row(
  name: string,
  sections: MockSection[],
  scores: Record<string, number>,
  attendance: MockAttendance | null = "present",
): Row {
  const map = new Map(Object.entries(scores));
  return {
    result: { id: name, mock_id: "m", student_id: name, attendance, payment: null },
    name,
    scores: map,
    totals: totalsFor(sections, map),
  };
}

describe("overall percentage", () => {
  it("single section 60 questions", () => {
    expect(totalsFor([sec("a", 60)], new Map([["a", 45]])).pct).toBe(75);
  });
  it("two sections 40+40", () => {
    const t = totalsFor([sec("r", 40), sec("l", 40)], new Map([["r", 34], ["l", 36]]));
    expect(t.correct).toBe(70);
    expect(t.total).toBe(80);
    expect(t.pct).toBe(87.5);
  });
  it("is weighted, not an average of percentages (15/20 + 30/40 = 75, not 75 by luck)", () => {
    const t = totalsFor([sec("r", 20), sec("g", 40)], new Map([["r", 15], ["g", 30]]));
    expect(t.pct).toBe(75);
    // 20/20 + 0/40 -> weighted 33.33, a plain average would say 50
    expect(totalsFor([sec("r", 20), sec("g", 40)], new Map([["r", 20], ["g", 0]])).pct).toBe(33.33);
  });
  it("three sections with different sizes", () => {
    const t = totalsFor([sec("r", 30), sec("g", 20), sec("v", 10)], new Map([["r", 24], ["g", 15], ["v", 9]]));
    expect(t.pct).toBe(80);
  });
  it("0 is a real score; missing is not 0", () => {
    const zero = totalsFor([sec("a", 10)], new Map([["a", 0]]));
    expect(zero.complete).toBe(true);
    expect(zero.pct).toBe(0);
    const empty = totalsFor([sec("a", 10), sec("b", 10)], new Map([["a", 5]]));
    expect(empty.complete).toBe(false);
    expect(empty.pct).toBeNull();
  });
  it("max score is 100%", () => {
    expect(totalsFor([sec("a", 40)], new Map([["a", 40]])).pct).toBe(100);
  });
  it("formats up to 2 decimals", () => {
    expect(formatPct(87.5)).toBe("87.5%");
    expect(formatPct(75)).toBe("75%");
    expect(formatPct(33.333)).toBe("33.33%");
  });
});

describe("score validation", () => {
  it("accepts 0 and max, rejects over max / negative / decimal / text", () => {
    expect(checkScore("0", 40)).toEqual({ kind: "ok", value: 0 });
    expect(checkScore("40", 40)).toEqual({ kind: "ok", value: 40 });
    expect(checkScore("41", 40).kind).toBe("error");
    expect(checkScore("-1", 40).kind).toBe("error");
    expect(checkScore("3.5", 40).kind).toBe("error");
    expect(checkScore("abc", 40).kind).toBe("error");
  });
  it("empty stays empty", () => {
    expect(checkScore("  ", 40)).toEqual({ kind: "empty" });
  });
});

describe("section validation", () => {
  it("rejects duplicates, empty names and non-positive counts", () => {
    expect(validateSections([{ name: "Reading", total: "40" }, { name: " reading ", total: "10" }])).toMatch(/takrorlangan/);
    expect(validateSections([{ name: "", total: "40" }])).not.toBeNull();
    expect(validateSections([{ name: "A", total: "0" }])).not.toBeNull();
    expect(validateSections([{ name: "A", total: "2.5" }])).not.toBeNull();
    expect(validateSections([])).not.toBeNull();
  });
  it("accepts a valid list", () => {
    expect(validateSections([{ name: "Reading", total: "30" }, { name: "Grammar", total: "20" }])).toBeNull();
  });
});

describe("ranking", () => {
  const S = [sec("a", 100)];
  it("sorts high to low, ties share a rank, absent have none", () => {
    const rows = [
      row("Jasur", S, { a: 70 }),
      row("Dilyor", S, { a: 92 }),
      row("Elshod", S, { a: 87 }),
      row("Doston", S, { a: 87 }),
      row("Kelmagan", S, {}, "absent"),
      row("Belgilanmagan", S, {}, null),
    ];
    const r = buildRanking(rows);
    expect(r.ranked.map((x) => [x.name, x.rank])).toEqual([
      ["Dilyor", 1],
      ["Doston", 2],
      ["Elshod", 2],
      ["Jasur", 4],
    ]);
    expect(r.absent.map((x) => x.name)).toEqual(["Kelmagan"]);
    expect(r.unmarked.map((x) => x.name)).toEqual(["Belgilanmagan"]);
  });
  it("equal weighted percentages tie even with different splits", () => {
    const sections = [sec("r", 20), sec("g", 40)];
    const r = buildRanking([row("A", sections, { r: 15, g: 30 }), row("B", sections, { r: 20, g: 25 })]);
    expect(r.ranked.map((x) => x.rank)).toEqual([1, 1]);
  });
  it("partially scored students are not ranked", () => {
    const sections = [sec("r", 20), sec("g", 40)];
    const r = buildRanking([row("A", sections, { r: 15 })]);
    expect(r.ranked).toHaveLength(0);
    expect(r.incomplete).toHaveLength(1);
  });
});

describe("stats", () => {
  const S = [sec("r", 20), sec("g", 40)];
  it("average uses only present students with every section scored", () => {
    const rows = [
      row("A", S, { r: 20, g: 40 }), // 100
      row("B", S, { r: 0, g: 0 }), // 0 (real zero counts)
      row("C", S, { r: 10 }), // incomplete, excluded
      row("D", S, {}, "absent"), // excluded, not 0%
    ];
    const s = buildStats(rows);
    expect(s.avgPct).toBe(50);
    expect(s.topPct).toBe(100);
    expect(s.present).toBe(3);
    expect(s.absent).toBe(1);
  });
  it("counts payment 'not marked' separately", () => {
    const rows = [row("A", S, {}), row("B", S, {})];
    rows[0].result.payment = "paid";
    const s = buildStats(rows);
    expect(s.paid).toBe(1);
    expect(s.unpaid).toBe(0);
    expect(s.paymentUnmarked).toBe(1);
  });
  it("no qualifying students gives null, not 0", () => {
    expect(buildStats([row("A", S, {}, "absent")]).avgPct).toBeNull();
  });
});

describe("finishing", () => {
  const S = [sec("a", 10)];
  it("flags unmarked attendance and incomplete present students", () => {
    const p = finishProblems([row("A", S, {}, null), row("B", S, {}), row("C", S, { a: 5 }), row("D", S, {}, "absent")]);
    expect(p).toEqual({ unmarked: 1, incomplete: 1 });
  });
  it("auto name", () => {
    expect(defaultMockName(0)).toBe("Mock 1");
    expect(defaultMockName(4)).toBe("Mock 5");
  });
});

describe("buildRows normalisation", () => {
  it("treats missing attendance/payment as not marked (null)", async () => {
    const { buildRows } = await import("./mock");
    const rows = buildRows(
      [sec("a", 10)],
      [{ id: "r", mock_id: "m", student_id: "s" } as never],
      [],
      () => "X",
    );
    expect(rows[0].result.attendance).toBeNull();
    expect(finishProblems(rows).unmarked).toBe(1);
  });
});
