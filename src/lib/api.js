import { BACKEND } from './config.js';
import { normText } from './text.js';

// Backends load on demand, so each build ships only the one it uses.
let modPromise;
const load = () => (modPromise ||= BACKEND === 'supabase'
  ? import('./supabaseBackend.js').then((m) => m.supa)
  : import('./demoBackend.js').then((m) => m.demo));
export const backend = new Proxy({}, {
  get(_, key) {
    if (key === 'onAuthChange') return (cb) => { let off = () => {}, dead = false; load().then((b) => { if (!dead) off = b.onAuthChange(cb); }); return () => { dead = true; off(); }; };
    if (key === 'adminInsertMany' && BACKEND !== 'supabase') return undefined;
    return (...args) => load().then((b) => b[key](...args));
  },
});

// ---------------- public catalog (published content only) ----------------
let catalogPromise = null;
export function invalidateCatalog() { catalogPromise = null; }

export function getCatalog() {
  if (!catalogPromise) {
    catalogPromise = backend.loadCatalog().then((c) => {
      const sStat = Object.fromEntries(c.subject_stats.map((x) => [x.subject_id, x]));
      const tStat = Object.fromEntries(c.topic_stats.map((x) => [x.topic_id, x]));
      const eStat = Object.fromEntries(c.exam_stats.map((x) => [x.exam_id, x]));
      const subjects = c.subjects.map((s) => ({
        ...s,
        category_ids: c.subject_categories.filter((x) => x.subject_id === s.id).map((x) => x.category_id),
        topic_count: Number(sStat[s.id]?.topic_count || 0),
        question_count: Number(sStat[s.id]?.question_count || 0),
      }));
      const subjectById = Object.fromEntries(subjects.map((s) => [s.id, s]));
      const topics = c.topics.map((t) => ({ ...t, question_count: Number(tStat[t.id]?.question_count || 0), subject: subjectById[t.subject_id] }));
      const exams = c.exams.map((e) => ({ ...e, question_count: Number(eStat[e.id]?.question_count || 0) }));
      const examById = Object.fromEntries(exams.map((e) => [e.id, e]));
      const sets = c.sets.map((p) => {
        const links = c.set_questions.filter((x) => x.set_id === p.id).sort((a, b) => a.position - b.position);
        return { ...p, question_ids: links.map((x) => x.question_id), question_count: links.length, subject: subjectById[p.subject_id], exam: examById[p.exam_id] };
      });
      return { categories: c.categories, subjects, topics, exams, sets, subjectById, examById };
    }).catch((e) => { catalogPromise = null; throw e; });
  }
  return catalogPromise;
}

export async function getSubjectPage(slug) {
  const c = await getCatalog();
  const subject = c.subjects.find((s) => s.slug === slug);
  if (!subject) return null;
  return {
    subject,
    categories: c.categories.filter((k) => subject.category_ids.includes(k.id)),
    topics: c.topics.filter((t) => t.subject_id === subject.id),
    sets: c.sets.filter((p) => p.subject_id === subject.id && p.question_count > 0),
    related: c.subjects.filter((s) => s.id !== subject.id && s.category_ids.some((k) => subject.category_ids.includes(k))).slice(0, 8),
  };
}

export async function getTopicPage(subjectSlug, topicSlug) {
  const c = await getCatalog();
  const subject = c.subjects.find((s) => s.slug === subjectSlug);
  const topic = subject && c.topics.find((t) => t.subject_id === subject.id && t.slug === topicSlug);
  if (!topic) return null;
  const questions = await backend.fetchQuestions({ topic_id: topic.id });
  return { subject, topic, questions, siblings: c.topics.filter((t) => t.subject_id === subject.id && t.id !== topic.id) };
}

export async function getExamPage(slug) {
  const c = await getCatalog();
  const exam = c.exams.find((e) => e.slug === slug);
  if (!exam) return null;
  const questions = exam.question_count ? await backend.fetchQuestions({ exam_id: exam.id }) : [];
  const bySubject = {};
  questions.forEach((q) => { bySubject[q.subject_id] = (bySubject[q.subject_id] || 0) + 1; });
  return {
    exam, questions,
    subjects: Object.entries(bySubject).map(([id, n]) => ({ ...c.subjectById[id], exam_question_count: n })).filter((s) => s.slug),
    sets: c.sets.filter((p) => p.exam_id === exam.id && p.question_count > 0),
    related: c.exams.filter((e) => e.group_name === exam.group_name && e.id !== exam.id),
  };
}

export async function getSetPage(slug) {
  const c = await getCatalog();
  const set = c.sets.find((p) => p.slug === slug);
  return set || null;
}

// source: { type: 'set'|'topic'|'subject'|'exam', slug, subject? }
export async function getPracticeQuestions(source) {
  const c = await getCatalog();
  if (source.type === 'set') {
    const set = c.sets.find((p) => p.slug === source.slug);
    if (!set) return null;
    return { title: set.title, timeLimit: set.time_limit_minutes, questions: await backend.fetchQuestions({ ids: set.question_ids }), crumbs: [{ to: '/practice', label: 'Practice Sets' }, { to: `/practice/${set.slug}`, label: set.title }] };
  }
  if (source.type === 'topic') {
    const page = await getTopicPage(source.subject, source.slug);
    if (!page) return null;
    return { title: `${page.subject.name}: ${page.topic.name}`, questions: page.questions, crumbs: [{ to: '/subjects', label: 'Subjects' }, { to: `/subjects/${page.subject.slug}`, label: page.subject.name }, { to: `/subjects/${page.subject.slug}/${page.topic.slug}`, label: page.topic.name }] };
  }
  if (source.type === 'subject') {
    const subject = c.subjects.find((s) => s.slug === source.slug);
    if (!subject) return null;
    return { title: `${subject.name}: Mixed Practice`, questions: await backend.fetchQuestions({ subject_id: subject.id }), crumbs: [{ to: '/subjects', label: 'Subjects' }, { to: `/subjects/${subject.slug}`, label: subject.name }] };
  }
  if (source.type === 'exam') {
    const exam = c.exams.find((e) => e.slug === source.slug);
    if (!exam) return null;
    return { title: `${exam.name} Practice`, questions: await backend.fetchQuestions({ exam_id: exam.id }), crumbs: [{ to: '/exams', label: 'Exams' }, { to: `/exams/${exam.slug}`, label: exam.name }] };
  }
  return null;
}

