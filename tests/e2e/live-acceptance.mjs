// Live acceptance test against the DEPLOYED site and the REAL Supabase database, with real accounts.
//   node tests/e2e/live-acceptance.mjs register   -> guest flow + registers two student accounts
//   (confirm both accounts from the emails Supabase sends)
//   node tests/e2e/live-acceptance.mjs run        -> the rest of the workflow
// State (test passwords, attempt ids) is kept in a local file outside the repo.
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const BASE = process.env.LIVE_BASE || 'https://inamkhankhan050-maker.github.io/StudyVeda';
const STATE = process.env.LIVE_STATE || '/workspace/projects/73393452-873a-4e3a-8f98-ee15397fc2f9/work/live-acceptance-state.json';
const SB_URL = 'https://cmtxxbmnkbiwfhzytibg.supabase.co';
const ANON = readFileSync(new URL('../../.github/workflows/deploy.yml', import.meta.url), 'utf8').match(/eyJ[A-Za-z0-9_.-]{100,}/)[0];
const MOCK = 'b-ed-mock-test-1';
const phase = process.argv[2];
let pass = 0, fail = 0;
const ok = (n, c, extra = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${extra ? '  [' + extra + ']' : ''}`); };
const st = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {};
const save = () => writeFileSync(STATE, JSON.stringify(st, null, 2));
const browser = await chromium.launch();
// The test sandbox's browser can't reach the internet directly; relay its requests through Node.
const newCtx = async (opts = {}) => {
  const c = await browser.newContext(opts);
  await c.route('**/*', async (route) => { try { await route.fulfill({ response: await route.fetch({ timeout: 30000 }) }); } catch { await route.abort().catch(() => {}); } });
  return c;
};
const body = (p) => p.locator('body').innerText();

async function register(page, who, name, mobile) {
  await page.getByLabel('Your name').fill(name);
  await page.getByPlaceholder('10-digit mobile number').fill(mobile);
  await page.getByLabel('Email').fill(who.email);
  await page.getByLabel('Password').fill(who.password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForSelector('.notice.ok, .notice.err', { timeout: 20000 });
  return (await page.locator('[role=alert]').first().innerText());
}

if (phase === 'register') {
  st.s1 = st.s1 || { email: 'shekhelias1+egtest1@gmail.com', password: 'Eg-' + randomBytes(9).toString('base64url') };
  st.s2 = st.s2 || { email: 'shekhelias1+egtest2@gmail.com', password: 'Eg-' + randomBytes(9).toString('base64url') };
  save();
  const ctx = await newCtx(); const page = await ctx.newPage();
  // 1. guest opens a B.Ed mock
  await page.goto(`${BASE}/mock-tests/${MOCK}`, { waitUntil: 'networkidle' });
  const t = await body(page);
  ok('1. guest can open the B.Ed mock page with its details', t.includes('B.Ed Entrance Mock Test 1') && /questions/i.test(t) && /duration/i.test(t));
  // 2-3. guest clicks Start -> login/registration required
  await page.getByRole('button', { name: /Start Mock Test/ }).click();
  await page.waitForURL(/\/login/, { timeout: 15000 });
  const lt = await body(page);
  ok('2-3. Start Mock sends the guest to the register/login screen, naming the mock', lt.includes('Create your account') && lt.includes('B.Ed Entrance Mock Test 1'));
  ok('   the chosen mock is remembered for after sign-in', (await page.evaluate(() => localStorage.getItem('eg-next-after-login') || '')).includes(MOCK));
  // 4. student registers
  const msg = await register(page, st.s1, 'EG Test Student 1', '9999900001');
  ok('4a. student 1 registration accepted (email confirmation required)', /confirmation link/i.test(msg), msg);
  st.ctx1 = await ctx.storageState(); save();
  const ctx2 = await newCtx(); const p2 = await ctx2.newPage();
  await p2.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await p2.getByRole('button', { name: 'Create an account' }).click();
  const msg2 = await register(p2, st.s2, 'EG Test Student 2', '9999900002');
  ok('4b. student 2 registration accepted', /confirmation link/i.test(msg2), msg2);
  save();
}

if (phase === 'confirm') {
  // Opens the confirmation link (from the email) in student 1's browser, which still remembers the chosen mock.
  const ctx = await newCtx({ storageState: st.ctx1 }); const page = await ctx.newPage();
  await page.goto(process.argv[3], { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  ok('5. after confirming and signing in, the student is back on the selected B.Ed mock', page.url().includes(`/mock-tests/${MOCK}`), page.url());
  st.ctx1 = await ctx.storageState(); save();
  if (process.argv[4]) { const c2 = await newCtx(); const p = await c2.newPage(); await p.goto(process.argv[4], { waitUntil: 'networkidle' }); }
}

if (phase === 'run') {
  if (process.env.MAIN === 's2') { const t = st.s1; st.s1 = st.s2; st.s2 = t; }
  const sb1 = createClient(SB_URL, ANON, { auth: { persistSession: false } });
  const sb2 = createClient(SB_URL, ANON, { auth: { persistSession: false } });
  const r1 = await sb1.auth.signInWithPassword(st.s1); const r2 = await sb2.auth.signInWithPassword(st.s2);
  ok('4c. both students can sign in (accounts confirmed)', !r1.error && !r2.error, (r1.error || r2.error)?.message);
  const { data: mrow } = await sb1.from('mock_tests').select('id,course_id').eq('slug', MOCK).single();
  const bedBank = await (async () => {   // the B.Ed question bank = published questions linked to the course (read with the admin-free view the DB allows: course_pool_counts gives counts only)
    const { data } = await sb1.rpc('course_pool_counts', { p_course: mrow.course_id }); return data;
  })();
  const { data: subs } = await sb1.from('mock_test_sections').select('subject_id,question_count').eq('mock_id', mrow.id);

  const ctx = await newCtx(); const page = await ctx.newPage();
  let a1, g1, by, want;
  if (!process.env.RESUME) {
  // 1-6. guest opens the mock, is sent to sign in, signs in through the UI and starts the mock
  
  await page.goto(`${BASE}/mock-tests/${MOCK}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.mock-detail', { timeout: 30000 });
  const gt = await body(page);
  ok('1. guest can open the B.Ed mock page with questions, duration and sections', gt.includes('B.Ed Entrance Mock Test 1') && /questions/i.test(gt) && /duration/i.test(gt) && /sections/i.test(gt));
  await page.getByRole('button', { name: /Start Mock Test/ }).click();
  await page.waitForURL(/\/login/);
  ok('2-3. Start Mock requires login/registration', (await body(page)).includes('Create your account'));
  await page.getByRole('button', { name: 'Back to sign in' }).click();
  await page.getByLabel('Email').fill(st.s1.email); await page.getByLabel('Password').fill(st.s1.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(new RegExp(`/mock-tests/${MOCK}`), { timeout: 20000 });
  ok('5b. signing in through the UI returns to the same B.Ed mock', page.url().includes(MOCK));
  await page.getByRole('button', { name: /Start Mock Test|Resume/ }).click();
  await page.waitForURL(/\/mock\/attempt\//, { timeout: 30000 });
  a1 = page.url().split('/mock/attempt/')[1].split(/[?#]/)[0];
  st.a1 = a1; save();
  await page.waitForSelector('.exam-timer', { timeout: 30000 });
  ok('6. student starts the mock (attempt page with timer)', (await page.locator('.exam-timer').count()) === 1);
  g1 = (await sb1.rpc('get_mock_attempt', { p_attempt: a1 })).data;
  by = (qs) => qs.reduce((m, q) => ((m[q.subject_id] = (m[q.subject_id] || 0) + 1), m), {});
  want = Object.fromEntries(subs.map((s) => [s.subject_id, s.question_count]));
  ok('7. configured subject-wise counts (English 5, Hindi 5, Computer 5)', JSON.stringify(Object.entries(by(g1.questions)).sort()) === JSON.stringify(Object.entries(want).sort()), JSON.stringify(by(g1.questions)));
  const bankSubjects = new Set(bedBank.map((x) => x.subject_id));
  ok('8. every question comes from the B.Ed course subjects', g1.questions.every((q) => bankSubjects.has(q.subject_id) && want[q.subject_id]));
  ok('   answers are hidden while the test runs', g1.questions.every((q) => q.correct_option == null));
  // answer through the UI: pick option A on each question, Save & Next
  await page.waitForSelector('.opts .opt', { timeout: 30000 });
  for (let i = 0; i < g1.questions.length; i++) {
    await page.locator('.opts .opt').first().click();
    await page.waitForTimeout(250);
    if (i < g1.questions.length - 1) await page.getByRole('button', { name: /Save & Next/ }).click();
  }
  await page.getByRole('button', { name: /Submit test/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Submit$/ }).click();
  await page.waitForURL(/\/mock\/result\//, { timeout: 30000 });
  await page.waitForSelector('.result-score', { timeout: 30000 });
  const rt = await body(page);
  ok('9. student submits; result page shows score and subject-wise performance', rt.includes('marks') && rt.includes('Subject-wise performance'));
  const att1 = (await sb1.from('mock_attempts').select('*').eq('id', a1).single()).data;
  const hist = (await sb1.from('student_question_history').select('question_id').eq('course_id', mrow.course_id)).data;
  ok('10. result saved (submitted, server-scored) and question history saved for all 15 answered', att1.status === 'submitted' && att1.correct + att1.incorrect === 15 && hist.length === 15, `score ${att1.score}/${att1.max_score}, history ${hist.length}`);
  } else {
    // resume after step 10: sign in through the UI and continue with the saved attempt
    a1 = st.a1; g1 = (await sb1.rpc('get_mock_attempt', { p_attempt: a1 })).data;
    want = Object.fromEntries(subs.map((s) => [s.subject_id, s.question_count]));
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
    await page.getByLabel('Email').fill(st.s1.email); await page.getByLabel('Password').fill(st.s1.password);
    await page.getByRole('button', { name: 'Sign in' }).click(); await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 20000 });
  }
  // 11. PDF report
  await page.goto(`${BASE}/my/report/${a1}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(8000); await page.waitForSelector('.report-score', { state: 'attached', timeout: 45000 });
  const pdf = await page.pdf({ format: 'A4' });
  writeFileSync('/tmp/eg-report.pdf', pdf);
  const rep = await body(page);
  ok('11. student downloads their PDF report (generated, contains their email and score)', pdf.length > 20000 && rep.includes(st.s1.email) && rep.includes('Question-wise answers'), `${pdf.length} bytes`);
  // 12-15. second mock
  await page.goto(`${BASE}/mock-tests/${MOCK}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.mock-detail', { timeout: 30000 });
  await page.getByRole('button', { name: /Start Mock Test/ }).click();
  await page.waitForURL(/\/mock\/attempt\//, { timeout: 30000 });
  const a2 = page.url().split('/mock/attempt/')[1].split(/[?#]/)[0]; st.a2 = a2; save();
  ok('12. student starts another B.Ed mock (new attempt)', a2 !== a1);
  const g2 = (await sb1.rpc('get_mock_attempt', { p_attempt: a2 })).data;
  const first = new Set(g1.questions.map((q) => q.id));
  const pool = Object.fromEntries(bedBank.reduce((m, x) => { m.set(x.subject_id, (m.get(x.subject_id) || 0) + Number(x.n)); return m; }, new Map()));
  let policyOk = true; const detail = [];
  for (const s of subs) {
    const qs = g2.questions.filter((q) => q.subject_id === s.subject_id);
    const fresh = qs.filter((q) => !first.has(q.id)).length, reused = qs.length - fresh;
    const unattemptedLeft = pool[s.subject_id] - s.question_count;          // after attempt 1 answered all of its 5
    const expFresh = Math.min(s.question_count, unattemptedLeft);
    detail.push(`${qs[0]?.subject}: ${fresh} new + ${reused} reused (pool ${pool[s.subject_id]})`);
    if (fresh !== expFresh || reused !== s.question_count - expFresh) policyOk = false;
  }
  ok('13-14. unattempted first; reuse only for the missing count, per subject', policyOk, detail.join('; '));
  ok('15. no duplicate question within the attempt', new Set(g2.questions.map((q) => q.id)).size === g2.questions.length && g2.questions.length === 15);
  ok('16. no unrelated subject or course questions', g2.questions.every((q) => want[q.subject_id]));
  ok('   was_reused flags match the reused questions', g2.questions.filter((q) => q.was_reused).every((q) => first.has(q.id)) && g2.questions.filter((q) => first.has(q.id)).every((q) => q.was_reused));
  await sb1.rpc('submit_mock', { p_attempt: a2, p_answers: {} });

  // 17. student 2 cannot see student 1's data
  const x1 = await sb2.rpc('get_mock_attempt', { p_attempt: a1 });
  const x2 = await sb2.from('mock_attempts').select('id').eq('id', a1);
  const x3 = await sb2.from('mock_attempt_questions').select('question_id').eq('attempt_id', a1);
  const x4 = await sb2.from('student_question_history').select('user_id');
  const anon = createClient(SB_URL, ANON, { auth: { persistSession: false } });
  const x5 = await anon.rpc('get_mock_attempt', { p_attempt: a1 });
  ok('17a. API: student 2 / guests get nothing for student 1\'s attempt', !!x1.error && x2.data.length === 0 && x3.data.length === 0 && x4.data.every((r) => r.user_id !== r1.data.user.id) && !!x5.error, x1.error?.message);
  const c2 = await newCtx(); const p2 = await c2.newPage();
  await p2.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await p2.getByLabel('Email').fill(st.s2.email); await p2.getByLabel('Password').fill(st.s2.password);
  await p2.getByRole('button', { name: 'Sign in' }).click(); await p2.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 20000 });
  await p2.goto(`${BASE}/mock/result/${a1}`, { waitUntil: 'networkidle' }); await p2.waitForTimeout(6000);
  const v1 = await body(p2);
  await p2.goto(`${BASE}/my/report/${a1}`, { waitUntil: 'networkidle' }); await p2.waitForTimeout(6000);
  const v2 = await body(p2);
  ok('17b. UI: student 2 changing the id in the URL sees "Result not found" for result and report', v1.includes('Result not found') && v2.includes('Result not found') && !v2.includes(st.s1.email));
  await p2.goto(`${BASE}/my/mock-tests`, { waitUntil: 'networkidle' }); await p2.waitForTimeout(6000);
  const o = await body(p2);
  ok('   the other student\'s dashboard does not show this student\'s attempts', !o.includes(a1) && !(await p2.locator(`a[href*="${a1}"]`).count()));
  await page.goto(`${BASE}/my/mock-tests`, { waitUntil: 'networkidle' }); await page.waitForTimeout(7000);
  const d1 = await body(page);
  ok('   student 1\'s My Mock Tests shows best/latest score, attempts and PDF links', d1.includes('Best score') && d1.includes('Latest score') && d1.includes('Average accuracy') && (await page.getByRole('link', { name: /PDF/ }).count()) >= 2);
  await page.goto(`${BASE}/my/performance`, { waitUntil: 'networkidle' }); await page.waitForTimeout(7000);
  ok('   My Performance shows the progress chart and subject-wise table', (await page.locator('.trend svg').count()) === 1 && (await body(page)).includes('Subject-wise'));
  if (process.env.MAIN === 's2') { const t = st.s1; st.s1 = st.s2; st.s2 = t; }
  save();
}

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
