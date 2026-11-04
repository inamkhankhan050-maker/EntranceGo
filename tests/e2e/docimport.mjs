// Word (.docx) + PDF bulk import in the admin panel (demo mode). Fixtures: pandoc-made .docx and a Chromium-printed PDF.
import { chromium } from 'playwright';
import { existsSync, mkdirSync, copyFileSync, readFileSync } from 'node:fs';
import { serve } from './serve.mjs';
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
await serve('dist');
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
const p = await ctx.newPage();
const errors = []; p.on('pageerror', (e) => errors.push(e.message));
const B = 'http://localhost:4173/entrancego';
const FX = '/tmp/fx'; mkdirSync(FX, { recursive: true });
['auto.docx', 'typed.docx', 'table.docx', 'manzil-table.pdf'].forEach((f) => copyFileSync(new URL('../fixtures/' + f, import.meta.url), FX + '/' + f)); // made with: pandoc tests/fixtures/<name>.md -o <name>.docx
try {
  // make a text PDF
  const mk = await ctx.newPage();
  await mk.setContent(`<pre style="font:14px sans-serif">1. What is the capital of France in the pdf test?
A) Berlin
B) Paris
C) Rome
D) Madrid
Answer: B
Explanation: Paris is the capital of France.

2. How many days are in a week in the pdf test?
(a) 5 (b) 6 (c) 7 (d) 8
Correct Answer: 7</pre>`);
  await mk.pdf({ path: FX + '/q.pdf' }); await mk.close();
  ok('fixtures exist', ['auto.docx', 'typed.docx', 'q.pdf'].every((f) => existsSync(`${FX}/${f}`)));

  await p.goto(B + '/admin/import', { waitUntil: 'networkidle' });
  ok('page mentions Word and PDF', await p.getByText('Choose a CSV, Word or PDF file').isVisible() && await p.locator('.doc-sample').isVisible());
  const input = p.locator('input[type=file]');

  // typed docx
  await input.setInputFiles(FX + '/typed.docx');
  await p.getByText('3 questions found.').waitFor({ timeout: 15000 });
  ok('typed docx: 3 questions found, subject requested', await p.getByText('Choose a subject to check the questions.').isVisible());
  await p.locator('.doc-opts select').first().selectOption({ label: 'Aptitude' });
  await p.locator('.doc-opts select').nth(1).selectOption({ label: 'Percentage' });
  await p.waitForSelector('.import-summary');
  let s = await p.locator('.import-summary').innerText();
  ok('typed docx: 2 ready, 1 error (missing answer)', s.includes('2 ready') && s.includes('1 with errors'), s.replace(/\n/g, ' '));
  ok('error names the missing answer', await p.locator('tr.row-invalid').first().innerText().then((t) => /Correct option/.test(t)));

  // auto-numbered docx
  await input.setInputFiles(FX + '/auto.docx');
  await p.getByText('2 questions found.').waitFor({ timeout: 15000 });
  await p.locator('.doc-opts select').first().selectOption({ label: 'Aptitude' });
  await p.waitForSelector('.import-summary');
  s = await p.locator('.import-summary').innerText();
  ok('auto-numbered docx: 2 ready', s.includes('2 ready') && s.includes('0 with errors'), s.replace(/\n/g, ' '));

  // pdf, published, then import
  await input.setInputFiles(FX + '/q.pdf');
  await p.getByText('2 questions found.').waitFor({ timeout: 20000 });
  await p.locator('.doc-opts select').first().selectOption({ label: 'Aptitude' });
  await p.locator('.doc-opts select').nth(3).selectOption('published');
  await p.waitForSelector('.import-summary');
  s = await p.locator('.import-summary').innerText();
  ok('pdf: 2 ready', s.includes('2 ready'), s.replace(/\n/g, ' '));
  await p.getByRole('button', { name: /Import 2 valid questions/ }).click();
  await p.waitForSelector('text=Import summary');
  ok('pdf import created 2', /2\s*Created/.test(await p.locator('.card', { hasText: 'Import summary' }).innerText()));
  await p.goto(B + '/subjects/aptitude', { waitUntil: 'networkidle' });
  await p.goto(B + '/admin/questions', { waitUntil: 'networkidle' });
  await p.waitForSelector('table'); const qtext = await p.locator('body').innerText();
  ok('imported pdf questions are in the bank', qtext.includes('capital of France in the pdf test') && qtext.includes('days are in a week in the pdf test'));

  // re-import same pdf -> duplicates
  await p.goto(B + '/admin/import', { waitUntil: 'networkidle' });
  await p.locator('input[type=file]').setInputFiles(FX + '/q.pdf');
  await p.getByText('2 questions found.').waitFor({ timeout: 20000 });
  await p.locator('.doc-opts select').first().selectOption({ label: 'Aptitude' });
  await p.waitForSelector('.import-summary');
  ok('re-importing marks duplicates', (await p.locator('.import-summary').innerText()).includes('2 duplicates'));

  // table-layout exports (Question / Option / Solution rows)
  await p.locator('input[type=file]').setInputFiles(FX + '/manzil-table.pdf');
  await p.getByText('20 questions found.').waitFor({ timeout: 20000 });
  await p.locator('.doc-opts select').first().selectOption({ label: 'General Knowledge' });
  await p.waitForSelector('.import-summary');
  s = await p.locator('.import-summary').innerText();
  ok('table-layout PDF: 20 ready', s.includes('20 ready') && s.includes('0 with errors'), s.replace(/\n/g, ' '));
  await p.locator('input[type=file]').setInputFiles(FX + '/table.docx');
  await p.getByText('2 questions found.').waitFor({ timeout: 20000 });
  await p.locator('.doc-opts select').first().selectOption({ label: 'General Knowledge' });
  await p.waitForSelector('.import-summary');
  s = await p.locator('.import-summary').innerText();
  ok('table-layout DOCX: 2 ready', s.includes('2 ready') && s.includes('0 with errors'), s.replace(/\n/g, ' '));
  // phone pickers sometimes give a file with no extension and a generic type
  await p.locator('input[type=file]').setInputFiles({ name: 'document', mimeType: 'application/octet-stream', buffer: readFileSync(FX + '/q.pdf') });
  ok('extension-less PDF is still read', await p.getByText('2 questions found.').waitFor({ timeout: 20000 }).then(() => true, () => false));
  await p.locator('input[type=file]').setInputFiles({ name: 'msf:1234', mimeType: '', buffer: readFileSync(FX + '/typed.docx') });
  ok('extension-less DOCX is still read', await p.getByText('3 questions found.').waitFor({ timeout: 20000 }).then(() => true, () => false));
  ok('file input accepts any file (no greyed-out files in phone pickers)', (await p.locator('input[type=file]').getAttribute('accept')) === null);
  // bad files
  await p.locator('input[type=file]').setInputFiles({ name: 'old.doc', mimeType: 'application/msword', buffer: Buffer.from('x') });
  ok('.doc is rejected with a Save As hint', await p.getByText(/Save As → Word Document/).isVisible());
  await p.locator('input[type=file]').setInputFiles({ name: 'broken.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not a pdf') });
  ok('broken pdf shows a readable error', await p.getByText(/Could not read this file/).waitFor({ timeout: 15000 }).then(() => true, () => false));
  // CSV still works
  await p.locator('input[type=file]').setInputFiles({ name: 'a.csv', mimeType: 'text/csv', buffer: Buffer.from('question,option_a,option_b,option_c,option_d,correct_option,subject\nCSV still works here?,a,b,c,d,A,aptitude\n') });
  await p.waitForSelector('.import-summary');
  ok('CSV import still works', (await p.locator('.import-summary').innerText()).includes('1 ready'));
  const w = await p.evaluate(() => document.documentElement.scrollWidth);
  ok('no horizontal overflow on mobile', w <= 390, String(w));
  ok('no page errors', errors.length === 0, errors.join(' | '));
} catch (e) { ok('run', false, e.message); }
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
