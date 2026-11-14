// DEMO backend: used only when Supabase is not configured.
// Everything lives in this browser's localStorage. It is NOT secure and NOT shared between visitors.
// It mirrors the database rules (published-only reads, unique slugs, FK restrictions, duplicate checks)
// so the whole UI can be tried before a backend exists.
import seed from '../data/seed.json';
import { normText } from './text.js';

const KEY = 'studyveda-demo-db-v1';
const clone = (x) => JSON.parse(JSON.stringify(x));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now());
const now = () => new Date().toISOString();

let db;
function load() {
  if (db) return db;
  try { db = JSON.parse(localStorage.getItem(KEY)); } catch { db = null; }
  if (!db || !db.subjects) db = { ...clone(seed), attempts: [], bookmarks: [] };
  db.comments ||= [];
  db.pyq_papers ||= [];
  return db;
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* storage full */ } }
export function resetDemo() { localStorage.removeItem(KEY); db = null; load(); }

const fail = (message, code) => { const e = new Error(message); e.code = code; throw e; };
const delay = (v) => new Promise((r) => setTimeout(() => r(v), 60));

// ---------- visibility rules (same as RLS) ----------
const pubSubject = (d, id) => d.subjects.some((s) => s.id === id && s.status === 'published');
const pubTopic = (d, id) => !id || d.topics.some((t) => t.id === id && t.status === 'published' && pubSubject(d, t.subject_id));
const visibleQ = (d, q) => q.status === 'published' && pubSubject(d, q.subject_id) && pubTopic(d, q.topic_id);

