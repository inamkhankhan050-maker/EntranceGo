// End-to-end browser test of the built site (demo backend), served the way GitHub Pages serves it.
// Run: npm run build && node tests/e2e/e2e.mjs
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { serve } from './serve.mjs';

const BASE = 'http://localhost:4173/entrancego';
const SHOTS = process.env.SHOTS || '/tmp/shots';
mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };
const step = async (name, fn) => { try { await fn(); } catch (e) { fail++; console.log(`FAIL  ${name}: ${e.message.split("\n")[0]}`); await page.screenshot({ path: "/tmp/fail.png" }).catch(() => {}); } };

const srv = await serve('dist');
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('dialog', (d) => d.accept());
const go = async (path) => { const r = await page.goto(BASE + path, { waitUntil: 'networkidle' }); return r.status(); };
const text = () => page.locator('main, .admin-content').first().innerText();

// ---------------------------------------------------------------- 1. homepage & navigation
await step('homepage', async () => {
  await go('/');
  ok('homepage loads with hero heading', (await page.locator('h1').innerText()).includes('Practice MCQs for'));
  for (const h of ['Practice MCQs by Subject', 'Computer & Programming MCQs', 'CUET ENTRANCE EXAM MCQs', 'JMI ENTRANCE EXAM MCQs', 'AMU ENTRANCE EXAM MCQs', 'BHU ENTRANCE EXAM MCQs', 'Featured Practice Sets'])
    ok(`homepage section: ${h}`, await page.getByRole('heading', { name: h, exact: true }).count() === 1);
  const homeSubj = await page.locator('.sv-grid .subject-card:not(.exam-row)').count();
  const homeExam = await page.locator('.sv-grid .exam-row').count();
  ok('homepage shows every subject card (47 + Computer Fundamentals in 2 sections) and all 13 exams', homeSubj === 48 && homeExam === 13, `subjects=${homeSubj} exams=${homeExam}`);
  const order = await page.locator('.sv-head h2').allInnerTexts();
  ok('homepage section order', order.indexOf('AMU ENTRANCE EXAM MCQs') < order.indexOf('BHU ENTRANCE EXAM MCQs') && order[0] === 'Practice MCQs by Subject', order.join(' | '));
  const soon = await page.locator('.sv-grid .subject-card', { hasText: 'Mining Engineering' }).innerText();
  ok('homepage card shows no fake count', !/\d+ questions?/.test(soon), soon.replace(/\n/g, ' / '));
  await page.locator('.sv-grid .subject-card', { hasText: 'Mining Engineering' }).click();
  await page.waitForURL(/\/subjects\/mining-engineering$/);
  ok('empty subject card → subject page with empty state', (await text()).includes('on the way'), (await text()).slice(0, 200));
  await go('/');
  await page.locator('.exam-row', { hasText: 'RRB NTPC' }).click();
  await page.waitForURL(/\/exams\/rrb-ntpc$/);
  await page.locator('h1', { hasText: 'RRB NTPC' }).waitFor();
  ok('exam card → exam page with no-affiliation note', (await text()).includes('Not affiliated'), (await text()).slice(0, 160));
  await go('/');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Subjects' }).click();
  await page.waitForURL(/\/subjects$/);
  ok('nav Subjects → /subjects', (await page.locator('h1').innerText()) === 'All subjects');
  const cards = await page.locator('.subject-card').count();
  ok('All subjects page lists the catalog (Computer Fundamentals appears in 2 categories)', cards === 48, `cards=${cards}`);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Exams' }).click();
  ok('header nav → Exams', (await page.locator('h1').innerText()).includes('University Entrance Exams'));
});

