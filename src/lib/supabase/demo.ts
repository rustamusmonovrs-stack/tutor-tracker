/**
 * In-memory stand-in for the Supabase client, used ONLY when NEXT_PUBLIC_DEMO_MODE=1
 * (local development, screenshots and automated UI checks without touching real data).
 * It is never enabled in production: the variable is not set on Vercel.
 */
import { addDays, todayISO, weekStart } from "../dates";

type Row = Record<string, unknown>;
type Tables = Record<"groups" | "students" | "topics" | "lessons" | "lesson_plans" | "mocks" | "mock_sections" | "mock_student_results" | "mock_section_scores" | "curriculum_programs" | "curriculum_books" | "student_learning_progress" | "student_book_history" | "student_group_transfer_history" | "student_programs" | "saturday_plans" | "certificates", Row[]>;

const STORAGE_KEY = "jurnal-demo-db-v2";
const OBJECTS_KEY = "jurnal-demo-objects-v1";

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
  return { groups, students, topics: [], lessons, lesson_plans: plans, mocks: [], mock_sections: [], mock_student_results: [], mock_section_scores: [], curriculum_programs: [["general", "General English"], ["kids", "Kids English"], ["president", "Prezident maktabiga tayyorgarlik"]].map(([key, name], i) => ({ id: uuid(), key, name, position: i + 1, created_at: created })), curriculum_books: [], student_learning_progress: [], student_book_history: [], student_group_transfer_history: [], student_programs: [], saturday_plans: [], certificates: [] };
}

function load(): Tables {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Tables>;
      const empty = seed();
      // sessions saved before a table existed get it empty (never reseed existing data)
      for (const k of Object.keys(empty) as (keyof Tables)[]) if (!parsed[k]) parsed[k] = [];
      return parsed as Tables;
    }
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
      out = items.map((i) => ({ id: uuid(), archived_at: null, created_at: new Date().toISOString(), ...(this.table === "curriculum_books" ? { active: true, level: null, avg_weeks: null, planned_lessons: null, program_id: t.curriculum_programs.find((p) => p.key === "general")?.id } : {}), ...(this.table === "certificates" ? { status: "draft", private_path: null, redacted_path: null, public_path: null, consent_at: null, consent_note: null, sort_order: 0, published_at: null } : {}), ...(this.table === "saturday_plans" ? { program_id: null, group_id: null, student_id: null, on_date: null, note: null } : {}), ...i }));
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
        t.student_learning_progress = t.student_learning_progress.filter((x) => !ids.has(x.student_id));
        t.student_book_history = t.student_book_history.filter((x) => !ids.has(x.student_id));
        t.student_group_transfer_history = t.student_group_transfer_history.filter((x) => !ids.has(x.student_id));
        t.student_programs = t.student_programs.filter((x) => !ids.has(x.student_id));
        t.saturday_plans = t.saturday_plans.filter((x) => !ids.has(x.student_id));
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

type Result = { data: unknown; error: { message: string } | null };
const bad = (message: string): Result => ({ data: null, error: { message } });
const iso = () => new Date().toISOString();