export const demo = {
  name: 'demo',

  async loadCatalog() {
    const d = load();
    const subjects = d.subjects.filter((s) => s.status === 'published');
    const topics = d.topics.filter((t) => t.status === 'published' && pubSubject(d, t.subject_id));
    const qs = d.questions.filter((q) => visibleQ(d, q));
    const sets = d.practice_sets.filter((p) => p.status === 'published');
    const setIds = new Set(sets.map((s) => s.id));
    const count = (f) => qs.filter(f).length;
    return delay(clone({
      categories: d.categories,
      subjects, topics, sets,
      subject_categories: d.subject_categories.filter((x) => pubSubject(d, x.subject_id)),
      exams: d.exams.filter((e) => e.status === 'published'),
      set_questions: d.practice_set_questions.filter((x) => setIds.has(x.set_id) && qs.some((q) => q.id === x.question_id)),
      subject_stats: subjects.map((s) => ({ subject_id: s.id, topic_count: topics.filter((t) => t.subject_id === s.id).length, question_count: count((q) => q.subject_id === s.id) })),
      topic_stats: topics.map((t) => ({ topic_id: t.id, question_count: count((q) => q.topic_id === t.id) })),
      exam_stats: d.exams.map((e) => ({ exam_id: e.id, question_count: count((q) => q.exam_id === e.id) })),
    }));
  },

  async fetchQuestions({ subject_id, topic_id, exam_id, ids, limit } = {}) {
    const d = load();
    let qs = d.questions.filter((q) => visibleQ(d, q));
    if (subject_id) qs = qs.filter((q) => q.subject_id === subject_id);
    if (topic_id) qs = qs.filter((q) => q.topic_id === topic_id);
    if (exam_id) qs = qs.filter((q) => q.exam_id === exam_id);
    if (ids) qs = ids.map((id) => qs.find((q) => q.id === id)).filter(Boolean);
    else qs.sort((a, b) => a.created_at.localeCompare(b.created_at));
    return delay(clone(limit ? qs.slice(0, limit) : qs));
  },

  async searchQuestions(text, limit = 20) {
    const d = load(); const n = normText(text);
    return delay(clone(d.questions.filter((q) => visibleQ(d, q) && normText(q.question).includes(n)).slice(0, limit)));
  },

  async recentQuestions(limit = 5) {
    const d = load();
    return delay(clone(d.questions.filter((q) => visibleQ(d, q)).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit)));
  },

  // ---------- auth: demo accounts live ONLY in this browser (not secure, not shared) ----------
  async getUser() { return currentUser(); },
  onAuthChange(cb) { listeners.add(cb); return () => listeners.delete(cb); },
  async signIn(email, password) {
    const e = email.trim().toLowerCase(); const u = users().find((x) => x.email === e);
    if (!u || u.hash !== await hashPw(e, password)) fail('Wrong email or password.');
    localStorage.setItem(SESSION_KEY, u.id); const pub = toPublic(u); emit(pub); return pub;
  },
  async signUp(email, password, name, phone) {
    const e = email.trim().toLowerCase(); const list = users();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) fail('Enter a valid email address.');
    if ((password || '').length < 8) fail('Password must be at least 8 characters.');
    if (!phone) fail('Enter a valid 10-digit mobile number.');
    if (list.some((x) => x.email === e)) fail('An account with this email already exists on this device. Sign in instead.');
    const u = { id: uid(), email: e, name: (name || '').trim().slice(0, 40) || e.split('@')[0], phone, hash: await hashPw(e, password), created_at: now() };
    list.push(u); localStorage.setItem(USERS_KEY, JSON.stringify(list)); localStorage.setItem(SESSION_KEY, u.id);
    const pub = toPublic(u); emit(pub); return { user: pub, session: true };
  },
  async signOut() { localStorage.removeItem(SESSION_KEY); emit(null); },
  async resetPassword() { fail('Password reset needs the database. In demo mode, create a new account instead.'); },
  async isAdmin() { return true; }, // demo admin edits only this browser's copy

  // ---------- student data (this device only) ----------
  async saveAttempt(a) { const d = load(); const row = { id: uid(), user_id: 'device', created_at: now(), ...a }; d.attempts.unshift(row); save(); return delay(clone(row)); },
  async listAttempts() { return delay(clone(load().attempts)); },
  async deleteAttempt(id) { const d = load(); d.attempts = d.attempts.filter((x) => x.id !== id); save(); return delay(true); },
  async listBookmarks() { return delay(load().bookmarks.map((b) => b.question_id)); },
  async toggleBookmark(question_id, on) {
    const d = load(); d.bookmarks = d.bookmarks.filter((b) => b.question_id !== question_id);
    if (on) d.bookmarks.push({ question_id, created_at: now() }); save(); return delay(on);
  },

  // ---------- discussion (signed-in users only, like the database rules) ----------
  async listComments(question_id) {
    if (!currentUser()) fail('Login to read the discussion.');
    return delay(clone(load().comments.filter((c) => c.question_id === question_id).sort((a, b) => b.created_at.localeCompare(a.created_at))));
  },
  async addComment(question_id, body, author_name) {
    const u = currentUser(); if (!u) fail('Login to post a comment.');
    const text = (body || '').trim(); if (!text) fail('Write something first.'); if (text.length > 1000) fail('Comments can be at most 1000 characters.');
    const d = load(); if (!d.questions.some((q) => q.id === question_id && visibleQ(d, q))) fail('This question is not available.');
    const row = { id: uid(), question_id, user_id: u.id, author_name: (author_name || '').trim().slice(0, 40) || 'Student', body: text, created_at: now() };
    d.comments.push(row); save(); return delay(clone(row));
  },
  async deleteComment(id) {
    const u = currentUser(); const d = load(); const c = d.comments.find((x) => x.id === id);
    if (!u || !c || c.user_id !== u.id) fail('You can delete only your own comments.');
    d.comments = d.comments.filter((x) => x.id !== id); save(); return delay(true);
  },

  async pyqPapers() {
    return delay(clone(load().pyq_papers.filter((p) => p.status === 'published').sort((a, b) => b.year - a.year || a.sort_order - b.sort_order)));
  },

  async uploadPyqFile() { throw new Error('File upload needs the online database. Connect Supabase to use it.'); },

  // ---------- admin ----------
  async adminSelect(table) {
    if (table === 'student_profiles') return delay(users().filter((u) => u.phone).map((u) => ({ user_id: u.id, full_name: u.name, email: u.email, phone: u.phone, created_at: u.created_at })));
    return delay(clone(load()[table] || []));
  },

  async adminInsert(table, row) {
    const d = load(); checkRow(d, table, row);
    const r = { id: uid(), created_at: now(), updated_at: now(), created_by: 'demo-admin', updated_by: 'demo-admin', ...row };
    d[table].push(r); save(); return delay(clone(r));
  },
  async adminUpdate(table, id, patch) {
    const d = load(); const i = d[table].findIndex((x) => x.id === id);
    if (i < 0) fail('This record no longer exists.');
    const next = { ...d[table][i], ...patch, id, created_at: d[table][i].created_at, updated_at: now(), updated_by: 'demo-admin' };
    checkRow(d, table, next, id);
    d[table][i] = next; save(); return delay(clone(next));
  },
  async adminDelete(table, id) {
    const d = load();
    if (table === 'subjects' && (d.topics.some((t) => t.subject_id === id) || d.questions.some((q) => q.subject_id === id)))
      fail('This subject still has topics or questions. Archive it instead, or move its content first.', '23503');
    if (table === 'topics' && d.questions.some((q) => q.topic_id === id)) fail('This topic still has questions. Move or delete them first.', '23503');
    d[table] = d[table].filter((x) => x.id !== id);
    if (table === 'subjects') d.subject_categories = d.subject_categories.filter((x) => x.subject_id !== id);
    if (table === 'questions') { d.practice_set_questions = d.practice_set_questions.filter((x) => x.question_id !== id); d.bookmarks = d.bookmarks.filter((b) => b.question_id !== id); }
    if (table === 'practice_sets') { d.practice_set_questions = d.practice_set_questions.filter((x) => x.set_id !== id); d.pyq_papers.forEach((p) => { if (p.set_id === id) p.set_id = null; }); }
    if (table === 'exams') d.questions.forEach((q) => { if (q.exam_id === id) q.exam_id = null; });
    save(); return delay(true);
  },
  async replaceLinks(table, key, value, rows) {
    const d = load(); d[table] = (d[table] || []).filter((x) => x[key] !== value).concat(rows); save(); return delay(true);
  },
  async adminQueryQuestions({ search, subject_id, topic_id, exam_id, difficulty, status, page = 1, pageSize = 20 }) {
    let qs = load().questions.slice();
    if (search) qs = qs.filter((q) => normText(q.question).includes(normText(search)));
    if (subject_id) qs = qs.filter((q) => q.subject_id === subject_id);
    if (topic_id) qs = qs.filter((q) => q.topic_id === topic_id);
    if (exam_id) qs = qs.filter((q) => q.exam_id === exam_id);
    if (difficulty) qs = qs.filter((q) => q.difficulty === difficulty);
    if (status) qs = qs.filter((q) => q.status === status);
    qs.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    return delay({ rows: clone(qs.slice((page - 1) * pageSize, page * pageSize)), count: qs.length });
  },
  async adminGet(table, id) { const r = load()[table].find((x) => x.id === id); return delay(r ? clone(r) : null); },
  // Mock tests need the shared database (secure attempts, per-student history); demo mode only lists nothing.
  async mockCatalog() { return { courses: [], mocks: [], sections: [], subjects: [] }; },
  async coursePoolCounts() { return []; },
  async courseCatalog() { return { courses: [], course_subjects: [] }; },
  async trackVisit() {},
  async visitStats() { throw new Error('Visitor statistics need the online database.'); },
  ...Object.fromEntries(['startMock', 'getMockAttempt', 'saveMockAnswer', 'submitMock', 'myMockAttempts', 'myMockAnswers', 'topicsByIds', 'adminMockAttempts', 'adminCourseLinks', 'adminLinkQuestions', 'adminUnlinkQuestions']
    .map((k) => [k, async () => { throw new Error('Mock tests need the online database. Connect Supabase to use them.'); }])),
};

