# EntranceGo — Learn Smarter. Practice Better.

**Live site:** https://entrancego.in

EntranceGo is an original MCQ practice and mock-test platform for Indian entrance and government exams. It is a static React (Vite) site hosted on **GitHub Pages**, with **Supabase** (PostgreSQL, Auth and Row Level Security) as the database and security layer.

## Features

* **Practice:** categories, subjects, topics, exams, search and practice sets. Practice mode gives instant feedback with explanations; Test mode hides answers until submission and supports a timer, review marks and a question palette.
* **Mock tests:** course-specific question banks, sectioned mocks with marking and negative marking, difficulty mix, availability windows and attempt limits. Questions are selected per student, unattempted first, with no duplicates. Scoring runs on the server.
* **Student area:** email sign-up with a mandatory Indian mobile number, My Mock Tests, My Performance (progress chart and subject analysis) and printable PDF reports.
* **Discussion:** per-question comments for signed-in users.
* **Admin panel** (`/admin`): subjects, topics, exams, questions (create, edit, duplicate, publish, delete), CSV / Word / PDF bulk import with validation, practice sets, courses, mock tests, attempt statistics, students and anonymous visitor statistics.
* **Mobile-first UI** with a slide-in menu and dark mode.

> GitHub Pages only serves static files. It does **not** host the database or run any admin
> logic. All data, sign-in and permissions live in Supabase.

---

## 1. How security works

| Layer | What it does |
|---|---|
| `public.admins` table | Lists administrator user IDs. It has **no insert/update/delete policy**, so no browser user (not even a signed-in one) can add a row. Only the SQL Editor (database owner) can. |
| `public.is_admin()` | `security definer` function that checks the caller's `auth.uid()` against `admins`. |
| RLS on every table | Public (anon + students) can only `select` **published** subjects/topics/exams/sets and **published** questions whose subject *and* topic are published. Every write requires `is_admin()`. |
| Student data | `attempts` and `bookmarks` are readable/writable only by their owner (`user_id = auth.uid()`). Results can't be edited after saving. |
| Database constraints | Unique slugs, 4 distinct non-empty options, `correct_option in (A,B,C,D)`, topic must belong to the question's subject, duplicate question text per subject blocked, subjects/topics with content can't be deleted. Timestamps and `created_by` / `updated_by` are set by triggers. |
| Frontend | Uses only the public **anon** key. The admin screen check is a convenience; the database rejects any non-admin write regardless. The app refuses to run if a `service_role` key is configured by mistake. |

---

## 2. Set up Supabase (free tier, about 10 minutes)

1. Create an account at https://supabase.com → **New project**. Choose a region near your users (e.g. Mumbai), set a database password, wait for it to start.
2. **Create the schema:** Dashboard → **SQL Editor** → **New query** → paste all of `supabase/migrations/001_schema.sql` → **Run**. Then do the same with `supabase/migrations/002_comments.sql` (question discussion: only logged-in users can read/post).
3. **Load the catalog + sample questions:** new query → paste `supabase/seed.sql` → **Run**. (Safe to re-run.)
4. **Auth settings:** Dashboard → **Authentication** → **URL Configuration**
   * **Site URL:** `https://USERNAME.github.io/REPO-NAME/`
   * **Redirect URLs:** add `https://USERNAME.github.io/REPO-NAME/**` (and `http://localhost:5173/**` for local development)
   * Authentication → **Sign In / Providers** → Email: keep enabled. "Confirm email" on is recommended.
