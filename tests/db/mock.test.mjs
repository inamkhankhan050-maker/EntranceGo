// Mock-test system test against a real in-process PostgreSQL (PGlite) running the real migrations.
// Covers: login-mandatory start, the "unattempted first, reuse only for the missing count" policy per subject,
// strict course/subject eligibility, no duplicates, server-side scoring, history only for answered questions,
// ownership isolation between students, and admin visibility.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const db = new PGlite();
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  [' + extra + ']' : ''}`); };
const as = async (role, uid) => {
  await db.exec('reset role');
  await db.exec(`select set_config('request.jwt.claim.sub', '${uid || ''}', false)`);
  if (role !== 'postgres') await db.exec(`set role ${role}`);
};
const q = async (sql, params) => (await db.query(sql, params)).rows;
const tryq = async (sql, params) => { try { return { rows: await q(sql, params) }; } catch (e) { return { error: e.message }; } };
const mig = (f) => readFileSync(new URL('../../supabase/' + f, import.meta.url), 'utf8');

await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`);
for (const f of ['migrations/001_schema.sql', 'migrations/002_comments.sql', 'migrations/003_student_profiles.sql', 'seed.sql', 'migrations/004_mock_tests.sql', 'migrations/005_site_visits.sql']) await db.exec(mig(f));

const ADMIN = '11111111-1111-1111-1111-111111111111', S1 = '22222222-2222-2222-2222-222222222222', S2 = '33333333-3333-3333-3333-333333333333';
await db.exec(`
  insert into auth.users values
    ('${ADMIN}','admin@example.com','{"full_name":"Admin","phone":"9876543210"}'),
    ('${S1}','student1@example.com','{"full_name":"Asha","phone":"9876543211"}'),
    ('${S2}','student2@example.com','{"full_name":"Ravi","phone":"9876543212"}');
  insert into public.admins values ('${ADMIN}');