// demo accounts
const USERS_KEY = 'studyveda-demo-users-v1', SESSION_KEY = 'studyveda-demo-session-v1';
const listeners = new Set();
const emit = (u) => listeners.forEach((cb) => { try { cb(u); } catch { /* ignore */ } });
function users() { try { return JSON.parse(localStorage.getItem(USERS_KEY)) || []; } catch { return []; } }
const toPublic = (u) => ({ id: u.id, email: u.email, user_metadata: { full_name: u.name } });
function currentUser() { const id = localStorage.getItem(SESSION_KEY); const u = id && users().find((x) => x.id === id); return u ? toPublic(u) : null; }
async function hashPw(email, pw) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('studyveda-demo:' + email + ':' + pw));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

// mirrors the SQL constraints
function checkRow(d, table, r, selfId) {
  const others = d[table].filter((x) => x.id !== selfId);
  if (['subjects', 'exams', 'practice_sets', 'categories', 'pyq_papers'].includes(table) && others.some((x) => x.slug === r.slug))
    fail(`The slug "${r.slug}" is already used. Choose another.`, '23505');
  if (table === 'topics' && others.some((x) => x.subject_id === r.subject_id && x.slug === r.slug))
    fail(`This subject already has a topic with slug "${r.slug}".`, '23505');
  if (table === 'questions') {
    if (others.some((x) => x.subject_id === r.subject_id && normText(x.question) === normText(r.question)))
      fail('An identical question already exists in this subject.', '23505');
    if (r.topic_id && !d.topics.some((t) => t.id === r.topic_id && t.subject_id === r.subject_id))
      fail('The selected topic does not belong to this subject.', '23503');
  }
}
