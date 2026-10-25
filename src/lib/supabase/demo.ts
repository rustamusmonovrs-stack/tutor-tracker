/**
 * In-memory stand-in for the Supabase client, used ONLY when NEXT_PUBLIC_DEMO_MODE=1
 * (local development, screenshots and automated UI checks without touching real data).
 * It is never enabled in production: the variable is not set on Vercel.
 */
import { addDays, todayISO, weekStart } from "../dates";

type Row = Record<string, unknown>;
type Tables = Record<"groups" | "students" | "topics" | "lessons" | "lesson_plans" | "mocks" | "mock_sections" | "mock_student_results" | "mock_section_scores", Row[]>;

const STORAGE_KEY = "jurnal-demo-db-v2";

function uuid(): string {
  return crypto.randomUUID();
}

function seed(): Tables {
  const today = todayISO();
  const created = new Date().toISOString();
  const groups = ["Boshlang'ich", "O'rta daraja", "Yuqori"].map((name) => ({
    id: uuid(),
    name,
    archived_at: null,
    created_at: created,
  }));
  const first = ["Aziz", "Madina", "Jasur", "Dilnoza", "Bekzod", "Zarina", "Sardor", "Malika", "Otabek", "Nigora", "Rustam", "Sevara"];
  const last = ["Karimov", "Yusupova", "Tursunov", "Rahimova", "Ismoilov", "Aliyeva", "Qodirov", "Nazarova"];
  const sizes = [11, 9, 6];
  const students: Row[] = [];
  let n = 0;
  groups.forEach((g, gi) => {
    for (let i = 0; i < sizes[gi]; i++) {
      students.push({
        id: uuid(),
        group_id: g.id,
        name: `${last[(n * 3) % last.length]} ${first[n % first.length]}`,
        archived_at: null,
        created_at: created,
      });
      n += 1;
    }
  });

  // Deterministic pseudo-random history for the last 6 weeks (past days only).
  let state = 20261023;
  const rnd = () => (state = (state * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const lessons: Row[] = [];
  const plans: Row[] = [];
  const schedule = [[0, 2, 4], [1, 3], [0, 3]];
  const topicTexts = ["Present Simple — Positive and Negative Forms", "Past Simple: regular verbs", "Family vocabulary", "Reading: A day at school", "Modal verbs: can / must"];
  const homeworkTexts = ["12-mashq, 45-bet", "Insho: Mening oilam", "Lug'at: 20 ta so'z", "Test 3 ni yeching", "Grammatika: 5-bo'lim"];
  const start = addDays(weekStart(today), -35);
  for (let d = start; d < today; d = addDays(d, 1)) {
    const dow = (new Date(d + "T00:00:00Z").getUTCDay() + 6) % 7;
    groups.forEach((g, gi) => {
      if (!schedule[gi].includes(dow)) return;
      plans.push({
        id: uuid(),
        group_id: g.id,
        lesson_date: d,
        topic: topicTexts[Math.floor(rnd() * topicTexts.length)],
        homework: homeworkTexts[Math.floor(rnd() * homeworkTexts.length)],
        updated_at: created,
      });
      students
        .filter((s) => s.group_id === g.id)
        .forEach((s) => {
          const came = rnd() > 0.12;
          const r = rnd();
          lessons.push({
            id: uuid(),
            student_id: s.id,
            topic_id: null,
            topic_title: "Dars",
            lesson_date: d,
            attendance: came ? "present" : "absent",
            homework: came ? (r < 0.55 ? "full" : r < 0.8 ? "partial" : "not_done") : null,
            created_at: `${d}T08:00:00Z`,
          });
        });
    });
  }
  return { groups, students, topics: [], lessons, lesson_plans: plans, mocks: [], mock_sections: [], mock_student_results: [], mock_section_scores: [] };
}

function load(): Tables {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Tables;
  } catch {
    /* ignore */
  }
  return seed();
}

let db: Tables | null = null;
function tables(): Tables {
  if (!db) db = load();
  return db;
}
function persist() {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    /* ignore */
  }
}

type Op = "select" | "insert" | "update" | "delete" | "upsert";

class Query implements PromiseLike<{ data: unknown; error: { message: string } | null }> {
  private op: Op = "select";
  private payload: Row | Row[] | null = null;
  private opts: { onConflict?: string; ignoreDuplicates?: boolean } = {};
  private filters: [string, unknown][] = [];
  private from = 0;
  private to = Infinity;
  private returning = true;
  private one = false;

  constructor(private table: keyof Tables) {}

