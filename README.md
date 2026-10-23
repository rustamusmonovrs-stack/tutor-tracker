# Jurnal — tutor tracker

Private lesson journal for a tutor with several groups. Mobile-first, one teacher login.

- **Today:** pick a group, each student shows their next topic, one tap records the result.
- **Results:** `To'liq` (+2, topic advances) · `Chala` (+1) · `Qilmadi` / `Tushunmadi` / `Kelmadi` (0, topic stays).
- **Streak bonus:** every 3rd consecutive `To'liq` earns +1. Absences do not break a streak; any other result does.
- **Leaderboard:** Weekly (resets Monday, Asia/Tashkent) · 30 days · Overall, for everyone, per group, or group-vs-group (average per student).
- **Needs attention:** students whose current topic was repeated (flagged at 3+).
- **Students:** add, rename, move between groups, archive (history kept) or delete permanently (type the name to confirm).

Coins are **never stored**: they are computed from lesson records, so editing an old lesson re-scores everything correctly. Change values in `src/lib/config.ts`.

## Setup

1. **Supabase project** — create one at supabase.com (free tier is enough).
2. **Database** — Supabase → SQL Editor → paste `supabase/schema.sql` → Run.
3. **Your login** — Authentication → Users → *Add user* → email + password (tick *Auto confirm*).
4. **Lock sign-ups** — Authentication → Sign In / Providers → turn off *Allow new users to sign up*.
   (Row Level Security already hides data from other accounts; this is a second lock.)
5. **Env vars** — Project Settings → API. Copy `.env.example` to `.env.local` and fill in the URL and the *publishable* key. Never use the `service_role` / secret key.

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # scoring, streak, week and topic-progress logic
npm run typecheck
npm run build
```

## Deploy (Vercel)

1. Push this repo to GitHub.
2. Vercel → *Add New → Project* → import the repo (framework: Next.js is auto-detected).
3. Add the two environment variables from step 5 → *Deploy*.
4. On your phone open the URL → browser menu → *Add to Home Screen*.

## Notes

- Next.js 16: the auth guard is `src/proxy.ts` (formerly `middleware.ts`).
- One lesson record per student per day. Tapping the active result again removes it (with Undo).
- Off-plan topics (typed on the Today screen) earn coins but do not advance the plan.

## Jurnal 2.0 (branch `crm-2-0`)

- Attendance (`Keldi / Kelmadi`) and homework (`To'liq / Chala / Qilmadi`) are stored separately; empty = not marked.
- Group homework text lives in `lesson_plans` (per group, per day). Coins still derive from homework only.
- **Database migration is prepared but NOT applied:** `supabase/migrations/20261023_attendance_homework.sql`
  (rollback next to it). The new code needs it; deploy only after it has run.
- `npm run dev:demo` runs the app on in-memory demo data (no Supabase, never used in production).