/** Mirrors the SQL functions in supabase/migrations/20261026_stages.sql (same guards, same outcomes). */
function rpc(name: string, a: Record<string, unknown>): Result {
  const t = tables();
  const win = window as unknown as { __demoFail?: boolean };
  if (win.__demoFail) return bad("Demo: tarmoq xatosi");
  const upsertProgress = (sid: string, level: unknown) => {
    const hit = t.student_learning_progress.find((p) => p.student_id === sid);
    if (hit) Object.assign(hit, { level });
    else t.student_learning_progress.push({ id: uuid(), student_id: sid, level, lessons_per_week: null, teacher_note: null, next_goal: null });
  };
  if (name === "set_students_stage") {
    const { p_students, p_book, p_level, p_started_on, p_dates, p_track } = a as { p_students: string[]; p_book: string; p_level: string; p_started_on: string; p_dates: Record<string, string>; p_track?: string };
    const track = p_track ?? "primary";
    if (!p_book || !p_level || !p_started_on) return bad("book, level and start date are required");
    if (!["primary", "additional"].includes(track)) return bad("invalid track");
    const book = t.curriculum_books.find((b) => b.id === p_book);
    if (!book) return bad("book not found");
    if (book.archived_at) return bad("book is archived");
    const prog = book.program_id as string;
    for (const sid of p_students) {
      const st = t.students.find((s) => s.id === sid);
      if (!st) return bad(`student ${sid} not found`);
      const d = p_dates?.[sid] ?? p_started_on;
      let sp = t.student_programs.find((x) => x.student_id === sid && x.program_id === prog);
      if (!sp) {
        const own = t.student_programs.filter((x) => x.student_id === sid);
        if (track === "primary") {
          if (own.some((x) => x.track === "primary")) return bad(`student ${sid} already has another primary program`);
        } else {
          if (!own.some((x) => x.track === "primary")) return bad("additional track needs a primary program first");
          if (own.some((x) => x.track === "additional")) return bad(`student ${sid} already has an additional track`);
        }
        sp = { id: uuid(), student_id: sid, program_id: prog, track };
        t.student_programs.push(sp);
      } else if (sp.track !== track) return bad(`student is already in this program as ${sp.track}`);
      const mine = t.student_book_history.filter((h) => h.student_id === sid && h.program_id === prog);
      const active = mine.find((h) => h.finished_on == null);
      if (!active) {
        if (mine.length) return bad(`student ${sid} already has a finished program; cannot place again`);
        t.student_book_history.push({ id: uuid(), student_id: sid, book_id: p_book, program_id: prog, group_id: st.group_id, level: p_level, started_on: d, finished_on: null, outcome: null, created_at: iso() });
      } else Object.assign(active, { book_id: p_book, level: p_level, started_on: d });
      if (sp.track === "primary") upsertProgress(sid, p_level);
    }
    persist();
    return { data: p_students.length, error: null };
  }
  if (name === "remove_student_program") {
    const { p_student, p_program } = a as { p_student: string; p_program: string };
    const sp = t.student_programs.find((x) => x.student_id === p_student && x.program_id === p_program);
    if (!sp) return bad("student is not in this program");
    if (t.student_book_history.some((h) => h.student_id === p_student && h.program_id === p_program && h.finished_on == null)) return bad("finish the active book first");
    if (sp.track === "primary" && t.student_programs.some((x) => x.student_id === p_student && x.track === "additional")) return bad("remove the additional track first");
    t.student_programs = t.student_programs.filter((x) => x !== sp);
    persist();
    return { data: null, error: null };
  }
  if (name === "public_certificates") {
    const rows = t.certificates.filter((c) => c.status === "published" && c.consent_at && c.public_path).map((c) => ({ id: c.id, kind: c.kind, public_path: c.public_path }));
    return { data: rows, error: null };
  }
  if (name === "finish_student_book") {
    const { p_history, p_finished_on, p_outcome, p_next_book, p_next_level, p_next_started_on } = a as Record<string, string | null>;
    const h = t.student_book_history.find((x) => x.id === p_history);
    if (!h) return bad("history record not found");
    if (h.finished_on != null) return bad("book already finished");
    if (!["next", "repeat", "program_done"].includes(p_outcome ?? "")) return bad("invalid outcome");
    if (!p_finished_on || p_finished_on < (h.started_on as string)) return bad("finish date is before start date");
    if (p_finished_on > addDays(todayISO(), 1)) return bad("finish date is in the future");
    const nb = p_outcome === "repeat" ? (h.book_id as string) : p_next_book;
    if (p_outcome !== "program_done") {
      const nbRow = t.curriculum_books.find((b) => b.id === nb);
      if (!nb || !nbRow) return bad("next book is required");
      if (nbRow.program_id !== h.program_id) return bad("next book must belong to the same program");
      if (nbRow.archived_at) return bad("next book is archived");
      if (!p_next_started_on || p_next_started_on < p_finished_on) return bad("next book start date is invalid");
    }
    Object.assign(h, { finished_on: p_finished_on, outcome: p_outcome });
    if (p_outcome === "program_done") {
      persist();
      return { data: null, error: null };
    }
    const st = t.students.find((s) => s.id === h.student_id);
    const row = { id: uuid(), student_id: h.student_id, book_id: nb, program_id: h.program_id, group_id: st?.group_id ?? null, level: p_next_level ?? h.level, started_on: p_next_started_on, finished_on: null, outcome: null, created_at: iso() };
    t.student_book_history.push(row);
    if (p_next_level && t.student_programs.find((x) => x.student_id === h.student_id && x.program_id === h.program_id)?.track === "primary") upsertProgress(h.student_id as string, p_next_level);
    persist();
    return { data: row.id, error: null };
  }
  if (name === "transfer_student") {
    const { p_student, p_group, p_note } = a as { p_student: string; p_group: string; p_note: string | null };
    const st = t.students.find((s) => s.id === p_student);
    if (!st) return bad("student not found");
    if (st.group_id === p_group) return bad("student is already in this group");
    if (!t.groups.some((g) => g.id === p_group && g.archived_at == null)) return bad("target group not found or archived");
    t.student_group_transfer_history.push({ id: uuid(), student_id: p_student, from_group_id: st.group_id, to_group_id: p_group, transferred_at: iso(), note: p_note?.trim() || null });
    st.group_id = p_group;
    persist();
    return { data: null, error: null };
  }
  return bad(`unknown function ${name}`);
}

// ---- Storage stub: objects live in memory (+ sessionStorage) as data URLs
let objects: Record<string, string> | null = null;
function objs(): Record<string, string> {
  if (!objects) {
    try {
      objects = JSON.parse(window.sessionStorage.getItem(OBJECTS_KEY) ?? "{}") as Record<string, string>;
    } catch {
      objects = {};
    }
  }
  return objects;
}
function saveObjs() {
  try {
    window.sessionStorage.setItem(OBJECTS_KEY, JSON.stringify(objects));
  } catch {
    /* quota: images stay in memory for this page only */
  }
}
function toDataUrl(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });
}
function storageBucket(bucket: string) {
  const key = (path: string) => `${bucket}/${path}`;
  return {
    upload: async (path: string, body: Blob) => {
      objs()[key(path)] = await toDataUrl(body);
      saveObjs();
      return { data: { path }, error: null as { message: string } | null };
    },
    remove: async (paths: string[]) => {
      for (const p of paths) delete objs()[key(p)];
      saveObjs();
      return { data: [], error: null as { message: string } | null };
    },
    createSignedUrl: async (path: string) => {
      const url = objs()[key(path)];
      return url ? { data: { signedUrl: url }, error: null } : { data: null, error: { message: "Object not found" } };
    },
    getPublicUrl: (path: string) => ({ data: { publicUrl: objs()[key(path)] ?? "" } }),
  };
}

export const demoClient = {
  storage: { from: storageBucket },
  from: (table: string) => new Query(table as keyof Tables),
  rpc: (name: string, args: Record<string, unknown>) => new Promise<Result>((resolve) => setTimeout(() => resolve(rpc(name, args)), 60)),
  auth: {
    getUser: async () => ({ data: { user: { id: "demo-owner" } }, error: null }),
    signOut: async () => ({ error: null }),
    signInWithPassword: async () => ({ data: {}, error: null }),
  },
};