`);
ok('migrations 001-004 + seed load; signup trigger creates student profiles', (await q('select count(*)::int n from student_profiles'))[0].n === 3);

// ---------- build a B.Ed course and an unrelated course, as the admin ----------
await as('authenticated', ADMIN);
const sid = async (slug, name) => (await q(`insert into subjects (slug, name, status) values ($1,$2,'published') on conflict (slug) do update set status='published' returning id`, [slug, name]))[0].id;
const ENG = (await q(`select id from subjects where slug='english'`))[0].id;
const HIN = await sid('hindi-test', 'Hindi');
const COMP = (await q(`select id from subjects where slug='computer-fundamentals'`))[0].id;
const BED = (await q(`insert into courses (slug,name,status) values ('bed','B.Ed Entrance','published') returning id`))[0].id;
const SSC = (await q(`insert into courses (slug,name,status) values ('ssc','SSC','published') returning id`))[0].id;
const diffs = ['easy', 'medium', 'hard'];
async function makeQs(subject, prefix, n, course, status = 'published') {
  const ids = [];
  for (let i = 0; i < n; i++) {
    const r = await q(`insert into questions (subject_id, question, option_a, option_b, option_c, option_d, correct_option, difficulty, status)
                       values ($1,$2,'opt one','opt two','opt three','opt four',$3,$4,$5) returning id`,
      [subject, `${prefix} question number ${i + 1}?`, 'ABCD'[i % 4], diffs[i % 3], status]);
    ids.push(r[0].id);
    if (course) await q('insert into course_questions values ($1,$2)', [course, r[0].id]);
  }
  return ids;
}
const engB = await makeQs(ENG, 'BEd English', 18, BED);
const hinB = await makeQs(HIN, 'BEd Hindi', 45, BED);
const compB = await makeQs(COMP, 'BEd Computer', 70, BED);
const engSSC = await makeQs(ENG, 'SSC-only English', 30, SSC);               // other course
const engLoose = await makeQs(ENG, 'Unlinked English', 30, null);             // in no course
const engDraft = await makeQs(ENG, 'Draft BEd English', 10, BED, 'draft');    // linked but unpublished
const bedSet = new Set([...engB, ...hinB, ...compB]);
const subjOf = Object.fromEntries([...engB.map((x) => [x, ENG]), ...hinB.map((x) => [x, HIN]), ...compB.map((x) => [x, COMP])]);

const MOCK = (await q(`insert into mock_tests (course_id, slug, title, total_questions, duration_minutes, marks_per_question, negative_marks, status)
                       values ($1,'bed-mock-1','B.Ed Mock 1',60,60,1,0.25,'published') returning id`, [BED]))[0].id;
await q(`insert into mock_test_sections (mock_id, subject_id, question_count, position) values ($1,$2,10,0),($1,$3,20,1),($1,$4,30,2)`, [MOCK, ENG, HIN, COMP]);
const DRAFT_MOCK = (await q(`insert into mock_tests (course_id, slug, title, total_questions, status) values ($1,'bed-draft','Draft mock',10,'draft') returning id`, [BED]))[0].id;
await q(`insert into mock_test_sections (mock_id, subject_id, question_count) values ($1,$2,10)`, [DRAFT_MOCK, ENG]);
ok('admin can configure course, question links, mock and subject sections', true);

// ---------- guest ----------
await as('anon');
let r = await tryq(`select title, total_questions, duration_minutes from mock_tests where id=$1`, [MOCK]);
ok('guest can see the published mock details (questions, duration)', r.rows?.[0]?.total_questions === 60 && r.rows[0].duration_minutes === 60);
r = await tryq(`select count(*)::int n from mock_test_sections where mock_id=$1`, [MOCK]);
ok('guest can see the subject-wise layout', r.rows?.[0]?.n === 3);
r = await tryq(`select count(*)::int n from mock_tests where id=$1`, [DRAFT_MOCK]);
ok('guest cannot see a draft mock', r.rows?.[0]?.n === 0);
r = await tryq(`select start_mock($1)`, [MOCK]);
ok('guest cannot start a mock (login mandatory, enforced in the database)', !!r.error, r.error?.slice(0, 60));
r = await tryq(`select count(*) from mock_attempts`);
ok('guest cannot read any attempts', !!r.error);

// ---------- student 1, attempt 1 ----------
await as('authenticated', S1);
r = await tryq(`select start_mock($1) id`, [DRAFT_MOCK]);
ok('student cannot start a draft mock', !!r.error);
const A1 = (await q(`select start_mock($1) id`, [MOCK]))[0].id;
const A1again = (await q(`select start_mock($1) id`, [MOCK]))[0].id;
ok('starting again resumes the same unfinished attempt (questions preserved)', A1 === A1again);
let att = (await q(`select get_mock_attempt($1) j`, [A1]))[0].j;
let qs = att.questions;
const countBy = (list, f) => list.reduce((m, x) => ((m[f(x)] = (m[f(x)] || 0) + 1), m), {});
let bySubj = countBy(qs, (x) => x.subject_id);
ok('attempt 1 has the configured counts: English 10, Hindi 20, Computer 30', qs.length === 60 && bySubj[ENG] === 10 && bySubj[HIN] === 20 && bySubj[COMP] === 30, JSON.stringify([bySubj[ENG], bySubj[HIN], bySubj[COMP]]));
ok('attempt 1: no duplicate questions', new Set(qs.map((x) => x.id)).size === 60);
ok('attempt 1: only B.Ed questions, each in its own subject section', qs.every((x) => bedSet.has(x.id) && subjOf[x.id] === x.subject_id));
ok('answers and explanations are hidden while the attempt is running', qs.every((x) => x.correct_option == null && x.explanation == null));
r = await tryq(`select count(*)::int n from student_question_history`);
ok('opening/starting a mock records no question as attempted', r.rows?.[0]?.n === 0);

// direct writes are blocked
r = await tryq(`update mock_attempts set score = 999 where id=$1 returning id`, [A1]);
ok('student cannot edit their score directly', !!r.error || r.rows.length === 0);
r = await tryq(`insert into mock_attempts (user_id, mock_id, course_id, attempt_no, expires_at, total_questions, marks_per_question, negative_marks) values ($1,$2,$3,1,now(),1,1,0)`, [S1, MOCK, BED]);
ok('student cannot insert attempts directly', !!r.error);
r = await tryq(`insert into student_question_history (user_id, course_id, question_id) values ($1,$2,$3)`, [S1, BED, engB[0]]);
ok('student cannot write question history directly', !!r.error);
r = await tryq(`select _mock_finalize($1)`, [A1]);
ok('student cannot call the internal finalize function', !!r.error);

// save one answer through the API, submit the rest: answer every question, 50 right and 10 wrong
const correctOf = Object.fromEntries((await (async () => { await as('postgres'); const x = await q('select id, correct_option from questions'); await as('authenticated', S1); return x; })()).map((x) => [x.id, x.correct_option]));
const wrong = (c) => ({ A: 'B', B: 'C', C: 'D', D: 'A' }[c]);
await q(`select save_mock_answer($1,$2,$3)`, [A1, qs[0].id, correctOf[qs[0].id]]);
const answers1 = Object.fromEntries(qs.slice(1).map((x, i) => [x.id, i < 10 ? wrong(correctOf[x.id]) : correctOf[x.id]]));
const sub1 = (await q(`select submit_mock($1,$2::jsonb) j`, [A1, JSON.stringify(answers1)]))[0].j;
ok('server scores the attempt: 50 correct, 10 wrong, score 50 - 10x0.25 = 47.5', sub1.correct === 50 && sub1.incorrect === 10 && sub1.unanswered === 0 && Number(sub1.score) === 47.5 && Number(sub1.max_score) === 60, `${sub1.correct}/${sub1.incorrect}/${sub1.score}`);
r = await tryq(`select count(*)::int n from student_question_history where user_id=$1 and course_id=$2`, [S1, BED]);
ok('question history saved for all 60 answered questions', r.rows?.[0]?.n === 60);
att = (await q(`select get_mock_attempt($1) j`, [A1]))[0].j;
ok('after submit the result shows correct answers', att.questions.every((x) => x.correct_option));
const sub1b = (await q(`select submit_mock($1,'{}'::jsonb) j`, [A1]))[0].j;
ok('submitting twice does not change the result', Number(sub1b.score) === 47.5);
const firstIds = new Set(qs.map((x) => x.id));

// ---------- student 1, attempt 2: the spec example ----------
const A2 = (await q(`select start_mock($1) id`, [MOCK]))[0].id;
qs = (await q(`select get_mock_attempt($1) j`, [A2]))[0].j.questions;
const fresh = (s) => qs.filter((x) => x.subject_id === s && !firstIds.has(x.id)).length;
const reused = (s) => qs.filter((x) => x.subject_id === s && firstIds.has(x.id)).length;
ok('attempt 2 English: 8 unattempted + 2 previously attempted', fresh(ENG) === 8 && reused(ENG) === 2, `${fresh(ENG)}+${reused(ENG)}`);
ok('attempt 2 Hindi: 20 unattempted, 0 reused', fresh(HIN) === 20 && reused(HIN) === 0, `${fresh(HIN)}+${reused(HIN)}`);
ok('attempt 2 Computer: 30 unattempted, 0 reused', fresh(COMP) === 30 && reused(COMP) === 0, `${fresh(COMP)}+${reused(COMP)}`);
ok('attempt 2: total 60, no duplicates', qs.length === 60 && new Set(qs.map((x) => x.id)).size === 60);
ok('attempt 2: was_reused flag marks exactly the 2 reused questions', qs.filter((x) => x.was_reused).length === 2);
ok('attempt 2: no SSC-only, unlinked or draft questions', !qs.some((x) => [...engSSC, ...engLoose, ...engDraft].includes(x.id)) && qs.every((x) => bedSet.has(x.id)));
ok('Hindi spare questions were NOT used to fill the English gap', qs.filter((x) => x.subject_id === ENG).length === 10);

// ---------- student 2 cannot touch student 1's data ----------
await as('authenticated', S2);
r = await tryq(`select get_mock_attempt($1)`, [A1]);
ok("student 2 cannot open student 1's result by its id", !!r.error && /not found/i.test(r.error));
r = await tryq(`select count(*)::int n from mock_attempts`);
ok("student 2 sees none of student 1's attempts", r.rows?.[0]?.n === 0);
r = await tryq(`select count(*)::int n from mock_attempt_questions where attempt_id=$1`, [A1]);
ok("student 2 cannot read student 1's answers", r.rows?.[0]?.n === 0);
r = await tryq(`select count(*)::int n from student_question_history`);
ok("student 2 cannot read student 1's question history", r.rows?.[0]?.n === 0);
r = await tryq(`select save_mock_answer($1,$2,'A')`, [A2, qs[0].id]);
ok("student 2 cannot answer in student 1's running attempt", !!r.error);
r = await tryq(`select submit_mock($1,'{}'::jsonb)`, [A2]);
ok("student 2 cannot submit student 1's attempt", !!r.error);

// student 2: unanswered questions do not count as attempted
const B1 = (await q(`select start_mock($1) id`, [MOCK]))[0].id;
const bq = (await q(`select get_mock_attempt($1) j`, [B1]))[0].j.questions;
const bAns = Object.fromEntries(bq.slice(0, 40).map((x) => [x.id, 'A']));
const bsub = (await q(`select submit_mock($1,$2::jsonb) j`, [B1, JSON.stringify(bAns)]))[0].j;
r = await q(`select count(*)::int n from student_question_history where user_id=$1`, [S2]);
ok('only the 40 answered questions count as attempted (20 left blank do not)', r[0].n === 40 && bsub.unanswered === 20, `${r[0].n}`);
r = await q(`select count(*)::int n from student_question_history where user_id=$1`, [S1]).catch(() => [{ n: -1 }]);
ok('history is tracked per student (student 2 sees only their own)', r[0].n === 0);

// ---------- time limit, max attempts, availability, misconfiguration ----------
await as('postgres');
await q(`update mock_attempts set expires_at = now() - interval '5 minutes' where id=$1`, [A2]);
await as('authenticated', S1);
r = await tryq(`select save_mock_answer($1,$2,'A')`, [A2, qs[0].id]);
ok('answers cannot be saved after the time limit', !!r.error);
const lateSub = (await q(`select submit_mock($1,$2::jsonb) j`, [A2, JSON.stringify(Object.fromEntries(qs.map((x) => [x.id, correctOf[x.id]])))]))[0].j;
ok('answers sent after the time limit are ignored (scored as unanswered)', lateSub.unanswered === 60 && Number(lateSub.score) === 0);

await as('authenticated', ADMIN);
await q(`update mock_tests set max_attempts = 2 where id=$1`, [MOCK]);
await as('authenticated', S1);
r = await tryq(`select start_mock($1)`, [MOCK]);
ok('max attempts is enforced (3rd start refused when limit is 2)', !!r.error && /attempt/i.test(r.error));
await as('authenticated', ADMIN);
await q(`update mock_tests set max_attempts = null, available_until = now() - interval '1 day', available_from = now() - interval '2 days' where id=$1`, [MOCK]);
await as('authenticated', S1);
r = await tryq(`select start_mock($1)`, [MOCK]);
ok('a closed mock cannot be started', !!r.error && /closed/i.test(r.error));
await as('authenticated', ADMIN);
await q(`update mock_tests set available_until = null, available_from = null, total_questions = 61 where id=$1`, [MOCK]);
await as('authenticated', S1);
r = await tryq(`select start_mock($1)`, [MOCK]);
ok('a mock whose total does not match its sections is refused', !!r.error && /configured/i.test(r.error));
await as('authenticated', ADMIN);
await q(`update mock_tests set total_questions = 60 where id=$1`, [MOCK]);

// pool exhausted across all tiers -> clear error, nothing half-created
await as('authenticated', ADMIN);
const SMALL = (await q(`insert into mock_tests (course_id, slug, title, total_questions, status) values ($1,'too-big','Too big',25,'published') returning id`, [BED]))[0].id;
await q(`insert into mock_test_sections (mock_id, subject_id, question_count) values ($1,$2,25)`, [SMALL, ENG]);
await as('authenticated', S1);
r = await tryq(`select start_mock($1)`, [SMALL]);
const leftover = await q(`select count(*)::int n from mock_attempts where mock_id=$1`, [SMALL]);
ok('when a subject has fewer eligible questions than needed, start fails cleanly (no partial attempt)', !!r.error && /Not enough questions in English/.test(r.error) && leftover[0].n === 0);

// no-repeat preference switched off: still course-strict and duplicate-free
await as('authenticated', ADMIN);
await q(`update mock_tests set prefer_unattempted = false where id=$1`, [MOCK]);
await as('authenticated', S1);
const A3 = (await q(`select start_mock($1) id`, [MOCK]))[0].id;
qs = (await q(`select get_mock_attempt($1) j`, [A3]))[0].j.questions;
ok('with the preference off, selection is still B.Ed-only, per-subject and duplicate-free', qs.length === 60 && new Set(qs.map((x) => x.id)).size === 60 && qs.every((x) => bedSet.has(x.id) && subjOf[x.id] === x.subject_id));

// difficulty distribution
await as('authenticated', ADMIN);
await q(`update mock_tests set prefer_unattempted = true, pct_easy = 50, pct_medium = 30, pct_hard = 20 where id=$1`, [MOCK]);
const D1 = '44444444-4444-4444-4444-444444444444';
await as('postgres');
await q(`insert into auth.users values ($1,'student3@example.com','{"phone":"9876543213"}')`, [D1]);
await as('authenticated', D1);
const DA = (await q(`select start_mock($1) id`, [MOCK]))[0].id;
qs = (await q(`select get_mock_attempt($1) j`, [DA]))[0].j.questions;
const comp = qs.filter((x) => x.subject_id === COMP);
const dc = countBy(comp, (x) => x.difficulty);
ok('difficulty mix 50/30/20 is applied per subject (Computer 30 -> 15/9/6)', dc.easy === 15 && dc.medium === 9 && dc.hard === 6, JSON.stringify(dc));

// ---------- admin ----------
await as('authenticated', ADMIN);
r = await tryq(`select count(*)::int n from mock_attempts`);
ok('admin can see every student\'s attempts', r.rows?.[0]?.n >= 5, String(r.rows?.[0]?.n));
r = await tryq(`select get_mock_attempt($1) j`, [A1]);
ok('admin can open any attempt with the student name', r.rows?.[0]?.j?.student?.name === 'Asha' && r.rows[0].j.questions.length === 60);
r = await tryq(`select subject_id, sum(n)::int n from course_pool_counts($1) group by subject_id`, [BED]);
ok('admin/guest pool counts exclude drafts (English 18, Hindi 45, Computer 70)', JSON.stringify(Object.fromEntries(r.rows.map((x) => [x.subject_id, x.n]))) === JSON.stringify({ ...Object.fromEntries([[ENG, 18], [HIN, 45], [COMP, 70]].sort()) }) || (r.rows.find((x) => x.subject_id === ENG)?.n === 18 && r.rows.find((x) => x.subject_id === HIN)?.n === 45 && r.rows.find((x) => x.subject_id === COMP)?.n === 70));
await as('authenticated', S1);
r = await tryq(`select count(*)::int n from course_questions`);
ok('students cannot list the course question bank links', r.rows?.[0]?.n === 0);

// ---------- the real B.Ed starter seed ----------
await as('postgres');
await db.exec(mig('seed_mock.sql')); await db.exec(mig('seed_mock.sql'));   // twice: must be re-runnable
await as('authenticated', D1);
const seedMock = (await q(`select id from mock_tests where slug='b-ed-mock-test-1'`))[0].id;
const SA = (await q(`select start_mock($1) id`, [seedMock]))[0].id;
const sq = (await q(`select get_mock_attempt($1) j`, [SA]))[0].j.questions;
ok('B.Ed starter seed loads twice and its mock starts with 5 English + 5 Hindi + 5 Computer', sq.length === 15 && JSON.stringify(Object.values(countBy(sq, (x) => x.subject)).sort()) === '[5,5,5]', JSON.stringify(countBy(sq, (x) => x.subject)));


// ---- 005 site visits
await as('anon');
ok('visits: guest can log a page view', !(await tryq(`select public.track_visit('guest-abc-123', '/mock-tests')`)).error);
await tryq(`select public.track_visit('guest-abc-123', '/')`); await tryq(`select public.track_visit('guest-abc-123', '/admin/mocks')`);
ok('visits: guest cannot read raw visits', !!(await tryq('select * from public.site_visits')).error);
ok('visits: guest cannot read stats', !!(await tryq('select public.visit_stats()')).error);
await as('authenticated', S1);
await tryq(`select public.track_visit('student1-browser', '/')`);
ok('visits: student cannot read stats', !!(await tryq('select public.visit_stats()')).error);
ok('visits: student cannot insert directly', !!(await tryq(`insert into public.site_visits (visitor_id, path) values ('x1234567', '/')`)).error);
await as('authenticated', ADMIN);
const vs = (await q('select public.visit_stats() s'))[0].s;
ok('visits: admin stats count today (2 visitors, 3 views, admin page skipped)', vs.today.visitors === 2 && vs.today.views === 3, JSON.stringify(vs.today));
ok('visits: daily has 30 days, monthly and yearly filled', vs.daily.length === 30 && vs.monthly.length === 1 && vs.yearly.length === 1 && vs.top_pages[0].path === '/');
await as('postgres');
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