// ---------------------------------------------------------------- 2. direct access & refresh on nested URLs
await step('direct navigation', async () => {
  for (const [p, h] of [['/subjects/aptitude', 'Aptitude'], ['/subjects/python/data-types', 'Data Types'], ['/exams/ssc-cgl', 'SSC CGL'], ['/exams/rrb-ntpc', 'RRB NTPC'], ['/practice/python-basics', 'Python Basics'], ['/subjects/sql', 'SQL'], ['/subjects/english', 'English']]) {
    const s = await go(p);
    await page.reload({ waitUntil: 'networkidle' });
    const h1 = await page.locator('h1').first().innerText();
    ok(`direct load + refresh ${p}`, s === 200 && h1 === h, `status=${s} h1=${h1}`);
  }
  ok('nested page has its own <title>', (await page.title()) === 'English MCQ Questions and Answers | EntranceGo');
  const s404 = await go('/subjects/does-not-exist');
  ok('unknown URL falls back to the app (404.html) and shows a not-found state', s404 === 404 && (await text()).includes("doesn't exist"));
  await go('/subjects/non-verbal-reasoning');
  ok('subject without questions shows a useful empty state', (await text()).includes('on the way'));
});

// ---------------------------------------------------------------- 3. search
await step('search', async () => {
  await go('/search?q=binary');
  const t = await text();
  ok('search finds question text', t.includes('binary search'));
  await go('/search?q=python');
  ok('search finds subject + topic + set', (await page.locator('.subject-card').count()) >= 1 && (await text()).includes('Python Basics'));
  await go('/search?q=zzzqqq');
  ok('search empty state', (await text()).includes('No results'));
});

