// After `vite build`: makes the single-page app work on GitHub Pages and improves SEO.
//  * dist/<route>/index.html for every known public route → direct visits and refreshes return 200,
//    each with its own <title>, description and canonical URL baked in.
//  * dist/404.html → fallback for any other URL (e.g. content added later in the admin panel).
//  * sitemap.xml, robots.txt, .nojekyll
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const env = { ...process.env };
for (const f of ['.env', '.env.local', '.env.production', '.env.production.local']) {
  const p = resolve(root, f);
  if (existsSync(p)) readFileSync(p, 'utf8').split('\n').forEach((l) => { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, ''); });
}
const SITE = (env.VITE_SITE_URL || '').replace(/\/$/, '');
const seed = JSON.parse(readFileSync(resolve(root, 'src/data/seed.json'), 'utf8'));
const template = readFileSync(resolve(dist, 'index.html'), 'utf8');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

const pub = (x) => x.status === 'published';
const subjects = seed.subjects.filter(pub);
const subjById = Object.fromEntries(subjects.map((s) => [s.id, s]));
const routes = [
  ['/', null, null],
  ['/subjects', 'All Subjects', 'Browse every EntranceGo subject: competitive exams, programming, engineering, university subjects and interview preparation.'],
  ['/exams', 'Competitive Examinations', 'Practice questions for SSC and Railway exams.'],
  ['/practice', 'Practice Sets', 'Ready-made MCQ practice sets and timed mini mocks.'],
  ['/mock-tests', 'Full Mock Tests', 'Full-length timed mock tests for B.Ed, SSC, Railway and other entrance exams, with subject-wise results and downloadable reports.'],
  ['/about', 'About EntranceGo', 'EntranceGo is a free MCQ practice platform.'],
  ['/contact', 'Contact', 'Contact the EntranceGo team.'],
  ['/privacy', 'Privacy Policy', 'How EntranceGo handles your data.'],
  ['/terms', 'Terms of Use', 'Terms for using EntranceGo.'],
  ['/disclaimer', 'Disclaimer', 'EntranceGo disclaimer.'],
  ...subjects.map((s) => [`/subjects/${s.slug}`, `${s.name} MCQ Questions and Answers`, `Practise ${s.name} MCQs topic by topic with answers and explanations.`]),
  ...seed.topics.filter((t) => pub(t) && subjById[t.subject_id]).map((t) => [`/subjects/${subjById[t.subject_id].slug}/${t.slug}`, `${t.name} – ${subjById[t.subject_id].name} MCQs`, `${t.name} multiple-choice questions for ${subjById[t.subject_id].name}, with answers and explanations.`]),
  ...seed.exams.filter(pub).map((e) => [`/exams/${e.slug}`, `${e.name} Practice Questions`, `Practise ${e.name}-style MCQs with answers and explanations.`]),
  ...seed.practice_sets.filter(pub).map((p) => [`/practice/${p.slug}`, p.title, p.description || p.title]),
];
// no-index app routes still need a file so refresh works
const appRoutes = ['/search', '/login', '/progress', '/play', '/admin', '/admin/subjects', '/admin/topics', '/admin/questions', '/admin/questions/new', '/admin/import', '/admin/sets', '/admin/sets/new', '/admin/exams', '/admin/students', '/admin/courses', '/admin/mocks', '/admin/mocks/new', '/admin/mock-attempts', '/admin/visitors', '/my/mock-tests', '/my/performance', '/my/analysis'];

function page(path, title, desc, noindex) {
  let html = template;
  if (title) html = html.replace(/<title>.*?<\/title>/, `<title>${esc(title)} | EntranceGo</title>`).replace(/(<meta property="og:title" content=")[^"]*/, `$1${esc(title)} | EntranceGo`);
  if (desc) html = html.replace(/(<meta name="description" content=")[^"]*/, `$1${esc(desc)}`).replace(/(<meta property="og:description" content=")[^"]*/, `$1${esc(desc)}`);
  if (SITE) html = html.replace(/(<link rel="canonical" href=")[^"]*/, `$1${SITE}${path === '/' ? '/' : path}`);
  if (noindex) html = html.replace('</head>', '    <meta name="robots" content="noindex,nofollow" />\n  </head>');
  if (path === '/') return writeFileSync(resolve(dist, 'index.html'), html);
  mkdirSync(resolve(dist, '.' + path), { recursive: true });
  writeFileSync(resolve(dist, '.' + path, 'index.html'), html);
}
routes.forEach(([p, t, d]) => page(p, t, d));
appRoutes.forEach((p) => page(p, null, null, true));
writeFileSync(resolve(dist, '404.html'), template);
writeFileSync(resolve(dist, '.nojekyll'), '');

const today = new Date().toISOString().slice(0, 10);
if (SITE) {
  writeFileSync(resolve(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    routes.map(([p]) => `  <url><loc>${SITE}${p === '/' ? '/' : p}</loc><lastmod>${today}</lastmod></url>`).join('\n') + '\n</urlset>\n');
}
writeFileSync(resolve(dist, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /play\nDisallow: /login\nDisallow: /progress\n${SITE ? `\nSitemap: ${SITE}/sitemap.xml\n` : ''}`);
console.log(`postbuild: ${routes.length} public routes + ${appRoutes.length} app routes pre-rendered as HTML shells, 404 fallback, ${SITE ? 'sitemap.xml' : 'NO sitemap (set VITE_SITE_URL)'}, robots.txt`);
