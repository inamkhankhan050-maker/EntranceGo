import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Plus, Pencil, Trash2, X, ExternalLink, Eye } from 'lucide-react';
import { admin, backend, CATEGORY_LABELS } from '../lib/api.js';
import { useAsync, useToast } from '../lib/hooks.js';
import { slugify, isSlug, cap } from '../lib/text.js';
import { breakdown, fmtMarks, pct, fmtDateTime } from '../lib/mocks.js';
import { AdminHead, Field, StatusBadge } from './common.jsx';
import { Modal, Confirm } from '../components/Modal.jsx';
import { Loading, ErrorState, Empty } from '../components/States.jsx';

const DIFFS = ['easy', 'medium', 'hard'];
// Pool counts per subject for a course: { [subject_id]: { total, easy, medium, hard } } (published questions only).
async function poolFor(course_id) {
  if (!course_id) return {};
  const rows = await backend.coursePoolCounts(course_id);
  const out = {};
  rows.forEach((r) => { const s = (out[r.subject_id] ||= { total: 0, easy: 0, medium: 0, hard: 0 }); s[r.difficulty] = Number(r.n); s.total += Number(r.n); });
  return out;
}

// ---------------------------------------------------------------- courses + their question banks
export function CoursesAdmin() {
  const toast = useToast();
  const { data, loading, error, reload } = useAsync(async () => {
    const [courses, mocks, l, links] = await Promise.all([admin.select('courses'), admin.select('mock_tests'), admin.lookups(), admin.select('course_subjects').then((r) => ({ rows: r, ok: true }), () => ({ rows: [], ok: false }))]);
    const pools = Object.fromEntries(await Promise.all(courses.map(async (c) => [c.id, await poolFor(c.id)])));
    return { courses, mocks, pools, courseSubjects: links.rows, has008: links.ok, ...l };
  }, []);
  const [edit, setEdit] = useState(null);
  const [bank, setBank] = useState(null);
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(false);
  const name = (id) => data?.subjects.find((s) => s.id === id)?.name || 'Unknown';
  const blank = { name: '', slug: '', description: '', status: 'published', category_id: '', subject_ids: [] };
  const catName = (id) => { const k = data?.categories.find((x) => x.id === id); return k ? CATEGORY_LABELS[k.slug] || k.name : '—'; };
  const openEdit = (c) => setEdit({ ...c, description: c.description || '', category_id: c.category_id || '', subject_ids: data.courseSubjects.filter((x) => x.course_id === c.id).sort((a, b) => a.position - b.position).map((x) => x.subject_id) });

  return (
    <>
      <AdminHead title="Courses" sub="Category > Course > Subjects. A course (e.g. BA Political Science) sits inside a category (e.g. JMI ENTRANCE EXAM) and has its own subjects. Questions of those subjects are added to the course automatically, so mock tests can use them.">
        <button className="btn btn-primary" onClick={() => setEdit(blank)}><Plus size={17} /> New course</button>
      </AdminHead>
      {data && !data.has008 && <div className="notice">To put courses inside categories, run <code>supabase/migrations/008_course_catalog.sql</code> in Supabase SQL Editor once, then reload.</div>}
      {loading ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : !data.courses.length ? (
        <Empty title="No courses yet" action={<button className="btn btn-primary" onClick={() => setEdit(blank)}>Create a course</button>}>Create a course such as “BA Political Science”, choose its category and subjects.</Empty>
      ) : (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Course</th><th>Category</th><th>Published questions by subject</th><th>Mocks</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{data.courses.map((c) => {
            const p = data.pools[c.id] || {};
            return (
              <tr key={c.id}>
                <td><strong>{c.name}</strong><div className="muted small mono">/courses/{c.slug}</div></td>
                <td className="small">{catName(c.category_id)}</td>
                <td className="small">{Object.keys(p).length ? Object.entries(p).map(([sid, v]) => `${name(sid)} ${v.total}`).join(' · ') : <span className="muted">No questions linked</span>}</td>
                <td>{data.mocks.filter((m) => m.course_id === c.id).length}</td>
                <td><StatusBadge s={c.status} /></td>
                <td className="row-actions">
                  <button className="btn btn-outline btn-sm" onClick={() => setBank(c)}>Question bank</button>
                  <button className="icon-btn" aria-label={`Edit ${c.name}`} onClick={() => openEdit(c)}><Pencil size={16} /></button>
                  <button className="icon-btn danger" aria-label={`Delete ${c.name}`} onClick={() => setDel(c)}><Trash2 size={16} /></button>
                </td>
              </tr>);
          })}</tbody>
        </table></div>
      )}
      {edit && <CourseForm course={edit} courses={data.courses} lookups={data} has008={data.has008} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
      {bank && <CourseBank course={bank} lookups={data} onClose={() => { setBank(null); reload(); }} />}
      {del && (
        <Confirm title={`Delete “${del.name}”?`} busy={busy} onClose={() => setDel(null)} onConfirm={async () => {
          setBusy(true); try { await admin.remove('courses', del.id); toast('Course deleted.'); setDel(null); reload(); } catch (e) { toast(e.message, 'error'); } setBusy(false);
        }}><p>Only possible when the course has no mock tests. Its question links are removed; the questions stay in the bank.</p></Confirm>
      )}
    </>
  );
}

function CourseForm({ course, courses, lookups, has008, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState(course);
  const [touched, setTouched] = useState(!!course.id);
  const [busy, setBusy] = useState(false);
  const err = !f.name.trim() ? 'Name is required.' : !isSlug(f.slug) ? 'Slug: lowercase letters, numbers and hyphens.' : courses.some((c) => c.slug === f.slug && c.id !== f.id) ? 'Slug already used.' : null;
  const save = async () => {
    if (err) { toast(err, 'error'); return; }
    setBusy(true);
    try {
      const row = { name: f.name.trim(), slug: f.slug, description: f.description.trim() || null, status: f.status, ...(has008 ? { category_id: f.category_id || null } : {}) };
      const saved = f.id ? await admin.update('courses', f.id, row) : await admin.insert('courses', row);
      const cid = f.id || saved?.id || (Array.isArray(saved) ? saved[0]?.id : null);
      if (has008 && cid) await admin.replaceLinks('course_subjects', 'course_id', cid, f.subject_ids.map((subject_id, position) => ({ course_id: cid, subject_id, position })));
      toast('Course saved.'); onSaved();
    } catch (e) { toast(e.message, 'error'); setBusy(false); }
  };
  return (
    <Modal title={f.id ? 'Edit course' : 'New course'} onClose={onClose}>
      <Field label="Name" required><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value, ...(touched ? {} : { slug: slugify(e.target.value) }) })} /></Field>
      <Field label="Slug" required><input className="input mono" value={f.slug} onChange={(e) => { setTouched(true); setF({ ...f, slug: e.target.value.toLowerCase() }); }} /></Field>
      {has008 && (<>
        <Field label="Category" hint="The home page shows this course inside this category."><select className="input" value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value })}>
          <option value="">None</option>{lookups.categories.filter((k) => k.slug !== 'computer-programming').map((k) => <option key={k.id} value={k.id}>{CATEGORY_LABELS[k.slug] || k.name}</option>)}</select></Field>
        <Field label="Subjects in this course" hint="All questions of the ticked subjects are added to this course's question bank, now and in future.">
          <div className="check-grid">{lookups.subjects.filter((s) => s.status !== 'archived').map((s) => (
            <label key={s.id} className="check small"><input type="checkbox" checked={f.subject_ids.includes(s.id)} onChange={(e) => setF({ ...f, subject_ids: e.target.checked ? [...f.subject_ids, s.id] : f.subject_ids.filter((x) => x !== s.id) })} /> <span>{s.name}</span></label>
          ))}</div>
        </Field>
      </>)}
      <Field label="Description"><textarea className="input" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      <Field label="Status"><select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></Field>
      {err && <p className="err-text small">{err}</p>}
      <div className="action-row"><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></div>
    </Modal>
  );
}