  select() {
    this.returning = true;
    return this;
  }
  insert(p: Row | Row[]) {
    this.op = "insert";
    this.payload = p;
    this.returning = false;
    return this;
  }
  update(p: Row) {
    this.op = "update";
    this.payload = p;
    this.returning = false;
    return this;
  }
  delete() {
    this.op = "delete";
    this.returning = false;
    return this;
  }
  upsert(p: Row | Row[], opts: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.op = "upsert";
    this.payload = p;
    this.opts = opts;
    this.returning = false;
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push([col, val]);
    return this;
  }
  order() {
    return this;
  }
  range(a: number, b: number) {
    this.from = a;
    this.to = b;
    return this;
  }
  single() {
    this.one = true;
    return this;
  }
  maybeSingle() {
    this.one = true;
    return this;
  }

  then<R1, R2>(
    onfulfilled?: ((v: { data: unknown; error: { message: string } | null }) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((r: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return new Promise<{ data: unknown; error: { message: string } | null }>((resolve) =>
      setTimeout(() => resolve(this.run()), 60),
    ).then(onfulfilled, onrejected);
  }

  private matches(row: Row): boolean {
    return this.filters.every(([c, v]) => row[c] === v);
  }

  private run(): { data: unknown; error: { message: string } | null } {
    const t = tables();
    const rows = t[this.table];
    const win = window as unknown as { __demoFail?: boolean };
    if (this.op !== "select" && win.__demoFail) {
      return { data: null, error: { message: "Demo: tarmoq xatosi" } };
    }
    const noContent = (r: Row) => r.topic == null && r.homework == null;
    if (this.table === "lesson_plans") {
      const bad = { data: null, error: { message: 'new row for relation "lesson_plans" violates check constraint "lesson_plans_has_content"' } };
      if (this.op === "insert" || this.op === "upsert") {
        const items = Array.isArray(this.payload) ? this.payload : [this.payload as Row];
        if (items.some(noContent)) return bad; // Postgres checks the proposed row before ON CONFLICT
      }
      if (this.op === "update" && noContent({ ...(rows.find((r) => this.matches(r)) ?? {}), ...(this.payload as Row) })) return bad;
    }
    let out: Row[] = [];
    if (this.op === "select") {
      out = rows.filter((r) => this.matches(r)).slice(this.from, this.to === Infinity ? undefined : this.to + 1);
    } else if (this.op === "insert") {
      const items = Array.isArray(this.payload) ? this.payload : [this.payload as Row];
      out = items.map((i) => ({ id: uuid(), archived_at: null, created_at: new Date().toISOString(), ...i }));
      rows.push(...out);
    } else if (this.op === "update") {
      out = rows.filter((r) => this.matches(r));
      out.forEach((r) => Object.assign(r, this.payload));
    } else if (this.op === "delete") {
      const gone = rows.filter((r) => this.matches(r));
      t[this.table] = rows.filter((r) => !gone.includes(r));
      const ids = new Set(gone.map((g) => g.id));
      if (this.table === "mocks") {
        const secs = new Set(t.mock_sections.filter((x) => ids.has(x.mock_id)).map((x) => x.id));
        const res = new Set(t.mock_student_results.filter((x) => ids.has(x.mock_id)).map((x) => x.id));
        t.mock_sections = t.mock_sections.filter((x) => !ids.has(x.mock_id));
        t.mock_student_results = t.mock_student_results.filter((x) => !ids.has(x.mock_id));
        t.mock_section_scores = t.mock_section_scores.filter((x) => !secs.has(x.section_id) && !res.has(x.result_id));
      }
      if (this.table === "students") {
        t.topics = t.topics.filter((x) => !ids.has(x.student_id));
        t.lessons = t.lessons.filter((x) => !ids.has(x.student_id));
      }
    } else if (this.op === "upsert") {
      const items = Array.isArray(this.payload) ? this.payload : [this.payload as Row];
      const keys = (this.opts.onConflict ?? "id").split(",");
      for (const item of items) {
        const hit = rows.find((r) => keys.every((k) => r[k] === item[k]));
        if (hit) {
          if (!this.opts.ignoreDuplicates) {
            Object.assign(hit, item);
            out.push(hit);
          }
        } else {
          const row = { id: uuid(), archived_at: null, created_at: new Date().toISOString(), ...item };
          rows.push(row);
          out.push(row);
        }
      }
    }
    if (this.op !== "select") persist();
    if (!this.returning) return { data: null, error: null };
    return { data: this.one ? (out[0] ?? null) : out.map((r) => ({ ...r })), error: null };
  }
}

export const demoClient = {
  from: (table: string) => new Query(table as keyof Tables),
  auth: {
    signOut: async () => ({ error: null }),
    signInWithPassword: async () => ({ data: {}, error: null }),
  },
};