export async function search(text) {
  const n = normText(text);
  if (n.length < 2) return { subjects: [], topics: [], exams: [], sets: [], questions: [] };
  const c = await getCatalog();
  const has = (s) => normText(s).includes(n);
  const questions = await backend.searchQuestions(text.trim(), 25);
  return {
    subjects: c.subjects.filter((s) => has(s.name) || has(s.description)),
    topics: c.topics.filter((t) => has(t.name)).slice(0, 30),
    exams: c.exams.filter((e) => has(e.name) || has(e.group_name)),
    sets: c.sets.filter((p) => p.question_count && (has(p.title) || has(p.description))),
    questions: questions.map((q) => ({ ...q, subject: c.subjectById[q.subject_id], topic: c.topics.find((t) => t.id === q.topic_id) })),
  };
}

export async function getRecentQuestions(n = 5) {
  const c = await getCatalog();
  const qs = await backend.recentQuestions(n);
  return qs.map((q) => ({ ...q, subject: c.subjectById[q.subject_id], topic: c.topics.find((t) => t.id === q.topic_id) }));
}

// ---------------- admin ----------------
export const admin = {
  async lookups() {
    const [categories, subjects, subject_categories, topics, exams] = await Promise.all(
      ['categories', 'subjects', 'subject_categories', 'topics', 'exams'].map((t) => backend.adminSelect(t)));
    return { categories, subjects, subject_categories, topics, exams };
  },
  async stats() {
    const [subjects, topics, questions, sets] = await Promise.all(['subjects', 'topics', 'questions', 'practice_sets'].map((t) => backend.adminSelect(t)));
    const recent = [
      ...questions.map((q) => ({ kind: 'Question', title: q.question, status: q.status, at: q.updated_at, to: `/admin/questions/${q.id}` })),
      ...subjects.map((s) => ({ kind: 'Subject', title: s.name, status: s.status, at: s.updated_at, to: '/admin/subjects' })),
      ...topics.map((t) => ({ kind: 'Topic', title: t.name, status: t.status, at: t.updated_at, to: '/admin/topics' })),
      ...sets.map((p) => ({ kind: 'Practice set', title: p.title, status: p.status, at: p.updated_at, to: '/admin/sets' })),
    ].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 8);
    return {
      subjects: subjects.length, topics: topics.length, questions: questions.length,
      published: questions.filter((q) => q.status === 'published').length,
      drafts: questions.filter((q) => q.status === 'draft').length,
      sets: sets.length, recent,
    };
  },
  async counts() {
    const qs = await backend.adminSelect('questions');
    const topics = await backend.adminSelect('topics');
    const bySubject = {}, byTopic = {}, topicsBySubject = {};
    qs.forEach((q) => { bySubject[q.subject_id] = (bySubject[q.subject_id] || 0) + 1; if (q.topic_id) byTopic[q.topic_id] = (byTopic[q.topic_id] || 0) + 1; });
    topics.forEach((t) => { topicsBySubject[t.subject_id] = (topicsBySubject[t.subject_id] || 0) + 1; });
    return { bySubject, byTopic, topicsBySubject };
  },
  select: (t) => backend.adminSelect(t),
  get: (t, id) => backend.adminGet(t, id),
  async insert(t, row) { const r = await backend.adminInsert(t, row); invalidateCatalog(); return r; },
  async update(t, id, patch) { const r = await backend.adminUpdate(t, id, patch); invalidateCatalog(); return r; },
  async remove(t, id) { const r = await backend.adminDelete(t, id); invalidateCatalog(); return r; },
  async replaceLinks(t, key, value, rows) { const r = await backend.replaceLinks(t, key, value, rows); invalidateCatalog(); return r; },
  queryQuestions: (f) => backend.adminQueryQuestions(f),
  // Insert in chunks; if a chunk fails, retry its rows one by one to report each error.
  async importQuestions(rows, onProgress) {
    const created = [], failed = [], ids = [];
    for (let i = 0; i < rows.length; i += 50) {
      const chunk = rows.slice(i, i + 50);
      try {
        if (!backend.adminInsertMany) throw new Error('row-by-row');
        const res = await backend.adminInsertMany('questions', chunk.map((r) => r.data)); // all-or-nothing per chunk
        created.push(...chunk.map((r) => r.rowNumber)); ids.push(...(res || []).map((x) => x.id));
      } catch {
        for (const r of chunk) {
          try { const row = await backend.adminInsert('questions', r.data); created.push(r.rowNumber); if (row?.id) ids.push(row.id); }
          catch (e) { failed.push({ rowNumber: r.rowNumber, error: e.message }); }
        }
      }
      onProgress?.(Math.min(rows.length, i + 50), rows.length);
    }
    invalidateCatalog();
    return { created, failed, ids };
  },
};