// Link / unlink questions to a course in bulk, by subject (+ optional topic, difficulty, exam).
function CourseBank({ course, lookups, onClose }) {
  const toast = useToast();
  const { data, loading, error, reload } = useAsync(async () => {
    const [links, questions] = await Promise.all([backend.adminCourseLinks(course.id), admin.select('questions')]);
    return { linked: new Set(links.map((x) => x.question_id)), questions };
  }, [course.id]);
  const [flt, setFlt] = useState({ subject: '', topic: '', difficulty: '', exam: '' });
  const [busy, setBusy] = useState(false);
  const match = useMemo(() => (data?.questions || []).filter((q) => (!flt.subject || q.subject_id === flt.subject) && (!flt.topic || q.topic_id === flt.topic)
    && (!flt.difficulty || q.difficulty === flt.difficulty) && (!flt.exam || q.exam_id === flt.exam)), [data, flt]);
  const bySubject = useMemo(() => {
    const m = {}; (data?.questions || []).forEach((q) => { if (data.linked.has(q.id)) { const s = (m[q.subject_id] ||= { total: 0, published: 0 }); s.total++; if (q.status === 'published') s.published++; } }); return m;
  }, [data]);
  const run = async (add) => {
    const ids = match.filter((q) => (add ? !data.linked.has(q.id) : data.linked.has(q.id))).map((q) => q.id);
    if (!ids.length) { toast(add ? 'All matching questions are already in this course.' : 'None of the matching questions are in this course.'); return; }
    setBusy(true);
    try { if (add) await backend.adminLinkQuestions(course.id, ids); else await backend.adminUnlinkQuestions(course.id, ids); toast(`${ids.length} question(s) ${add ? 'added to' : 'removed from'} ${course.name}.`); reload(); }
    catch (e) { toast(e.message, 'error'); }
    setBusy(false);
  };
  const sname = (id) => lookups.subjects.find((s) => s.id === id)?.name;
  return (
    <Modal title={`Question bank: ${course.name}`} onClose={onClose} wide>
      {loading ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : (<>
        <h3 className="h4">Linked now</h3>
        {!Object.keys(bySubject).length ? <p className="muted small">No questions linked yet.</p> : (
          <div className="table-wrap"><table className="table"><thead><tr><th>Subject</th><th>Linked</th><th>Published (usable in mocks)</th></tr></thead>
            <tbody>{Object.entries(bySubject).map(([sid, v]) => <tr key={sid}><td>{sname(sid)}</td><td>{v.total}</td><td>{v.published}</td></tr>)}</tbody></table></div>)}
        <h3 className="h4">Add or remove in bulk</h3>
        <div className="filters wrap">
          <select className="input" value={flt.subject} onChange={(e) => setFlt({ ...flt, subject: e.target.value, topic: '' })} aria-label="Subject"><option value="">Choose subject…</option>{lookups.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <select className="input" value={flt.topic} disabled={!flt.subject} onChange={(e) => setFlt({ ...flt, topic: e.target.value })} aria-label="Topic"><option value="">All topics</option>{lookups.topics.filter((t) => t.subject_id === flt.subject).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          <select className="input" value={flt.difficulty} onChange={(e) => setFlt({ ...flt, difficulty: e.target.value })} aria-label="Difficulty"><option value="">Any difficulty</option>{DIFFS.map((d) => <option key={d} value={d}>{cap(d)}</option>)}</select>
          <select className="input" value={flt.exam} onChange={(e) => setFlt({ ...flt, exam: e.target.value })} aria-label="Exam tag"><option value="">Any exam tag</option>{lookups.exams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        </div>
        <p className="small">{flt.subject ? <>{match.length} question(s) match; {match.filter((q) => data.linked.has(q.id)).length} already linked.</> : 'Choose a subject first.'}</p>
        <div className="action-row">
          <button className="btn btn-primary" disabled={busy || !flt.subject} onClick={() => run(true)}><Plus size={16} /> Add matching to course</button>
          <button className="btn btn-outline" disabled={busy || !flt.subject} onClick={() => run(false)}><X size={16} /> Remove matching</button>
        </div>
        <p className="muted small">Tip: in Bulk import you can also add imported questions straight to a course.</p>
      </>)}
    </Modal>
  );
}

// ---------------------------------------------------------------- mock tests
export function MocksAdmin() {
  const toast = useToast();
  const nav = useNavigate();
  const { data, loading, error, reload } = useAsync(async () => {
    const [mocks, sections, courses, attempts] = await Promise.all([admin.select('mock_tests'), admin.select('mock_test_sections'), admin.select('courses'), backend.adminMockAttempts()]);
    return { mocks, sections, courses, attempts };
  }, []);
  const [del, setDel] = useState(null); const [busy, setBusy] = useState(false);
  return (
    <>
      <AdminHead title="Mock tests" sub="Default selection: unattempted questions first; earlier questions are reused only when a subject's pool runs out.">
        <Link className="btn btn-outline" to="/admin/courses">Courses</Link>
        <Link className="btn btn-primary" to="/admin/mocks/new"><Plus size={17} /> New mock test</Link>
      </AdminHead>
      {loading ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : !data.mocks.length ? (
        <Empty title="No mock tests yet" action={<Link className="btn btn-primary" to="/admin/mocks/new">Create a mock test</Link>} />
      ) : (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Mock test</th><th>Course</th><th>Questions</th><th>Time</th><th>Marking</th><th>Attempts</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{data.mocks.map((m) => (
            <tr key={m.id}>
              <td><strong>{m.title}</strong><div className="muted small mono">/mock-tests/{m.slug}</div></td>
              <td>{data.courses.find((c) => c.id === m.course_id)?.name}</td>
              <td>{m.total_questions} <span className="muted small">({data.sections.filter((s) => s.mock_id === m.id).length} sections)</span></td>
              <td>{m.duration_minutes} min</td>
              <td className="small">+{fmtMarks(m.marks_per_question)} / −{fmtMarks(m.negative_marks)}</td>
              <td><Link to={`/admin/mock-attempts?mock=${m.id}`}>{data.attempts.filter((a) => a.mock_id === m.id).length}</Link></td>
              <td><StatusBadge s={m.status} /></td>
              <td className="row-actions">
                <button className="icon-btn" aria-label={`Edit ${m.title}`} onClick={() => nav(`/admin/mocks/${m.id}`)}><Pencil size={16} /></button>
                <a className="icon-btn" aria-label="View on site" href={`${import.meta.env.BASE_URL}mock-tests/${m.slug}`} target="_blank" rel="noreferrer"><ExternalLink size={16} /></a>
                <button className="icon-btn danger" aria-label={`Delete ${m.title}`} onClick={() => setDel(m)}><Trash2 size={16} /></button>
              </td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      {del && (
        <Confirm title={`Delete “${del.title}”?`} busy={busy} onClose={() => setDel(null)} onConfirm={async () => {
          setBusy(true); try { await admin.remove('mock_tests', del.id); toast('Mock deleted.'); setDel(null); reload(); } catch (e) { toast(e.message, 'error'); } setBusy(false);
        }}><p>This also deletes every student attempt and result for this mock. To keep results, set it to Archived instead.</p></Confirm>
      )}
    </>
  );
}

const toLocal = (iso) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');
const fromLocal = (v) => (v ? new Date(v).toISOString() : null);

export function MockForm() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { data, loading, error, reload } = useAsync(async () => {
    const [mocks, sections, courses, l, questions] = await Promise.all([admin.select('mock_tests'), admin.select('mock_test_sections'), admin.select('courses'), admin.lookups(), admin.select('questions')]);
    return { mocks, sections, courses, questions, ...l };
  }, [id]);
  const [linking, setLinking] = useState('');
  const [f, setF] = useState(null);
  const [secs, setSecs] = useState([]);
  const [pool, setPool] = useState({});
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [slugTouched, setSlugTouched] = useState(!!id);
  const busyRef = useRef(false);
  const draftKey = `eg-mock-draft:${id || 'new'}`;
  const [restored, setRestored] = useState(false);
  const initRef = useRef(null);
  const discardDraft = () => { localStorage.removeItem(draftKey); setRestored(false); reload(); };

  useEffect(() => {
    if (!data) return;
    const m = id && data.mocks.find((x) => x.id === id);
    setF(m ? { ...m, description: m.description || '', instructions: m.instructions || '', max_attempts: m.max_attempts ?? '', available_from: toLocal(m.available_from), available_until: toLocal(m.available_until), useDiff: m.pct_easy != null, pct_easy: m.pct_easy ?? 40, pct_medium: m.pct_medium ?? 40, pct_hard: m.pct_hard ?? 20 }
      : { title: '', slug: '', course_id: data.courses[0]?.id || '', description: '', instructions: '', duration_minutes: 60, marks_per_question: 1, negative_marks: 0, max_attempts: '', available_from: '', available_until: '', prefer_unattempted: true, status: 'draft', useDiff: false, pct_easy: 40, pct_medium: 40, pct_hard: 20 });
    setSecs(m ? data.sections.filter((s) => s.mock_id === id).sort((a, b) => a.position - b.position).map((s) => ({ subject_id: s.subject_id, question_count: s.question_count })) : []);
    initRef.current = null;
    // Restore an unsaved draft left by navigating away before saving.
    try { const d = JSON.parse(localStorage.getItem(draftKey) || 'null'); if (d?.f) { setF((x) => ({ ...x, ...d.f })); setSecs(d.secs || []); setSlugTouched(!!d.slugTouched); setRestored(true); } } catch { /* ignore a bad draft */ }
  }, [data, id]);
  // Keep the draft on every change, so nothing typed is lost.
  useEffect(() => {
    if (!f) return;
    const snap = JSON.stringify({ f, secs, slugTouched });
    if (initRef.current === null) { initRef.current = restored ? '' : snap; return; } // first render is the baseline, not an edit
    try { if (snap === initRef.current) localStorage.removeItem(draftKey); else localStorage.setItem(draftKey, snap); } catch { /* storage full or blocked */ }
  }, [f, secs, slugTouched]);
  const loadPool = () => { if (f?.course_id) poolFor(f.course_id).then(setPool).catch(() => setPool({})); };
  useEffect(loadPool, [f?.course_id]);
  // Refresh pool counts when the tab regains focus (questions may have been linked elsewhere).
  useEffect(() => { const h = () => { if (document.visibilityState === 'visible') loadPool(); }; document.addEventListener('visibilitychange', h); window.addEventListener('focus', h); return () => { document.removeEventListener('visibilitychange', h); window.removeEventListener('focus', h); }; });

  if (loading || (!f && !error)) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data.courses.length) return <Empty title="Create a course first" action={<Link className="btn btn-primary" to="/admin/courses">Go to courses</Link>}>Every mock belongs to a course and uses only that course's questions.</Empty>;
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const total = secs.reduce((n, s) => n + (Number(s.question_count) || 0), 0);
  const short = secs.filter((s) => (pool[s.subject_id]?.total || 0) < Number(s.question_count));
  const sname = (sid) => data.subjects.find((s) => s.id === sid)?.name || '?';
  const subjPublished = (sid) => data.questions.filter((q) => q.subject_id === sid && q.status === 'published');
  const linkAll = async (sid) => {
    const ids = data.questions.filter((q) => q.subject_id === sid).map((q) => q.id);
    if (!ids.length) { toast(`${sname(sid)} has no questions yet. Import them first.`, 'error'); return; }
    setLinking(sid);
    try { await backend.adminLinkQuestions(f.course_id, ids); toast(`${ids.length} ${sname(sid)} question(s) added to this course.`); loadPool(); }
    catch (err) { toast(err.message, 'error'); }
    setLinking('');
  };

  const save = async () => {
    if (busyRef.current) return;
    const e = {};
    if (!f.title.trim()) e.title = 'Title is required.';
    if (!isSlug(f.slug)) e.slug = 'Use lowercase letters, numbers and hyphens.';
    else if (data.mocks.some((m) => m.slug === f.slug && m.id !== id)) e.slug = 'Another mock already uses this slug.';
    if (!f.course_id) e.course_id = 'Choose a course.';
    const dur = Number(f.duration_minutes); if (!Number.isInteger(dur) || dur < 1 || dur > 600) e.duration_minutes = '1 to 600 minutes.';
    const mpq = Number(f.marks_per_question); if (!(mpq > 0)) e.marks_per_question = 'Must be more than 0.';
    const neg = Number(f.negative_marks); if (!(neg >= 0)) e.negative_marks = '0 or more.';
    const ma = f.max_attempts === '' ? null : Number(f.max_attempts); if (ma !== null && (!Number.isInteger(ma) || ma < 1)) e.max_attempts = 'Whole number, or blank for unlimited.';
    if (f.useDiff && Number(f.pct_easy) + Number(f.pct_medium) + Number(f.pct_hard) !== 100) e.diff = 'Easy + medium + hard must add up to 100%.';
    if (f.available_from && f.available_until && f.available_from >= f.available_until) e.avail = '“Available until” must be after “available from”.';
    if (secs.some((s) => !s.subject_id || !(Number(s.question_count) >= 1))) e.secs = 'Every section needs a subject and at least 1 question.';
    if (new Set(secs.map((s) => s.subject_id)).size !== secs.length) e.secs = 'Each subject can appear only once.';
    if (f.status === 'published' && !secs.length) e.secs = 'Add at least one section before publishing.';
    if (f.status === 'published' && short.length) e.secs = `Not enough published questions in this course for: ${short.map((s) => sname(s.subject_id)).join(', ')}. Link more questions or lower the counts.`;
    setErrors(e); if (Object.keys(e).length) { toast('Please fix the highlighted fields.', 'error'); return; }
    busyRef.current = true; setBusy(true);
    try {
      const row = {
        course_id: f.course_id, title: f.title.trim(), slug: f.slug, description: f.description.trim() || null, instructions: f.instructions.trim() || null,
        total_questions: total, duration_minutes: dur, marks_per_question: mpq, negative_marks: neg, max_attempts: ma,
        pct_easy: f.useDiff ? Number(f.pct_easy) : null, pct_medium: f.useDiff ? Number(f.pct_medium) : null, pct_hard: f.useDiff ? Number(f.pct_hard) : null,
        available_from: fromLocal(f.available_from), available_until: fromLocal(f.available_until), prefer_unattempted: !!f.prefer_unattempted, status: f.status,
      };
      const saved = id ? await admin.update('mock_tests', id, row) : await admin.insert('mock_tests', row);
      await admin.replaceLinks('mock_test_sections', 'mock_id', saved.id, secs.map((s, i) => ({ mock_id: saved.id, subject_id: s.subject_id, question_count: Number(s.question_count), position: i })));
      localStorage.removeItem(draftKey); toast('Mock test saved.'); nav('/admin/mocks');
    } catch (err) { toast(err.message, 'error'); }
    busyRef.current = false; setBusy(false);
  };

  return (
    <>
      <AdminHead title={id ? 'Edit mock test' : 'New mock test'}>
        <Link className="btn btn-ghost" to="/admin/mocks">Back</Link>
        <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save mock'}</button>
      </AdminHead>
      {restored && <div className="notice">Your unsaved changes were restored. <button className="link-btn" onClick={discardDraft}>Discard them</button></div>}
      <div className="card form-card">
        <div className="form-row">
          <Field label="Title" required error={errors.title}><input className="input" value={f.title} onChange={(e) => set({ title: e.target.value, ...(slugTouched ? {} : { slug: slugify(e.target.value) }) })} /></Field>
          <Field label="URL slug" required error={errors.slug} hint="/mock-tests/your-slug"><input className="input mono" value={f.slug} onChange={(e) => { setSlugTouched(true); set({ slug: e.target.value.toLowerCase() }); }} /></Field>
        </div>
        <div className="form-row">
          <Field label="Course" required error={errors.course_id} hint="Questions come only from this course's question bank."><select className="input" value={f.course_id} onChange={(e) => set({ course_id: e.target.value })}>{data.courses.map((c) => <option key={c.id} value={c.id}>{c.name}{c.status !== 'published' ? ` (${c.status})` : ''}</option>)}</select></Field>
          <Field label="Status"><select className="input" value={f.status} onChange={(e) => set({ status: e.target.value })}><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></Field>
        </div>
        <Field label="Description (shown to everyone)"><textarea className="input" rows={2} value={f.description} onChange={(e) => set({ description: e.target.value })} /></Field>
        <Field label="Instructions (shown before starting)"><textarea className="input" rows={2} value={f.instructions} onChange={(e) => set({ instructions: e.target.value })} /></Field>
        <div className="form-row four">
          <Field label="Duration (minutes)" required error={errors.duration_minutes}><input className="input" type="number" min="1" max="600" value={f.duration_minutes} onChange={(e) => set({ duration_minutes: e.target.value })} /></Field>
          <Field label="Marks per question" required error={errors.marks_per_question}><input className="input" type="number" step="0.25" min="0.25" value={f.marks_per_question} onChange={(e) => set({ marks_per_question: e.target.value })} /></Field>
          <Field label="Negative marks per wrong" error={errors.negative_marks} hint="0 = no negative marking"><input className="input" type="number" step="0.01" min="0" value={f.negative_marks} onChange={(e) => set({ negative_marks: e.target.value })} /></Field>
          <Field label="Maximum attempts" error={errors.max_attempts} hint="Blank = unlimited"><input className="input" type="number" min="1" value={f.max_attempts} onChange={(e) => set({ max_attempts: e.target.value })} /></Field>
        </div>
        <div className="form-row">
          <Field label="Available from" hint="Blank = immediately"><input className="input" type="datetime-local" value={f.available_from} onChange={(e) => set({ available_from: e.target.value })} /></Field>
          <Field label="Available until" error={errors.avail} hint="Blank = no end date"><input className="input" type="datetime-local" value={f.available_until} onChange={(e) => set({ available_until: e.target.value })} /></Field>
        </div>
        <label className="check"><input type="checkbox" checked={f.prefer_unattempted} onChange={(e) => set({ prefer_unattempted: e.target.checked })} />
          <span><strong>Prefer unattempted questions</strong> (recommended default)<span className="muted small">Each student gets questions they haven't answered before; earlier ones are reused only when a subject runs out. Turning this off picks randomly. Course eligibility and no duplicates inside a test always apply.</span></span></label>
        <label className="check"><input type="checkbox" checked={f.useDiff} onChange={(e) => set({ useDiff: e.target.checked })} /><span><strong>Difficulty distribution</strong><span className="muted small">Applied inside each subject, after the unattempted-first rule.</span></span></label>
        {f.useDiff && (
          <div className="form-row four">
            {DIFFS.map((d) => <Field key={d} label={`${cap(d)} %`}><input className="input" type="number" min="0" max="100" value={f['pct_' + d]} onChange={(e) => set({ ['pct_' + d]: e.target.value })} /></Field>)}
            <div className="small muted" style={{ alignSelf: 'end' }}>Total {Number(f.pct_easy) + Number(f.pct_medium) + Number(f.pct_hard)}%</div>
          </div>
        )}
        {errors.diff && <p className="err-text small">{errors.diff}</p>}
      </div>

      <div className="card form-card">
        <div className="section-head"><h2>Sections</h2><strong>Total: {total} questions · {fmtMarks(total * Number(f.marks_per_question || 0))} marks</strong></div>
        {errors.secs && <p className="err-text">{errors.secs}</p>}
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Subject</th><th>Questions in this mock</th><th>Published in course bank</th><th><span className="sr-only">Remove</span></th></tr></thead>
          <tbody>{secs.map((s, i) => {
            const p = pool[s.subject_id];
            return (
              <tr key={i}>
                <td><select className="input" value={s.subject_id} onChange={(e) => setSecs(secs.map((x, j) => (j === i ? { ...x, subject_id: e.target.value } : x)))} aria-label="Subject">
                  <option value="">Choose…</option>{data.subjects.map((x) => <option key={x.id} value={x.id} disabled={secs.some((y, j) => j !== i && y.subject_id === x.id)}>{x.name}</option>)}</select></td>
                <td><input className="input" type="number" min="1" max="500" value={s.question_count} onChange={(e) => setSecs(secs.map((x, j) => (j === i ? { ...x, question_count: e.target.value } : x)))} aria-label="Question count" /></td>
                <td className={(p?.total || 0) < Number(s.question_count) ? 'err-text small' : 'small'}>
                  {p ? `${p.total} (E ${p.easy} · M ${p.medium} · H ${p.hard})` : s.subject_id ? '0 in this course' : ''}
                  {s.subject_id && (p?.total || 0) < subjPublished(s.subject_id).length && (
                    <div><button type="button" className="btn btn-outline btn-sm" disabled={linking === s.subject_id} onClick={() => linkAll(s.subject_id)}>
                      {linking === s.subject_id ? 'Adding…' : `Add all ${subjPublished(s.subject_id).length} ${sname(s.subject_id)} questions to this course`}</button></div>)}
                  {s.subject_id && !subjPublished(s.subject_id).length && <> · <Link to="/admin/import" target="_blank" rel="noopener">Import {sname(s.subject_id)} questions</Link></>}
                </td>
                <td><button className="icon-btn danger" aria-label="Remove section" onClick={() => setSecs(secs.filter((_, j) => j !== i))}><X size={16} /></button></td>
              </tr>);
          })}</tbody>
        </table></div>
        <button className="btn btn-outline btn-sm" onClick={() => setSecs([...secs, { subject_id: '', question_count: 10 }])}><Plus size={15} /> Add subject section</button>
        <p className="muted small"><button className="link-btn" onClick={loadPool}>Refresh counts</button> · The total is the sum of the sections. A student can start the mock only if every section can be filled from the course's published questions.</p>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- attempts & statistics
export function MockAttemptsAdmin() {
  const { data, loading, error, reload } = useAsync(async () => {
    const [attempts, mocks, profiles, subjects] = await Promise.all([backend.adminMockAttempts(), admin.select('mock_tests'), admin.select('student_profiles'), admin.select('subjects')]);
    const rows = await backend.myMockAnswers(attempts.filter((a) => a.status === 'submitted').map((a) => a.id));
    return { attempts, mocks, profiles, subjects, rows };
  }, []);
  const [mock, setMock] = useState(() => new URLSearchParams(window.location.search).get('mock') || '');
  const [q, setQ] = useState('');
  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const prof = Object.fromEntries(data.profiles.map((p) => [p.user_id, p]));
  const mname = (id) => data.mocks.find((m) => m.id === id)?.title || 'Mock';
  const list = data.attempts.filter((a) => (!mock || a.mock_id === mock) && (!q || `${prof[a.user_id]?.full_name || ''} ${prof[a.user_id]?.email || ''}`.toLowerCase().includes(q.toLowerCase())));
  const done = list.filter((a) => a.status === 'submitted');
  const ids = new Set(done.map((a) => a.id));
  const subj = breakdown(data.rows.filter((r) => ids.has(r.attempt_id)), 'subject_id', Object.fromEntries(data.subjects.map((s) => [s.id, s.name])));
  const avg = done.length ? Math.round((done.reduce((n, a) => n + pct(Number(a.score), Number(a.max_score)), 0) / done.length) * 10) / 10 : 0;
  const acc = pct(done.reduce((n, a) => n + a.correct, 0), done.reduce((n, a) => n + a.correct + a.incorrect, 0));
  return (
    <>
      <AdminHead title="Mock attempts" sub="Every student's real attempts. Click View to open the full result." />
      <div className="filters wrap">
        <select className="input" value={mock} onChange={(e) => setMock(e.target.value)} aria-label="Mock"><option value="">All mock tests</option>{data.mocks.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}</select>
        <input className="input grow" placeholder="Search student name or email…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search students" />
      </div>
      <div className="stat-row">
        <div className="stat"><strong>{list.length}</strong><span>Attempts</span></div>
        <div className="stat"><strong>{new Set(list.map((a) => a.user_id)).size}</strong><span>Students</span></div>
        <div className="stat"><strong>{done.length ? `${avg}%` : '–'}</strong><span>Average score</span></div>
        <div className="stat"><strong>{done.length ? `${Math.max(...done.map((a) => pct(Number(a.score), Number(a.max_score))))}%` : '–'}</strong><span>Best score</span></div>
        <div className="stat"><strong>{done.length ? `${acc}%` : '–'}</strong><span>Average accuracy</span></div>
      </div>
      {subj.length > 0 && (
        <div className="table-wrap"><table className="table"><thead><tr><th>Subject</th><th>Questions served</th><th>Attempted</th><th>Accuracy</th></tr></thead>
          <tbody>{subj.map((s) => <tr key={s.id}><td>{s.name}</td><td>{s.total}</td><td>{s.attempted}</td><td>{s.accuracy}%</td></tr>)}</tbody></table></div>
      )}
      {!list.length ? <Empty title="No attempts yet" /> : (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Student</th><th>Mock test</th><th>#</th><th>Status</th><th>Score</th><th>C / W / S</th><th>Reused</th><th>Date</th><th><span className="sr-only">Open</span></th></tr></thead>
          <tbody>{list.map((a) => (
            <tr key={a.id}>
              <td>{prof[a.user_id]?.full_name || '—'}<div className="muted small">{prof[a.user_id]?.email}</div></td>
              <td>{mname(a.mock_id)}</td><td>{a.attempt_no}</td>
              <td>{a.status === 'submitted' ? 'Submitted' : Date.parse(a.expires_at) < Date.now() ? 'Timed out' : 'In progress'}</td>
              <td>{a.status === 'submitted' ? `${fmtMarks(a.score)}/${fmtMarks(a.max_score)}` : '–'}</td>
              <td>{a.status === 'submitted' ? `${a.correct}/${a.incorrect}/${a.unanswered}` : '–'}</td>
              <td>{a.reused_count}</td><td className="small">{fmtDateTime(a.submitted_at || a.started_at)}</td>
              <td>{a.status === 'submitted' && <Link className="btn btn-ghost btn-sm" to={`/mock/result/${a.id}`}><Eye size={14} /> View</Link>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </>
  );
}
