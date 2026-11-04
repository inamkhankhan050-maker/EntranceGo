// Builds the Supabase variant against an unreachable backend and checks it fails safely:
// clear error states, admin locked behind sign-in, no demo data, secret keys refused.
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { serve } from './serve.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const build = (key, out) => execSync(`npx vite build --outDir ${out} --emptyOutDir && node -e "require('fs').copyFileSync('${out}/index.html','${out}/404.html')"`,
  { env: { ...process.env, VITE_SUPABASE_URL: 'http://127.0.0.1:9', VITE_SUPABASE_ANON_KEY: key, VITE_BASE_PATH: '/entrancego/' }, stdio: 'pipe' });

const anonLike = 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url') + '.sig';
const secretLike = 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url') + '.sig';
build(anonLike, '/tmp/dist-supa');
build(secretLike, '/tmp/dist-secret');

const b = await chromium.launch();
for (const [dir, label] of [['/tmp/dist-supa', 'anon'], ['/tmp/dist-secret', 'secret']]) {
  const srv = await serve(dir);
  const p = await b.newPage();
  await p.route(/fonts\./, (r) => r.abort());
  await p.goto('http://localhost:4173/entrancego/', { waitUntil: 'networkidle' });
  const t0 = Date.now();
  await p.waitForSelector('.state-error', { timeout: 60000 }).catch(() => {});
  const t = await p.locator('main').innerText();
  if (label === 'anon') {
    ok('supabase build: no demo banner, no demo data', !t.includes('Demo mode') && (await p.locator('.subject-card').count()) === 0);
    ok('supabase build: unreachable database shows a clear error + retry', t.includes('Could not reach the database') && t.includes('Try again'), t.slice(0, 120).replace(/\n/g, ' '));
    await p.goto('http://localhost:4173/entrancego/admin', { waitUntil: 'networkidle' });
    await p.waitForTimeout(400);
    const a = await p.locator('.admin-content').innerText();
    ok('supabase build: /admin requires sign-in, no admin navigation rendered', a.includes('Admin sign-in required') && (await p.locator('nav[aria-label=Admin]').count()) === 0);
    await p.goto('http://localhost:4173/entrancego/login', { waitUntil: 'networkidle' });
    ok('supabase build: login form enabled', await p.locator('input[type=email]').isEnabled());
    await p.fill('input[type=email]', 'x@example.com'); await p.fill('input[type=password]', 'wrongpass1');
    await p.getByRole('button', { name: 'Sign in' }).last().click();
    await p.waitForSelector('.notice.err', { timeout: 15000 });
    ok('supabase build: failed sign-in shows an error message', (await p.locator('.notice.err').innerText()).length > 0);
  } else {
    ok('secret (service_role) key is refused at runtime', t.includes('SECRET (service_role) key'), t.slice(0, 140).replace(/\n/g, ' '));
  }
  srv.close(); await p.close();
}
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
