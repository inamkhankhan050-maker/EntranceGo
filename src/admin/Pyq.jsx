import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Plus, Pencil, Trash2, Archive, ExternalLink } from 'lucide-react';
import { admin } from '../lib/api.js';
import { useAsync, useToast } from '../lib/hooks.js';
import { slugify, normText, isSlug } from '../lib/text.js';
import { AdminHead, Field, StatusBadge } from './common.jsx';
import { Confirm } from '../components/Modal.jsx';
import { Loading, ErrorState, Empty } from '../components/States.jsx';

// Suggestions shown in the Exam / Level / Course boxes; admins can type any new value too.
const EXAM_HINTS = ['JMI', 'AMU', 'CUET', 'BHU', 'DU'];
const LEVEL_HINTS = ['School', 'Diploma', 'UG', 'PG', 'University'];
const uniq = (arr) => [...new Set(arr.filter(Boolean))].sort();
const missingTable = (e) => /pyq_papers|does not exist|schema cache/i.test(e?.message || '');

function SetupNotice() {
  return (
    <div className="notice">
      The PYQ table is not in the database yet. In Supabase open <strong>SQL Editor</strong>, paste the file
      <code> supabase/migrations/006_pyq.sql</code> from the repository and click <strong>Run</strong>. Then reload this page.
    </div>
  );
}

