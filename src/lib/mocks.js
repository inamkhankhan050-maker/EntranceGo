import { backend } from './api.js';

// Remember the mock a guest chose so it reopens after sign-in or email confirmation.
const NEXT_KEY = 'eg-next-after-login';
export const rememberNext = (path) => { try { localStorage.setItem(NEXT_KEY, JSON.stringify({ path, at: Date.now() })); } catch { /* private mode */ } };
export const takeNext = () => {
  try {
    const v = JSON.parse(localStorage.getItem(NEXT_KEY) || 'null');
    localStorage.removeItem(NEXT_KEY);
    return v && Date.now() - v.at < 3 * 24 * 3600 * 1000 && typeof v.path === 'string' && v.path.startsWith('/') && !v.path.startsWith('//') ? v.path : null;
  } catch { return null; }
};
export const peekNext = () => { try { return JSON.parse(localStorage.getItem(NEXT_KEY) || 'null')?.path || null; } catch { return null; } };

export async function getMockCatalog() {
  const c = await backend.mockCatalog();
  const subjectById = Object.fromEntries(c.subjects.map((s) => [s.id, s]));
  const courseById = Object.fromEntries(c.courses.map((x) => [x.id, x]));
  const mocks = c.mocks.filter((m) => courseById[m.course_id]).map((m) => ({
    ...m,
    course: courseById[m.course_id],
    sections: c.sections.filter((s) => s.mock_id === m.id).sort((a, b) => a.position - b.position).map((s) => ({ ...s, subject: subjectById[s.subject_id] })),
  }));
  return { courses: c.courses.map((x) => ({ ...x, mocks: mocks.filter((m) => m.course_id === x.id) })), mocks, subjectById };
}

export const fmtMarks = (n) => (n == null ? '–' : Number(n).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1'));
export const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
export const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');

export function availability(m, now = Date.now()) {
  if (m.available_from && now < Date.parse(m.available_from)) return { open: false, label: `Opens ${fmtDateTime(m.available_from)}` };
  if (m.available_until && now > Date.parse(m.available_until)) return { open: false, label: `Closed ${fmtDateTime(m.available_until)}` };
  return { open: true, label: m.available_until ? `Open until ${fmtDateTime(m.available_until)}` : 'Available now' };
}

// Subject-wise / topic-wise breakdown from attempt question rows ({subject_id, topic_id, chosen_option, is_correct}).
export function breakdown(rows, key, names = {}) {
  const map = {};
  for (const r of rows) {
    const k = r[key]; if (!k) continue;
    const s = (map[k] ||= { id: k, name: names[k] || r[key === 'subject_id' ? 'subject' : 'topic'] || 'Other', total: 0, attempted: 0, correct: 0, incorrect: 0 });
    s.total++;
    if (r.chosen_option) { s.attempted++; if (r.is_correct) s.correct++; else s.incorrect++; }
  }
  return Object.values(map).map((s) => ({ ...s, accuracy: pct(s.correct, s.attempted), scorePct: pct(s.correct, s.total) }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

// Data for the "My Mock Tests" and "My Performance" pages (signed-in student only, enforced by RLS).
export async function getMyMockData(userId) {
  const [cat, attempts] = await Promise.all([getMockCatalog(), backend.myMockAttempts(userId)]);
  const submitted = attempts.filter((a) => a.status === 'submitted');
  const rows = await backend.myMockAnswers(submitted.map((a) => a.id));
  const topics = await backend.topicsByIds([...new Set(rows.map((r) => r.topic_id).filter(Boolean))]);
  const topicNames = Object.fromEntries(topics.map((t) => [t.id, t.name]));
  const subjectNames = Object.fromEntries(Object.values(cat.subjectById).map((s) => [s.id, s.name]));
  const mockById = Object.fromEntries(cat.mocks.map((m) => [m.id, m]));
  const totals = submitted.reduce((t, a) => ({ c: t.c + a.correct, att: t.att + a.correct + a.incorrect }), { c: 0, att: 0 });
  const byMock = {};
  for (const a of submitted) {
    const b = (byMock[a.mock_id] ||= { mock_id: a.mock_id, attempts: [] });
    b.attempts.push(a);
  }
  const perMock = Object.values(byMock).map((b) => {
    const sorted = [...b.attempts].sort((x, y) => String(y.submitted_at).localeCompare(String(x.submitted_at)));
    return { ...b, mock: mockById[b.mock_id], latest: sorted[0], best: [...b.attempts].sort((x, y) => Number(y.score) - Number(x.score))[0] };
  });
  return {
    catalog: cat, attempts, submitted, inProgress: attempts.filter((a) => a.status === 'in_progress' && Date.parse(a.expires_at) > Date.now()),
    mockById, perMock,
    best: submitted.length ? submitted.reduce((b, a) => (pct(Number(a.score), Number(a.max_score)) > pct(Number(b.score), Number(b.max_score)) ? a : b)) : null,
    latest: submitted[0] || null,
    accuracy: pct(totals.c, totals.att),
    subjects: breakdown(rows, 'subject_id', subjectNames),
    topics: breakdown(rows, 'topic_id', topicNames),
    rows,
  };
}
