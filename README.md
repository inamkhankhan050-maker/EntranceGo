# EntranceGo

MCQ practice and mock tests for Indian entrance and government exams.
Live at **[entrancego.in](https://entrancego.in)**.

Students preparing for exams like the JMI, AMU, CUET, BHU and DU entrances need questions they can attempt, check and learn from. EntranceGo keeps them in one place, sorted by subject, topic and exam, with explanations, timed mock tests and previous-year papers. I built it as a static React site on GitHub Pages with Supabase as the backend, so it costs nothing to run while it is small.

![Home page](screenshots/home.png)

## Features

- **Practice** by subject, topic, exam or practice set. Practice mode shows the answer and explanation right away; test mode hides them until you submit and has a timer, mark-for-review and a question palette.
- **Mock tests** per course, with sections, negative marking, attempt limits and availability windows. Questions are picked per student (unattempted first), and scoring happens in the database, not the browser.
- **Previous-year papers**, filtered by exam, level, course and year. A paper can have its questions as a practice set and an optional PDF or photo of the original.
- **Student area**: sign-up with email and an Indian mobile number, my mock tests, a progress chart, subject-wise analysis and printable reports.
- **Discussion** under each question for signed-in users.
- **Admin panel** at `/admin`: manage subjects, topics, exams, questions, practice sets, courses, mock tests and PYQ papers. Bulk import from CSV, Excel, Word or PDF with a preview and row-by-row validation before anything is saved.
- Dark mode and a mobile-first layout.

## Tech stack

React 18, Vite, React Router, Supabase (Postgres, Auth, Row Level Security, Storage), GitHub Actions and GitHub Pages. Tests use Vitest, PGlite (Postgres in-process) and Playwright.

## How it fits together

- The frontend is a static build. `scripts/postbuild.mjs` writes an `index.html` for every known route plus a `404.html` fallback, so direct links work on GitHub Pages.
- All data, sign-in and permissions live in Supabase. The browser only gets the public anon key.
- `src/lib/api.js` loads one of two backends: `supabaseBackend.js` when Supabase env vars are set, or `demoBackend.js` (localStorage) when they are not. Demo mode is useful for local work without a database.
- Mock test answers stay on the server until you submit. Scoring runs in a database function.

## Database and RLS

Every table has Row Level Security on.

- Visitors and students can only read **published** content.
- Every write to content tables needs `is_admin()`, which checks the caller against an `admins` table. That table has no insert policy, so admins can only be added from the Supabase SQL editor.
- Attempts and bookmarks can only be read or written by their owner.
- PYQ files sit in a public storage bucket. Only admins can upload, replace or delete.
- The app refuses to start if a `service_role` key is set by mistake.

`npm run test:db` loads the real migrations into PGlite and tries reads and writes as anon, student and admin to check these rules.

## Run locally

```bash
npm install
cp .env.example .env.local   # add your Supabase URL and anon key, or leave blank for demo mode
npm run dev                  # http://localhost:5173
```

To use your own Supabase project, run the SQL files in `supabase/migrations/` in order (001 to 007), then `supabase/seed.sql`, then make yourself admin with `supabase/create_first_admin.sql`. Step-by-step instructions, including the GitHub Pages deploy, are in [docs/SETUP.md](docs/SETUP.md).

Only use the **anon / publishable** key. Never put the service_role key in `.env.local`: anything starting with `VITE_` ends up in the browser.

| Command | What it does |
|---|---|
| `npm run build` | builds `dist/` with per-route HTML, sitemap and robots.txt |
| `npm test` | unit tests (scoring, validation, import) |
| `npm run test:db` | schema and RLS tests on PGlite |
| `npm run test:e2e` | browser tests on the built site |

## Folder structure

```
src/pages/        public pages and the practice engine (Play.jsx)
src/admin/        admin panel
src/lib/          data access, auth, scoring, import helpers
supabase/         migrations, seed data, first-admin script
scripts/          seed generator and post-build route writer
tests/            unit, database and browser tests
docs/SETUP.md     full Supabase and deploy setup
```

## Limits and what's next

Known limits right now:

- In practice and test mode the answers come down with the questions, so scoring there is self-check only. Mock tests don't have this problem.
- Pages are rendered by JavaScript. New subjects added from the admin panel only get pre-rendered HTML after the seed file is updated and the site is rebuilt.
- Question images are URLs. There is no image upload for questions yet (PYQ files do have upload).
- On Supabase's free plan the project pauses after a week of no activity, and there are no automatic backups, so the question bank should be exported as CSV from the admin panel now and then.

Next:

- More PYQ papers for JMI, AMU and CUET
- Image upload for questions
- Better pre-rendering for content added after deploy

## License

Copyright (c) 2026 Md Inam. All rights reserved. The code is public so others can read it; ask before reusing it.