export function PyqAdmin() {
  const toast = useToast();
  const nav = useNavigate();
  const { data, loading, error, reload } = useAsync(async () => {
    const [papers, sets] = await Promise.all([admin.select('pyq_papers'), admin.select('practice_sets')]);
    return { papers, sets };
  }, []);
  const [f, setF] = useState({ exam: '', level: '', q: '' });
  const [del, setDel] = useState(null); const [busy, setBusy] = useState(false);
  const archive = async (p) => { try { await admin.update('pyq_papers', p.id, { status: 'archived' }); toast('Paper archived.'); reload(); } catch (e) { toast(e.message, 'error'); } };

  const papers = data?.papers || [];
  const list = papers.filter((p) => (!f.exam || p.exam_name === f.exam) && (!f.level || p.level === f.level)
    && (!f.q || normText(`${p.title} ${p.course} ${p.year}`).includes(normText(f.q))))
    .sort((a, b) => a.exam_name.localeCompare(b.exam_name) || a.level.localeCompare(b.level) || a.course.localeCompare(b.course) || b.year - a.year);

  return (
    <>
      <AdminHead title="PYQ papers" sub="Previous year papers, filed by Exam > Level > Course > Year. Questions come from a practice set; a PDF link is optional.">
        <Link className="btn btn-primary" to="/admin/pyq/new"><Plus size={17} /> New paper</Link>
      </AdminHead>
      {loading ? <Loading /> : error ? (missingTable(error) ? <SetupNotice /> : <ErrorState error={error} onRetry={reload} />) : papers.length === 0 ? (
        <Empty title="No PYQ papers yet" action={<Link className="btn btn-primary" to="/admin/pyq/new">Add a paper</Link>}>
          Add a paper, choose its exam, level, course and year, then attach a practice set with its questions or a PDF link.
        </Empty>
      ) : (
        <>
          <div className="filters wrap">
            <input className="input grow" placeholder="Search title, course or year…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} aria-label="Search papers" />
            <select className="input" value={f.exam} onChange={(e) => setF({ ...f, exam: e.target.value })} aria-label="Exam"><option value="">All exams</option>{uniq(papers.map((p) => p.exam_name)).map((x) => <option key={x}>{x}</option>)}</select>
            <select className="input" value={f.level} onChange={(e) => setF({ ...f, level: e.target.value })} aria-label="Level"><option value="">All levels</option>{uniq(papers.map((p) => p.level)).map((x) => <option key={x}>{x}</option>)}</select>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Paper</th><th>Exam</th><th>Level</th><th>Course</th><th>Year</th><th>Questions</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {list.map((p) => {
                  const s = data.sets.find((x) => x.id === p.set_id);
                  return (
                    <tr key={p.id}>
                      <td><strong>{p.title}</strong><div className="muted small mono">/pyq/{p.slug}</div></td>
                      <td>{p.exam_name}</td><td>{p.level}</td><td>{p.course}</td><td>{p.year}</td>
                      <td className="small">{s ? <Link to={`/admin/sets/${s.id}`}>{s.title}</Link> : '—'}{p.pdf_url && <div className="muted">PDF</div>}</td>
                      <td><StatusBadge s={p.status} /></td>
                      <td className="row-actions">
                        <button className="icon-btn" aria-label={`Edit ${p.title}`} title="Edit" onClick={() => nav(`/admin/pyq/${p.id}`)}><Pencil size={16} /></button>
                        {p.status !== 'archived' && <button className="icon-btn" aria-label={`Archive ${p.title}`} title="Archive" onClick={() => archive(p)}><Archive size={16} /></button>}
                        <button className="icon-btn danger" aria-label={`Delete ${p.title}`} title="Delete" onClick={() => setDel(p)}><Trash2 size={16} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      {del && (
        <Confirm title={`Delete “${del.title}”?`} busy={busy} onClose={() => setDel(null)} onConfirm={async () => {
          setBusy(true); try { await admin.remove('pyq_papers', del.id); toast('Paper deleted. Its practice set and questions are untouched.'); setDel(null); reload(); } catch (e) { toast(e.message, 'error'); } setBusy(false);
        }}><p>The paper is removed from the PYQ section. Its practice set and questions stay. Archive it instead to hide it but keep it.</p></Confirm>
      )}
    </>
  );
}

export function PyqForm() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { data, loading, error, reload } = useAsync(async () => {
    const [papers, sets, links] = await Promise.all([admin.select('pyq_papers'), admin.select('practice_sets'), admin.select('practice_set_questions')]);
    return { papers, sets, links };
  }, [id]);
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [slugTouched, setSlugTouched] = useState(!!id);
  const busyRef = useRef(false);

  useEffect(() => {
    if (!data) return;
    const p = id && data.papers.find((x) => x.id === id);
    setForm(p ? { ...p, description: p.description || '', set_id: p.set_id || '', pdf_url: p.pdf_url || '', year: String(p.year), sort_order: String(p.sort_order ?? 0) }
      : { title: '', slug: '', exam_name: '', level: '', course: '', year: String(new Date().getFullYear() - 1), description: '', set_id: '', pdf_url: '', status: 'draft', sort_order: '0' });
  }, [data, id]);

  const hints = useMemo(() => ({
    exam: uniq([...EXAM_HINTS, ...(data?.papers || []).map((p) => p.exam_name)]),
    level: uniq([...LEVEL_HINTS, ...(data?.papers || []).map((p) => p.level)]),
    course: uniq((data?.papers || []).map((p) => p.course)),
  }), [data]);

  if (loading || (!form && !error)) return <Loading />;
  if (error) return missingTable(error) ? <SetupNotice /> : <ErrorState error={error} onRetry={reload} />;
  if (id && !data.papers.find((x) => x.id === id)) return <Empty title="Paper not found" action={<Link className="btn btn-primary" to="/admin/pyq">Back</Link>} />;

  const autoTitle = (p) => [p.exam_name, p.course, p.year, 'Question Paper'].filter(Boolean).join(' ');
  const set = (patch) => setForm((f) => {
    const next = { ...f, ...patch };
    if (!slugTouched) next.slug = slugify(next.title || autoTitle(next));
    return next;
  });
  const qCount = (sid) => data.links.filter((x) => x.set_id === sid).length;

  const save = async () => {
    if (busyRef.current) return;
    const e = {};
    const title = form.title.trim() || autoTitle(form);
    if (!form.exam_name.trim()) e.exam_name = 'Choose or type the exam (e.g. JMI).';
    if (!form.level.trim()) e.level = 'Choose or type the level (e.g. UG).';
    if (!form.course.trim()) e.course = 'Type the course (e.g. B.Tech).';
    const year = Number(form.year);
    if (!Number.isInteger(year) || year < 1950 || year > 2100) e.year = 'Enter a year like 2024.';
    if (!isSlug(form.slug)) e.slug = 'Use lowercase letters, numbers and hyphens.';
    else if (data.papers.some((p) => p.slug === form.slug && p.id !== id)) e.slug = 'Another paper already uses this slug.';
    if (form.pdf_url && !/^https?:\/\//i.test(form.pdf_url.trim())) e.pdf_url = 'Paste a full link starting with https://';
    if (form.status === 'published' && !form.set_id && !form.pdf_url.trim()) e.set_id = 'Attach a practice set or a PDF link before publishing.';
    const sort = Number(form.sort_order || 0);
    setErrors(e); if (Object.keys(e).length) { toast('Please fix the highlighted fields.', 'error'); return; }
    busyRef.current = true; setBusy(true);
    try {
      const row = {
        title, slug: form.slug, exam_name: form.exam_name.trim(), level: form.level.trim(), course: form.course.trim(), year,
        description: form.description.trim() || null, set_id: form.set_id || null, pdf_url: form.pdf_url.trim() || null,
        status: form.status, sort_order: Number.isInteger(sort) ? sort : 0,
      };
      if (id) await admin.update('pyq_papers', id, row); else await admin.insert('pyq_papers', row);
      toast('PYQ paper saved.');
      nav('/admin/pyq');
    } catch (err) { toast(err.message, 'error'); }
    busyRef.current = false; setBusy(false);
  };

  const chosen = data.sets.find((s) => s.id === form.set_id);
  return (
    <>
      <AdminHead title={id ? 'Edit PYQ paper' : 'New PYQ paper'}>
        <Link className="btn btn-ghost" to="/admin/pyq">Back</Link>
        <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save paper'}</button>
      </AdminHead>
      <div className="card form-card">
        <div className="form-row four">
          <Field label="Exam" required error={errors.exam_name} hint="JMI, AMU, CUET… or type a new one">
            <input className="input" list="pyq-exams" value={form.exam_name} onChange={(e) => set({ exam_name: e.target.value })} /></Field>
          <Field label="Level" required error={errors.level} hint="School, UG, PG… or type a new one">
            <input className="input" list="pyq-levels" value={form.level} onChange={(e) => set({ level: e.target.value })} /></Field>
          <Field label="Course" required error={errors.course} hint="e.g. Class 9, B.Tech, MBA">
            <input className="input" list="pyq-courses" value={form.course} onChange={(e) => set({ course: e.target.value })} /></Field>
          <Field label="Year" required error={errors.year}>
            <input className="input" type="number" min="1950" max="2100" value={form.year} onChange={(e) => set({ year: e.target.value })} /></Field>
        </div>
        <datalist id="pyq-exams">{hints.exam.map((x) => <option key={x} value={x} />)}</datalist>
        <datalist id="pyq-levels">{hints.level.map((x) => <option key={x} value={x} />)}</datalist>
        <datalist id="pyq-courses">{hints.course.map((x) => <option key={x} value={x} />)}</datalist>
        <div className="form-row">
          <Field label="Title" hint={`Blank = “${autoTitle(form) || 'JMI B.Tech 2024 Question Paper'}”`}>
            <input className="input" value={form.title} onChange={(e) => set({ title: e.target.value })} /></Field>
          <Field label="URL slug" required error={errors.slug} hint="Appears as /pyq/your-slug">
            <input className="input mono" value={form.slug} onChange={(e) => { setSlugTouched(true); setForm((f) => ({ ...f, slug: e.target.value.toLowerCase() })); }} /></Field>
        </div>
        <Field label="Description"><textarea className="input" rows={2} value={form.description} onChange={(e) => set({ description: e.target.value })} /></Field>
        <div className="form-row">
          <Field label="Questions (practice set)" error={errors.set_id} hint="The paper's questions in order. Students can practise it or take it as a timed test.">
            <select className="input" value={form.set_id} onChange={(e) => set({ set_id: e.target.value })}>
              <option value="">None</option>
              {data.sets.map((s) => <option key={s.id} value={s.id}>{s.title} ({qCount(s.id)} q{s.status !== 'published' ? `, ${s.status}` : ''})</option>)}
            </select>
          </Field>
          <Field label="Question paper PDF link" error={errors.pdf_url} hint="Optional. A public link (Google Drive, etc.)">
            <input className="input" placeholder="https://" value={form.pdf_url} onChange={(e) => set({ pdf_url: e.target.value })} /></Field>
        </div>
        {chosen && chosen.status !== 'published' && <p className="notice">The selected practice set is {chosen.status}. Publish it so students can attempt the questions.</p>}
        <p className="muted small">
          To add this paper's questions: import them in <Link to="/admin/import">Bulk import</Link> or <Link to="/admin/questions/new">add them one by one</Link>,
          then put them in a <Link to="/admin/sets/new">new practice set <ExternalLink size={12} /></Link> and choose that set here.
        </p>
        <div className="form-row">
          <Field label="Status"><select className="input" value={form.status} onChange={(e) => set({ status: e.target.value })}><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></Field>
          <Field label="Sort order" hint="Lower shows first within the same year"><input className="input" type="number" value={form.sort_order} onChange={(e) => set({ sort_order: e.target.value })} /></Field>
        </div>
      </div>
    </>
  );
}
