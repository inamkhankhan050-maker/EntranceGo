# EntranceGo — test results (26 Oct 2026)

All results below were produced by running the test files in this repository. Nothing is assumed.

| Suite | Command | Result |
|---|---|---|
| Unit (scoring, validation, CSV, seed integrity) | `npm test` | **17 / 17 passed** |
| Database security: real schema + seed + RLS on PostgreSQL 16 (PGlite), as anon / student / admin | `npm run test:db` | **30 / 30 passed** |
| Browser end-to-end, built site served like GitHub Pages under `/entrancego/` (demo backend) | `node tests/e2e/e2e.mjs` | **85 / 85 passed** |
| Browser, Supabase build against an unreachable backend + secret-key guard | `node tests/e2e/supabase-mode.mjs` | **6 / 6 passed** |
| Production build | `npm run build` | passes; main bundle 80 KB gzip, admin code split into its own chunks |

## Coverage of the 17 requested areas

| # | Area | Status | Evidence |
|---|---|---|---|
| 1 | Homepage & navigation | ✅ tested | all homepage sections render; Explore Subjects, header nav, footer links |
| 2 | Subject & topic creation | ✅ tested (demo) · ✅ DB rules tested | admin creates subject (auto slug, categories, publish) and topic; duplicate slug blocked; subject with questions can't be deleted |
| 3 | Question creation & editing | ✅ tested | required-field errors, duplicate options, missing answer, preview, publish, duplicate-as-new, edit |
| 4 | Publish / unpublish | ✅ tested | published question appears on topic page; after unpublish it disappears from the page and from practice sessions; same verified at RLS level |
| 5 | Correct-answer validation | ✅ tested | form (A–D required) and database check constraint (`E` rejected) |
| 6 | Public sees published only | ✅ tested | anon sees 84 of 86; drafts unreadable even when requested; questions of an unpublished subject hidden |
| 7 | Practice mode | ✅ tested | one question at a time, submit → correct/incorrect feedback + explanation, answer locked, mark for review, palette |
| 8 | Test mode | ✅ tested | no feedback before submit, answers changeable, timer on timed sets, auto-submit on time-out (code path), reveal after submit |
| 9 | Scoring & review | ✅ tested | 1 correct / 1 incorrect / 4 unanswered → 16.7 % score, 50 % accuracy; 4/4 → 100 %; review filters; retry incorrect; double-click submit saves once |
| 10 | CSV import validation | ✅ tested | preview with 1 ready / 2 errors / 1 duplicate, row-numbered messages, summary created 1 / skipped 1 / failed 2; export → re-import detected as duplicates |
| 11 | Admin authorization | ✅ DB tested · ✅ UI gate tested | `is_admin()` true only for the configured admin; Supabase build shows "Admin sign-in required" and renders no admin navigation |
| 12 | Unauthorized database writes | ✅ DB tested | anon and students cannot insert/update/delete questions or subjects, change answers, or insert into `admins` |
| 13 | Student data isolation | ✅ DB tested | student 2 can't read or delete student 1's attempts; can't write attempts for others; inconsistent totals rejected |
| 14 | GitHub Pages build | ✅ tested locally | static `dist/` with base path, 127 pre-rendered public routes + 13 app routes, 404.html, sitemap.xml, robots.txt, .nojekyll. The Actions workflow itself runs only on GitHub. |
| 15 | Direct navigation & refresh | ✅ tested | 7 nested URLs loaded directly and refreshed → 200 with correct heading and title; unknown URL → 404.html fallback renders not-found state |
| 16 | Mobile responsiveness | ✅ tested | 11 pages × 320 / 360 / 390 / 768 / 1024 / 1440 px with no horizontal overflow (tables scroll inside their own container) |
| 17 | Empty states & backend errors | ✅ tested | empty subject, empty search, unreachable database → "Could not reach the database" + Try again; failed sign-in message; service_role key refused |

## Requires your Supabase project (not testable here)

These parts use the real Supabase service and could not be exercised without your project credentials:

* Live sign-up / sign-in / password reset emails through Supabase Auth.
* The supabase-js queries against PostgREST (embedded filters such as `subjects!inner(status)`), saving attempts and bookmarks over the network.
* GitHub Actions deployment on github.com.

The schema and every RLS policy those queries rely on **were** executed and attacked in PostgreSQL (test:db). After you finish the README setup, do this 5-minute check:

1. Open the site signed out → subjects and questions load (no "Demo mode" banner).
2. Visit `/admin` signed out → "Admin sign-in required".
3. Sign up a second, ordinary account → `/admin` says "Not authorised".
4. Sign in as your admin → create a draft question → it is not visible on the public topic page in a private window → publish → it appears.
5. Finish a practice session while signed in → it appears in My Progress.