// ---------------------------------------------------------------- 4. practice mode
await step('practice mode', async () => {
  await go('/practice/python-basics');
  await page.getByRole('link', { name: /Practice mode/ }).click();
  await page.waitForSelector('.q-card');
  ok('one question at a time', (await page.locator('.q-card .opt').count()) === 4);
  ok('progress shows 0 of 6', (await text()).includes('0 of 6 answered'));
  await page.locator('.opt').nth(0).click(); // Q1 answer A (correct)
  await page.getByRole('button', { name: 'Submit answer' }).click();
  ok('practice: correct feedback shown', await page.locator('.feedback.ok').isVisible());
  ok('practice: explanation shown', (await page.locator('.feedback').innerText()).includes('empty list'));
  ok('practice: answer locked after submit', await page.locator('.opt').nth(1).isDisabled());
  await page.getByRole('button', { name: /Next/ }).click();
  await page.locator('.opt').nth(0).click(); // Q2 correct is B → A is wrong
  await page.getByRole('button', { name: 'Mark for review' }).click();
  await page.getByRole('button', { name: 'Submit answer' }).click();
  ok('practice: incorrect feedback names the right answer', (await page.locator('.feedback.bad').innerText()).includes('The answer is B'));
  ok('palette shows correct / wrong / marked', await page.locator('.palette-grid .pal.p-correct').count() === 1 && await page.locator('.palette-grid .pal.p-wrong').count() === 1 && await page.locator('.palette-grid .pal.p-marked').count() === 1);
  await page.getByRole('button', { name: 'Finish practice' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Submit' }).dblclick();
  await page.waitForSelector('.result-card');
  const stats = await page.locator('.result-card .stat strong').allInnerTexts();
  ok('result: 1 correct, 1 incorrect, 4 unanswered, 50% accuracy', stats.join(',') === '1,1,4,50%', stats.join(','));
  ok('result: score 16.7%', (await page.locator('.score-big span').innerText()) === '16.7%');
  await page.getByRole('tab', { name: 'Incorrect' }).click();
  ok('review filter: incorrect only', (await page.locator('.q-review').count()) === 1);
  await page.locator('.q-review .icon-btn').first().click();
  await page.waitForTimeout(150);
  ok('bookmark toggles on', await page.locator('.q-review .icon-btn[aria-pressed="true"]').count() === 1);
  await page.getByRole('button', { name: /Retry 5/ }).click();
  ok('retry incorrect/skipped → 5-question round', (await text()).includes('0 of 5 answered'));
});

// ---------------------------------------------------------------- 5. test mode
await step('test mode', async () => {
  await go('/play?type=set&slug=sql-essentials&mode=test');
  await page.waitForSelector('.q-card');
  const answers = ['B', 'C', 'B', 'B'];
  for (let i = 0; i < 4; i++) {
    await page.locator('.opt').nth('ABCD'.indexOf(answers[i])).click();
    ok(`test mode Q${i + 1}: no feedback or explanation before submit`, (await page.locator('.feedback').count()) === 0 && !(await page.locator('.opt.correct').count()));
    if (i < 3) await page.getByRole('button', { name: /Next/ }).click();
  }
  await page.locator('.palette-grid .pal').nth(0).click();
  await page.locator('.opt').nth(1).click(); // change answer, then back
  await page.locator('.opt').nth(1).click();
  ok('test mode allows changing an answer', await page.locator('.opt.selected').count() === 1);
  await page.locator('.opt').nth(1).click();
  await page.getByRole('button', { name: 'Submit test' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Submit' }).click();
  await page.waitForSelector('.result-card');
  ok('test mode scoring: 4/4 = 100%', (await page.locator('.score-big span').innerText()) === '100%');
  ok('answers + explanations revealed after submit', (await page.locator('.q-review .explain').count()) === 4);
  await go('/progress');
  const sessions = await page.locator('.stat strong').first().innerText();
  ok('progress saved once per submission (double-click ignored): 2 sessions', sessions === '2', `sessions=${sessions}`);
  await go('/play?type=set&slug=aptitude-quick-test&mode=test');
  ok('timed set shows countdown', (await page.locator('.timer').innerText()).includes('left'));
});

// ---------------------------------------------------------------- 6. admin: subject, topic, question, publish/unpublish
await step('admin content management', async () => {
  await go('/admin');
  const stat = async (l) => Number(await page.locator('.stat-card', { hasText: l }).locator('strong').innerText());
  ok('dashboard shows real counts', (await stat('Subjects')) === 47 && (await stat('Drafts')) === 2 && (await stat('Published')) === 84);

  await go('/admin/subjects');
  await page.getByRole('button', { name: 'New subject' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  ok('subject form validates required fields', (await page.locator('.dialog, [role=dialog]').innerText()).includes('Choose at least one category'));
  const dlg = page.getByRole('dialog');
  await dlg.locator('input').first().fill('Quantum Basics');
  ok('slug auto-generated', (await dlg.locator('input.mono').inputValue()) === 'quantum-basics');
  await dlg.getByLabel('Engineering & GATE').check();
  await dlg.locator('select').nth(1).selectOption('published');
  await dlg.getByRole('button', { name: 'Save' }).click();
  await page.waitForSelector('text=Subject created.');
  await page.waitForSelector('td:has-text("Quantum Basics")');
  ok('subject created and listed', await page.locator('td', { hasText: 'Quantum Basics' }).count() === 1);

  await page.getByRole('button', { name: 'New subject' }).click();
  await page.getByRole('dialog').locator('input').first().fill('Aptitude');
  await page.getByRole('dialog').getByLabel('Competitive Exams').check();
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  ok('duplicate slug rejected', (await page.getByRole('dialog').innerText()).includes('already uses this slug'));
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('button', { name: 'Delete Aptitude' }).click();
  ok('delete of subject with questions is blocked (archive offered)', (await page.getByRole('dialog').innerText()).includes("can't be deleted"));
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();

  await go('/admin/topics');
  await page.getByRole('button', { name: 'New topic' }).click();
  const td = page.getByRole('dialog');
  await td.locator('select').first().selectOption({ label: 'Quantum Basics' });
  await td.locator('input').first().fill('Wave Particle Duality');
  await td.getByRole('button', { name: 'Save' }).click();
  await page.waitForSelector('text=Topic created.');
  await page.waitForSelector('td:has-text("Wave Particle Duality")');
  ok('topic created and listed', await page.locator('td', { hasText: 'Wave Particle Duality' }).count() === 1);

  await go('/admin/questions/new');
  await page.getByRole('button', { name: 'Save as draft' }).click();
  ok('question form: required-field errors', await page.locator('.err-text').count() >= 5);
  await page.locator('textarea').first().fill('Which scientist proposed that light behaves as particles called photons?');
  await page.locator('select').first().selectOption({ label: 'Quantum Basics' });
  await page.locator('select').nth(1).selectOption({ label: 'Wave Particle Duality' });
  await page.locator('select').nth(3).selectOption('easy');
  const opts = ['Albert Einstein', 'Isaac Newton', 'Isaac Newton', 'Niels Bohr'];
  for (let i = 0; i < 4; i++) await page.getByLabel(`Option ${'ABCD'[i]}`, { exact: true }).fill(opts[i]);
  await page.getByRole('button', { name: 'Preview & publish' }).click();
  const errs = await page.locator('.err-text').allInnerTexts();
  ok('question form: duplicate options + missing answer rejected', errs.some((e) => e.includes('same as option B')) && errs.some((e) => e.includes('Select the correct answer')), errs.join(' | '));
  await page.getByLabel('Option C', { exact: true }).fill('Max Planck');
  await page.locator('input[type=radio][value=A]').check();
  await page.locator('textarea').nth(1).fill('Einstein explained the photoelectric effect (1905) using light quanta, later called photons.');
  await page.getByRole('button', { name: 'Preview & publish' }).click();
  ok('preview shown before publishing', (await page.getByRole('dialog').innerText()).includes('Answer: A'));
  await page.getByRole('dialog').getByRole('button', { name: 'Publish question' }).dblclick();
  await page.waitForURL(/\/admin\/questions\/[^n]/);
  await page.waitForTimeout(300);

  await go('/subjects/quantum-basics/wave-particle-duality');
  ok('published question visible on public topic page', (await text()).includes('photons'));
  await go('/admin/questions?search=photons');
  ok('admin search by question text; no duplicate from double-click', (await page.locator('tbody tr').count()) === 1);
  await page.getByRole('button', { name: 'Duplicate question' }).click();
  await page.waitForSelector('textarea');
  ok('duplicate opens prefilled draft', (await page.locator('textarea').first().inputValue()).endsWith('(copy)'));
  await go('/admin/questions?search=photons');
  await page.getByRole('button', { name: 'Unpublish question' }).click();
  await page.waitForSelector('text=moved to drafts');
  await go('/subjects/quantum-basics/wave-particle-duality');
  ok('unpublished question hidden from public page', !(await text()).includes('photons'));
  await go('/play?type=subject&slug=quantum-basics&mode=practice');
  ok('unpublished question never enters practice sessions', (await text()).includes('No published questions'));

  await go('/admin/questions?status=draft');
  ok('filter by status = draft', (await page.locator('tbody tr').count()) === 3);
  await go('/admin/questions');
  ok('question list paginates (20 per page)', (await page.locator('tbody tr').count()) === 20 && (await text()).includes('Page 1 of 5'));
  await page.getByRole('button', { name: 'Delete question' }).first().click();
  ok('delete asks for confirmation', (await page.getByRole('dialog').innerText()).includes("can't be undone"));
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
});

// ---------------------------------------------------------------- 7. CSV import
await step('csv import', async () => {
  const csv = [
    'question,option_a,option_b,option_c,option_d,correct_option,explanation,subject,topic,difficulty,status',
    '"What is 30% of 200?",50,60,70,80,B,"0.3 × 200 = 60",aptitude,percentage,easy,published',
    '"Broken answer key row?",a,b,c,d,E,,aptitude,percentage,easy,draft',
    '"What is 15% of 480?",62,72,82,68,B,,aptitude,percentage,easy,published',
    '"Unknown subject row?",a,b,c,d,A,,astrology,,easy,draft',
  ].join('\n');
  writeFileSync('/tmp/import.csv', csv);
  await go('/admin/import');
  await page.locator('input[type=file]').setInputFiles('/tmp/import.csv');
  await page.waitForSelector('.import-summary');
  const s = await page.locator('.import-summary').innerText();
  ok('import preview: 1 ready, 2 errors, 1 duplicate', s.includes('1 ready') && s.includes('2 with errors') && s.includes('1 duplicates'), s.replace(/\n/g, ' '));
  const t = await text();
  ok('row-numbered error messages', t.includes('must be A, B, C or D') && t.includes('Unknown subject "astrology"') && t.includes('Already exists'));
  await page.getByRole('button', { name: /Import 1 valid question/ }).click();
  await page.waitForSelector('text=Import summary');
  const sum = await page.locator('.card', { hasText: 'Import summary' }).innerText();
  ok('import summary: created 1, skipped 1, failed 2 with row numbers', /1\s*Created/.test(sum) && /1\s*Skipped/.test(sum) && /2\s*Failed/.test(sum) && sum.includes('Row 3') && sum.includes('Row 5'), sum.replace(/\n/g, ' '));
  await go('/subjects/aptitude/percentage');
  ok('imported published question is live', (await text()).includes('What is 30% of 200?'));
});

// ---------------------------------------------------------------- 8. practice sets
await step('practice sets', async () => {
  await go('/admin/sets/new');
  await page.getByLabel('Title').fill('GK Lightning Round');
  await page.getByLabel('Status', { exact: true }).first().selectOption('published');
  await page.getByRole('button', { name: 'Save set' }).click();
  ok('cannot publish an empty set', (await text()).includes('Add at least one question'));
  await page.getByLabel('Subject').last().selectOption({ label: 'General Knowledge' });
  const boxes = page.locator('.pick-list input[type=checkbox]');
  for (let i = 0; i < 3; i++) await boxes.nth(i).check();
  ok('3 questions selected', (await page.locator('.picked-list li').count()) === 3);
  await page.getByLabel('Time limit (minutes)').fill('5');
  await page.getByRole('button', { name: 'Preview' }).click();
  ok('set preview lists questions', (await page.getByRole('dialog').locator('.q-study').count()) === 3);
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Save set' }).click();
  await page.waitForURL(/\/admin\/sets$/);
  await page.waitForSelector('td:has-text("GK Lightning Round")');
  ok('set saved and listed', await page.locator('td', { hasText: 'GK Lightning Round' }).count() === 1);
  await go('/practice/gk-lightning-round');
  ok('published set is public with time limit', (await text()).includes('3 questions') && (await text()).includes('5 minutes'));
  await go('/admin/sets');
  await page.getByRole('button', { name: 'Archive GK Lightning Round' }).click();
  await page.waitForSelector('text=Set archived.');
  await go('/practice/gk-lightning-round');
  ok('archived set no longer public', (await text()).includes("doesn't exist"));
});

// ---------------------------------------------------------------- 9. responsive layout
await step('responsive', async () => {
  const pages = ['/', '/subjects', '/subjects/aptitude', '/subjects/aptitude/percentage', '/play?type=set&slug=python-basics&mode=practice', '/exams/ssc-cgl', '/admin', '/admin/questions', '/admin/questions/new', '/admin/import', '/login'];
  for (const w of [320, 360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width: w, height: 900 });
    const bad = [];
    for (const p of pages) {
      await go(p);
      await page.waitForTimeout(80);
      // pages may scroll horizontally only inside .table-wrap containers
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (over > 1) bad.push(`${p} (+${over}px)`);
      if ([320, 390, 768, 1440].includes(w) && ['/', '/play?type=set&slug=python-basics&mode=practice', '/admin/questions', '/subjects/aptitude'].includes(p))
        await page.screenshot({ path: `${SHOTS}/${w}-${p.replace(/[^a-z]+/g, '_') || 'home'}.png` });
    }
    ok(`no horizontal overflow at ${w}px (${pages.length} pages)`, bad.length === 0, bad.join(', '));
  }
});

ok('no uncaught JavaScript errors', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close(); srv.close();
process.exit(fail ? 1 : 0);
