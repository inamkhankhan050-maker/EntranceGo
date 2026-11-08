# EntranceGo setup

Full steps for a fresh Supabase project and a GitHub Pages deploy. The short version is in the main README.

## Set up Supabase (free tier, about 10 minutes)

1. Create an account at https://supabase.com → **New project**. Choose a region near your users (e.g. Mumbai), set a database password, wait for it to start.
2. **Create the schema:** Dashboard → **SQL Editor** → **New query**. Paste and run each file in `supabase/migrations/` in order, `001_schema.sql` through `007_pyq_files.sql`. Each file is safe to run again.
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
   * Never use the `service_role` / **secret** key anywhere in this project.

**Free plan (supabase.com/pricing, checked Oct 2026):** $0/month, 500 MB database, 50,000 monthly active users, 5 GB egress, 1 GB file storage, no automatic backups, max 2 active projects, and free projects are **paused after 1 week of inactivity** (restore from the dashboard). Export your questions with the admin "Export CSV" button regularly as a backup. The built-in email sender is heavily rate-limited — fine for testing; add custom SMTP (Authentication → SMTP, free on all plans) before real sign-ups. Nothing is charged unless you upgrade to a paid plan.

---

## Deploy on GitHub Pages (free)

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

## Managing content

* **Subjects** can belong to several categories (Computer Fundamentals is in both Competitive Exams and Computer & Programming without a duplicate row). Status: Draft / Published / Archived. Subjects with topics or questions can't be deleted — archive them.
* **Topics** belong to one subject; unpublishing a topic hides its questions everywhere.
* **Questions** start as Draft. "Preview & publish" shows the student view before it goes live. Unpublished questions never appear on public pages, search, or practice sessions.
* **CSV import** (`/admin/import`): download the sample, fill it, upload. Every row is validated (required fields, A–D answer, distinct options, subject/topic/exam exist, duplicates against the bank and inside the file) and previewed with row numbers before anything is saved. The summary lists created / skipped / failed rows.
  Columns: `question,option_a,option_b,option_c,option_d,correct_option,explanation,subject,topic,difficulty,status,exam,tags,source,image_url` (first 7 required; tags separated by `;`).
* **Export CSV** on the Questions page downloads the whole bank in the same format (backup / bulk editing).
* **Practice sets** reference questions (no copies). Draft questions in a set stay hidden until published. Sets can be timed (1–600 min), previewed and archived.