5. **Create the first administrator**
   1. Authentication → **Users** → **Add user** → **Create new user** → enter your email + a strong password → tick *Auto Confirm User*.
      (Or sign up on the site's `/login` page and confirm the email.)
   2. SQL Editor → open `supabase/create_first_admin.sql`, replace `YOUR_ADMIN_EMAIL@example.com` with that email, **Run**. The final `select` should show one row.
   3. Sign in at `/login`, then open `/admin`.
   To add more admins later, repeat step 5.2 with their email. To remove one, use the `delete` line in the same file.
6. **Get the public keys:** Project Settings → **API** (or **API Keys**)
   * **Project URL** → `VITE_SUPABASE_URL`
   * **anon / public** key (or the new **publishable** key) → `VITE_SUPABASE_ANON_KEY`
   * ⚠️ Never use the `service_role` / **secret** key anywhere in this project.

**Free plan (supabase.com/pricing, checked Oct 2026):** $0/month, 500 MB database, 50,000 monthly active users, 5 GB egress, 1 GB file storage, no automatic backups, max 2 active projects, and free projects are **paused after 1 week of inactivity** (restore from the dashboard). Export your questions with the admin "Export CSV" button regularly as a backup. The built-in email sender is heavily rate-limited — fine for testing; add custom SMTP (Authentication → SMTP, free on all plans) before real sign-ups. Nothing is charged unless you upgrade to a paid plan.

---

## 3. Deploy on GitHub Pages (free)

1. Create a GitHub repository (e.g. `entrancego`) and push this folder to the `main` branch.
2. Repository → **Settings → Pages** → *Build and deployment* → **Source: GitHub Actions**.
3. Repository → **Settings → Secrets and variables → Actions → Variables** tab → **New repository variable**:

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | your Project URL |
   | `VITE_SUPABASE_ANON_KEY` | your anon/publishable key |
   | `VITE_BASE_PATH` | `/EntranceGo/` (your repo name between slashes; `/` if you use a custom domain) — optional, defaults to `/<repo>/` |
   | `VITE_SITE_URL` | `https://USERNAME.github.io/entrancego` — optional, used for canonical URLs + sitemap |

   These are *public* values (they ship to every browser), so Variables are appropriate; using Secrets also works.
4. Push to `main` (or Actions → *Test and deploy* → **Run workflow**). The workflow runs the unit + database security tests, builds, and publishes. The site appears at `https://USERNAME.github.io/EntranceGo/`.

**Routing on GitHub Pages:** every known page (all subjects, topics, exams, sets, static pages, admin screens) is written as its own `index.html` with its own title/description/canonical, so direct visits and refreshes return 200. Any other URL (e.g. a subject you add later in the admin panel) is served by `404.html`, which loads the same app and renders the right page.

Without the two Supabase variables the site builds in **demo mode**: everything works, but data is stored only in the visitor's browser and the admin panel is open (clearly labelled). Don't launch publicly in demo mode.

---

## 4. Run locally

```bash
npm install
cp .env.example .env.local      # fill in your Supabase URL + anon key (or leave blank for demo mode)
npm run dev                     # http://localhost:5173
```

| Command | What it does |
|---|---|
| `npm run build` | regenerates seed files, builds `dist/`, writes per-route HTML, 404.html, sitemap.xml, robots.txt |
| `npm test` | unit tests: scoring, validation, CSV import/export, seed integrity |
| `npm run test:db` | runs the real schema + seed + RLS policies in an in-process PostgreSQL (PGlite) and attacks it as anon, student and admin |
| `npm run test:e2e` | browser tests of the built site (needs `npx playwright install chromium`) |
| `npm run seed` | regenerate `supabase/seed.sql` + `src/data/seed.json` after editing `scripts/seed-data.mjs` |

---

## 5. Managing content

* **Subjects** can belong to several categories (Computer Fundamentals is in both Competitive Exams and Computer & Programming without a duplicate row). Status: Draft / Published / Archived. Subjects with topics or questions can't be deleted — archive them.
* **Topics** belong to one subject; unpublishing a topic hides its questions everywhere.
* **Questions** start as Draft. "Preview & publish" shows the student view before it goes live. Unpublished questions never appear on public pages, search, or practice sessions.
* **CSV import** (`/admin/import`): download the sample, fill it, upload. Every row is validated (required fields, A–D answer, distinct options, subject/topic/exam exist, duplicates against the bank and inside the file) and previewed with row numbers before anything is saved. The summary lists created / skipped / failed rows.
  Columns: `question,option_a,option_b,option_c,option_d,correct_option,explanation,subject,topic,difficulty,status,exam,tags,source,image_url` (first 7 required; tags separated by `;`).
* **Export CSV** on the Questions page downloads the whole bank in the same format (backup / bulk editing).
* **Practice sets** reference questions (no copies). Draft questions in a set stay hidden until published. Sets can be timed (1–600 min), previewed and archived.

---

## 6. Project structure

```
supabase/migrations/001_schema.sql   tables, constraints, triggers, views, RLS policies
supabase/migrations/002_comments.sql per-question discussion (login-only read/post, own/admin delete)
supabase/migrations/003_student_profiles.sql  mandatory mobile number at sign-up
supabase/migrations/004_mock_tests.sql        courses, mock tests, secure attempts, server scoring
supabase/migrations/005_site_visits.sql       anonymous page-view statistics
supabase/seed_mock.sql, seed_courses.sql      starter courses and mock tests
supabase/seed.sql                    catalog + sample questions (generated)
supabase/create_first_admin.sql      grant admin to an existing user
scripts/seed-data.mjs                source of the catalog + sample questions
scripts/build-seed.mjs               → seed.sql + src/data/seed.json
scripts/postbuild.mjs                per-route HTML, 404.html, sitemap, robots
src/lib/api.js                       data access used by all pages (lazy-loads one backend)
src/lib/supabaseBackend.js           Supabase queries (anon key + RLS)
src/lib/demoBackend.js               localStorage backend for demo mode
src/lib/docImport.js                 Word / PDF question import (runs in the browser)
src/pages/*                          public pages + practice engine (Play.jsx)
src/admin/*                          admin panel
tests/                               unit, database (RLS) and browser tests
.github/workflows/deploy.yml         CI tests + GitHub Pages deploy
```

---

## 7. Known limitations

* In practice and test modes, answers are downloaded with the questions so practice works on a static host, and scores are computed in the browser (self-assessment only). Mock tests do not have this limitation: answers stay on the server until submission and scoring is done in the database.
* Pre-rendered HTML (titles/descriptions for search engines) is generated from the seed catalog at build time. Content added later in the admin panel works for visitors immediately but is only pre-rendered after you update `scripts/seed-data.mjs` and redeploy; otherwise it is served via `404.html` (HTTP 404 status for crawlers).
* Page body content is rendered by JavaScript; search engines that don't run JavaScript only see the title/description.
* Image upload isn't built in — questions take an image **URL** (e.g. from Supabase Storage or any https host).

---

## License

Copyright © 2026 Md Inam. All rights reserved. The source is published for reference; reuse requires permission.
