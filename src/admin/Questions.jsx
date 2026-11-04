import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Plus, Pencil, Trash2, Copy, Eye, EyeOff, Download } from 'lucide-react';
import { admin } from '../lib/api.js';
import { useAsync, useToast } from '../lib/hooks.js';
import { OPTIONS, optKey, cap, fmtDate } from '../lib/text.js';
import { validateQuestion } from '../lib/validate.js';
import { questionsToCSV, downloadText } from '../lib/csv.js';
import { AdminHead, Field, StatusBadge } from './common.jsx';
import { Modal, Confirm } from '../components/Modal.jsx';
import { Loading, ErrorState, Empty } from '../components/States.jsx';
import { QuestionStudy } from '../components/QuestionView.jsx';

const PAGE = 20;

// =================================================================== LIST
export function QuestionsAdmin() {
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const nav = useNavigate();
  const f = Object.fromEntries(['search', 'subject', 'topic', 'exam', 'difficulty', 'status', 'page'].map((k) => [k, params.get(k) || '']));
  const page = Number(f.page) || 1;
  const setF = (k, v) => { const n = new URLSearchParams(params); v ? n.set(k, v) : n.delete(k); if (k !== 'page') n.delete('page'); if (k === 'subject') n.delete('topic'); setParams(n, { replace: true }); };
  const [searchText, setSearchText] = useState(f.search);
  useEffect(() => { const t = setTimeout(() => searchText !== f.search && setF('search', searchText.trim()), 350); return () => clearTimeout(t); }, [searchText]); // eslint-disable-line

  const lk = useAsync(() => admin.lookups(), []);
  const { data, loading, error, reload } = useAsync(() => admin.queryQuestions({
    search: f.search, subject_id: f.subject, topic_id: f.topic, exam_id: f.exam, difficulty: f.difficulty, status: f.status, page, pageSize: PAGE,
  }), [params.toString()]);
  const [del, setDel] = useState(null); const [busy, setBusy] = useState(false); const [exporting, setExporting] = useState(false);
  const L = lk.data;
  const name = (list, id) => L?.[list].find((x) => x.id === id)?.name || '—';
  const pages = data ? Math.max(1, Math.ceil(data.count / PAGE)) : 1;

  const setStatus = async (q, status) => { try { await admin.update('questions', q.id, { status }); toast(status === 'published' ? 'Question published.' : 'Question moved to drafts.'); reload(); } catch (e) { toast(e.message, 'error'); } };
  const exportAll = async () => {
    setExporting(true);
    try { const all = await admin.select('questions'); downloadText(`entrancego-questions-${new Date().toISOString().slice(0, 10)}.csv`, questionsToCSV(all, L)); toast(`Exported ${all.length} questions.`); }
    catch (e) { toast(e.message, 'error'); }
    setExporting(false);
  };

  return (
    <>
      <AdminHead title="Questions" sub={data ? `${data.count} matching question${data.count === 1 ? '' : 's'}` : ''}>
        <button className="btn btn-outline" onClick={exportAll} disabled={!L || exporting}><Download size={17} /> {exporting ? 'Exporting…' : 'Export CSV'}</button>
        <Link className="btn btn-primary" to="/admin/questions/new"><Plus size={17} /> New question</Link>
      </AdminHead>
      <div className="filters wrap">
        <input className="input grow" placeholder="Search question text…" value={searchText} onChange={(e) => setSearchText(e.target.value)} aria-label="Search question text" />
        <select className="input" value={f.subject} onChange={(e) => setF('subject', e.target.value)} aria-label="Subject"><option value="">All subjects</option>{L?.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <select className="input" value={f.topic} onChange={(e) => setF('topic', e.target.value)} aria-label="Topic" disabled={!f.subject}><option value="">All topics</option>{L?.topics.filter((t) => t.subject_id === f.subject).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        <select className="input" value={f.exam} onChange={(e) => setF('exam', e.target.value)} aria-label="Exam"><option value="">All exams</option>{L?.exams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        <select className="input" value={f.difficulty} onChange={(e) => setF('difficulty', e.target.value)} aria-label="Difficulty"><option value="">Any difficulty</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select>
        <select className="input" value={f.status} onChange={(e) => setF('status', e.target.value)} aria-label="Status"><option value="">Any status</option><option value="published">Published</option><option value="draft">Draft</option></select>
      </div>
      {loading || lk.loading ? <Loading /> : error || lk.error ? <ErrorState error={error || lk.error} onRetry={reload} /> : data.rows.length === 0 ? (
        <Empty title={params.toString() ? 'No questions match these filters' : 'No questions yet'} action={<Link className="btn btn-primary" to="/admin/questions/new">Add your first question</Link>}>
          {params.toString() ? 'Clear a filter or try different words.' : 'Add questions one by one, or import many at once from a CSV file.'}
        </Empty>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Question</th><th>Subject / topic</th><th>Level</th><th>Answer</th><th>Status</th><th>Updated</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {data.rows.map((q) => (
                  <tr key={q.id}>
                    <td className="q-cell"><Link to={`/admin/questions/${q.id}`} className="clamp-2">{q.question}</Link></td>
                    <td className="small">{name('subjects', q.subject_id)}<div className="muted">{q.topic_id ? name('topics', q.topic_id) : 'No topic'}{q.exam_id ? ` · ${name('exams', q.exam_id)}` : ''}</div></td>
                    <td><span className={`diff diff-${q.difficulty}`}>{cap(q.difficulty)}</span></td>
                    <td className="mono">{q.correct_option}</td>
                    <td><StatusBadge s={q.status} /></td>
                    <td className="small muted">{fmtDate(q.updated_at)}</td>
                    <td className="row-actions">
                      <button className="icon-btn" title="Edit" aria-label="Edit question" onClick={() => nav(`/admin/questions/${q.id}`)}><Pencil size={16} /></button>
                      <button className="icon-btn" title="Duplicate" aria-label="Duplicate question" onClick={() => nav(`/admin/questions/new?from=${q.id}`)}><Copy size={16} /></button>
                      {q.status === 'published'
                        ? <button className="icon-btn" title="Unpublish" aria-label="Unpublish question" onClick={() => setStatus(q, 'draft')}><EyeOff size={16} /></button>
                        : <button className="icon-btn" title="Publish" aria-label="Publish question" onClick={() => setStatus(q, 'published')}><Eye size={16} /></button>}
                      <button className="icon-btn danger" title="Delete" aria-label="Delete question" onClick={() => setDel(q)}><Trash2 size={16} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <nav className="pager" aria-label="Pages">
              <button className="btn btn-outline btn-sm" disabled={page <= 1} onClick={() => setF('page', String(page - 1))}>Previous</button>
              <span>Page {page} of {pages}</span>
              <button className="btn btn-outline btn-sm" disabled={page >= pages} onClick={() => setF('page', String(page + 1))}>Next</button>
            </nav>
          )}
        </>
      )}
      {del && (
        <Confirm title="Delete this question?" busy={busy} onClose={() => setDel(null)} onConfirm={async () => {
          setBusy(true); try { await admin.remove('questions', del.id); toast('Question deleted.'); setDel(null); reload(); } catch (e) { toast(e.message, 'error'); } setBusy(false);
        }}>
          <p className="clamp-3">“{del.question}”</p>
          <p>It will also be removed from any practice sets and bookmarks. This can't be undone. Tip: unpublish it instead if you might need it later.</p>
        </Confirm>
      )}
    </>
  );
}

// =================================================================== FORM
const BLANK = { question: '', subject_id: '', topic_id: '', exam_id: '', difficulty: 'medium', option_a: '', option_b: '', option_c: '', option_d: '', correct_option: '', explanation: '', image_url: '', tags: '', source: '', status: 'draft' };

export function QuestionForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const from = params.get('from');
  const nav = useNavigate();
  const toast = useToast();
  const isNew = !id;
  const { data: L, loading, error, reload } = useAsync(async () => {
    const lookups = await admin.lookups();
    const src = id || from ? await admin.get('questions', id || from) : null;
    return { ...lookups, src };
  }, [id, from]);
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const busyRef = useRef(false);

  useEffect(() => {
    if (!L) return;
    if (L.src) {
      const s = L.src;
      setForm({ ...BLANK, ...Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v ?? ''])), tags: (s.tags || []).join(', '),
        ...(from ? { status: 'draft', question: s.question + ' (copy)' } : {}) });
    } else setForm({ ...BLANK });
  }, [L, from]);

  if (loading || (!form && !error)) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if ((id || from) && !L.src) return <Empty title="Question not found" action={<Link className="btn btn-primary" to="/admin/questions">Back to questions</Link>} />;

  const set = (p) => { setForm((f) => ({ ...f, ...p })); setErrors((e) => { const n = { ...e }; Object.keys(p).forEach((k) => delete n[k]); return n; }); };
  const topics = L.topics.filter((t) => t.subject_id === form.subject_id);
  const payload = (status) => ({
    question: form.question.trim(), subject_id: form.subject_id, topic_id: form.topic_id || null, exam_id: form.exam_id || null,
    difficulty: form.difficulty, option_a: form.option_a.trim(), option_b: form.option_b.trim(), option_c: form.option_c.trim(), option_d: form.option_d.trim(),
    correct_option: form.correct_option, explanation: form.explanation.trim() || null, image_url: form.image_url.trim() || null,
    tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean), source: form.source.trim() || null, status,
  });
  const check = (status) => {
    const e = validateQuestion(payload(status), { topics: L.topics });
    setErrors(e);
    if (Object.keys(e).length) { toast('Please fix the highlighted fields.', 'error'); document.querySelector('.has-error')?.scrollIntoView({ block: 'center' }); return false; }
    return true;
  };
  const save = async (status) => {
    if (busyRef.current || !check(status)) return;           // prevents double submission
    busyRef.current = true; setBusy(true);
    try {
      const saved = isNew ? await admin.insert('questions', payload(status)) : await admin.update('questions', id, payload(status));
      toast(status === 'published' ? 'Question published. It is now live for students.' : 'Saved as draft.');
      setPreview(false);
      if (isNew) nav(`/admin/questions/${saved.id}`, { replace: true }); else reload();
    } catch (e) { toast(e.message, 'error'); }
    busyRef.current = false; setBusy(false);
  };

  return (
    <>
      <AdminHead title={isNew ? (from ? 'Duplicate question' : 'New question') : 'Edit question'} sub={!isNew && L.src ? `Created ${fmtDate(L.src.created_at)} · Updated ${fmtDate(L.src.updated_at)}` : 'Fields marked * are required.'}>
        <Link className="btn btn-ghost" to="/admin/questions">Back to list</Link>
        {!isNew && <StatusBadge s={L.src.status} />}
      </AdminHead>
      <form className="card form-card" onSubmit={(e) => e.preventDefault()} noValidate>
        <Field label="Question" required error={errors.question}>
          <textarea className="input" rows={3} value={form.question} onChange={(e) => set({ question: e.target.value })} />
        </Field>
        <div className="form-row">
          <Field label="Subject" required error={errors.subject_id}>
            <select className="input" value={form.subject_id} onChange={(e) => set({ subject_id: e.target.value, topic_id: '' })}><option value="">Choose…</option>{L.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}{s.status !== 'published' ? ` (${s.status})` : ''}</option>)}</select>
          </Field>
          <Field label="Topic" error={errors.topic_id} hint={form.subject_id && !topics.length ? 'This subject has no topics yet.' : ''}>
            <select className="input" value={form.topic_id} onChange={(e) => set({ topic_id: e.target.value })} disabled={!form.subject_id}><option value="">No topic</option>{topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          </Field>
        </div>
        <div className="form-row">
          <Field label="Related exam"><select className="input" value={form.exam_id} onChange={(e) => set({ exam_id: e.target.value })}><option value="">None</option>{L.exams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
          <Field label="Difficulty" required error={errors.difficulty}>
            <select className="input" value={form.difficulty} onChange={(e) => set({ difficulty: e.target.value })}><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select>
          </Field>
        </div>

        <fieldset className="field options-field">
          <legend>Options and correct answer <em>*</em></legend>
          <p className="muted small">Select the radio button next to the correct option.</p>
          {OPTIONS.map((Lt) => (
            <div key={Lt} className={'opt-input' + (form.correct_option === Lt ? ' is-correct' : '') + (errors[optKey(Lt)] ? ' has-error' : '')}>
              <label className="opt-radio" title={`Mark ${Lt} as correct`}>
                <input type="radio" name="correct" value={Lt} checked={form.correct_option === Lt} onChange={() => set({ correct_option: Lt })} />
                <span className="opt-letter">{Lt}</span><span className="sr-only">Option {Lt} is correct</span>
              </label>
              <input className="input" aria-label={`Option ${Lt}`} value={form[optKey(Lt)]} onChange={(e) => set({ [optKey(Lt)]: e.target.value })} placeholder={`Option ${Lt}`} />
              {errors[optKey(Lt)] && <small className="err-text">{errors[optKey(Lt)]}</small>}
            </div>
          ))}
          {errors.correct_option && <small className="err-text" role="alert">{errors.correct_option}</small>}
        </fieldset>

        <Field label="Explanation" hint="Shown after answering in Practice mode, and in the review after a test.">
          <textarea className="input" rows={3} value={form.explanation} onChange={(e) => set({ explanation: e.target.value })} />
        </Field>
        <div className="form-row">
          <Field label="Image URL (optional)" error={errors.image_url} hint="A public https:// link to a diagram or figure."><input className="input" type="url" value={form.image_url} onChange={(e) => set({ image_url: e.target.value })} /></Field>
          <Field label="Tags (optional)" hint="Comma separated"><input className="input" value={form.tags} onChange={(e) => set({ tags: e.target.value })} /></Field>
        </div>
        <Field label="Source / attribution (optional)"><input className="input" value={form.source} onChange={(e) => set({ source: e.target.value })} /></Field>

        <div className="form-actions sticky">
          <button type="button" className="btn btn-outline" disabled={busy} onClick={() => save('draft')}>{busy ? 'Saving…' : isNew ? 'Save as draft' : 'Save as draft'}</button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => check('published') && setPreview(true)}>Preview & publish</button>
        </div>
      </form>

      {preview && (
        <Modal title="Preview before publishing" onClose={() => setPreview(false)} wide>
          <p className="muted small">This is how students will see the question once the answer is revealed.</p>
          <QuestionStudy q={{ id: 'preview', ...payload('published') }} forceOpen />
          <div className="form-actions">
            <button className="btn btn-outline" onClick={() => setPreview(false)} disabled={busy}>Keep editing</button>
            <button className="btn btn-primary" onClick={() => save('published')} disabled={busy}>{busy ? 'Publishing…' : 'Publish question'}</button>
          </div>
        </Modal>
      )}
    </>
  );
}
