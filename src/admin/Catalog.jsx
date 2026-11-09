import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Pencil, Trash2, Archive, Eye, EyeOff } from 'lucide-react';
import { admin, CATEGORY_LABELS } from '../lib/api.js';
import { useAsync, useToast } from '../lib/hooks.js';
import { slugify, normText } from '../lib/text.js';
import { validateSlugged } from '../lib/validate.js';
import { AdminHead, Field, StatusBadge } from './common.jsx';
import { Modal, Confirm } from '../components/Modal.jsx';
import { Loading, ErrorState, Empty } from '../components/States.jsx';
import { SubjectIcon, ICON_NAMES } from '../components/Icon.jsx';

function useCatalogAdmin() {
  return useAsync(async () => {
    const [l, counts] = await Promise.all([admin.lookups(), admin.counts()]);
    // Show the same category names as the public site (renamed by slug in api.js)
    const categories = (l.categories || []).map((k) => (CATEGORY_LABELS[k.slug] ? { ...k, name: CATEGORY_LABELS[k.slug] } : k));
    return { ...l, categories, counts };
  }, []);
}

// Name + auto slug (until the slug is edited by hand)
function NameSlug({ form, set, errors, label = 'Name', titleKey = 'name' }) {
  const [touched, setTouched] = useState(!!form.id);
  return (
    <div className="form-row">
      <Field label={label} required error={errors[titleKey]}>
        <input className="input" value={form[titleKey] || ''} onChange={(e) => set({ [titleKey]: e.target.value, ...(touched ? {} : { slug: slugify(e.target.value) }) })} />
      </Field>
      <Field label="URL slug" required error={errors.slug} hint="Lowercase letters, numbers and hyphens.">
        <input className="input mono" value={form.slug || ''} onChange={(e) => { setTouched(true); set({ slug: e.target.value.toLowerCase() }); }} />
      </Field>
    </div>
  );
}

function FormModal({ title, onClose, onSubmit, busy, children }) {
  return (
    <Modal title={title} onClose={onClose} wide>
      <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} noValidate>
        {children}
        <div className="form-actions">
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}

// =================================================================== SUBJECTS
export function SubjectsAdmin() {
  const { data, loading, error, reload } = useCatalogAdmin();
  const toast = useToast();
  const [q, setQ] = useState(''); const [cat, setCat] = useState(''); const [status, setStatus] = useState('');
  const [edit, setEdit] = useState(null); const [del, setDel] = useState(null);
  const [errors, setErrors] = useState({}); const [busy, setBusy] = useState(false);

  const list = useMemo(() => {
    if (!data) return [];
    return data.subjects.map((s) => ({ ...s, cats: data.subject_categories.filter((x) => x.subject_id === s.id).map((x) => x.category_id) }))
      .filter((s) => (!q || normText(s.name).includes(normText(q)) || s.slug.includes(normText(q))) && (!cat || s.cats.includes(cat)) && (!status || s.status === status));
  }, [data, q, cat, status]);

  const open = (s) => { setErrors({}); setEdit(s ? { ...s, cats: data.subject_categories.filter((x) => x.subject_id === s.id).map((x) => x.category_id) } : { name: '', slug: '', description: '', icon: 'BookOpen', status: 'draft', sort_order: data.subjects.length, cats: [] }); };
  const save = async () => {
    if (busy) return;
    const e = validateSlugged(edit);
    if (!edit.cats.length) e.cats = 'Choose at least one category.';
    if (data.subjects.some((s) => s.slug === edit.slug && s.id !== edit.id)) e.slug = 'Another subject already uses this slug.';
    setErrors(e); if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const row = { name: edit.name.trim(), slug: edit.slug, description: edit.description?.trim() || null, icon: edit.icon, status: edit.status, sort_order: Number(edit.sort_order) || 0 };
      const saved = edit.id ? await admin.update('subjects', edit.id, row) : await admin.insert('subjects', row);
      await admin.replaceLinks('subject_categories', 'subject_id', saved.id, edit.cats.map((c) => ({ subject_id: saved.id, category_id: c })));
      toast(edit.id ? 'Subject updated.' : 'Subject created.'); setEdit(null); reload();
    } catch (err) { toast(err.message, 'error'); }
    setBusy(false);
  };
  const patch = async (s, p, msg) => { try { await admin.update('subjects', s.id, p); toast(msg); reload(); } catch (e) { toast(e.message, 'error'); } };
  const remove = async () => {
    setBusy(true);
    try { await admin.remove('subjects', del.id); toast('Subject deleted.'); setDel(null); reload(); } catch (e) { toast(e.message, 'error'); }
    setBusy(false);
  };

  return (
    <>
      <AdminHead title="Subjects" sub="A subject can belong to several categories without being duplicated.">
        <button className="btn btn-primary" onClick={() => open(null)} disabled={!data}><Plus size={17} /> New subject</button>
      </AdminHead>
      <div className="filters">
        <input className="input" placeholder="Search subjects…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search subjects" />
        <select className="input" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Filter by category"><option value="">All categories</option>{data?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status"><option value="">Any status</option><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option></select>
      </div>
      {loading ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : list.length === 0 ? <Empty title="No subjects match" /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Subject</th><th>Categories</th><th>Topics</th><th>Questions</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {list.map((s) => {
                const tq = data.counts.topicsBySubject[s.id] || 0, qq = data.counts.bySubject[s.id] || 0;
                return (
                  <tr key={s.id}>
                    <td><div className="cell-with-icon"><SubjectIcon name={s.icon} k={s.slug} size={18} /><div><strong>{s.name}</strong><div className="muted small mono">/subjects/{s.slug}</div></div></div></td>
                    <td className="small">{s.cats.map((c) => data.categories.find((k) => k.id === c)?.name).join(', ')}</td>
                    <td><Link to={`/admin/topics?subject=${s.id}`}>{tq}</Link></td>
                    <td><Link to={`/admin/questions?subject=${s.id}`}>{qq}</Link></td>
                    <td><StatusBadge s={s.status} /></td>
                    <td className="row-actions">
                      <button className="icon-btn" title="Edit" aria-label={`Edit ${s.name}`} onClick={() => open(s)}><Pencil size={16} /></button>
                      {s.status !== 'published'
                        ? <button className="icon-btn" title="Publish" aria-label={`Publish ${s.name}`} onClick={() => patch(s, { status: 'published' }, 'Subject published.')}><Eye size={16} /></button>
                        : <button className="icon-btn" title="Unpublish" aria-label={`Unpublish ${s.name}`} onClick={() => patch(s, { status: 'draft' }, 'Subject unpublished.')}><EyeOff size={16} /></button>}
                      {s.status !== 'archived' && <button className="icon-btn" title="Archive" aria-label={`Archive ${s.name}`} onClick={() => patch(s, { status: 'archived' }, 'Subject archived and hidden from the site.')}><Archive size={16} /></button>}
                      <button className="icon-btn danger" title={tq || qq ? 'Has content: archive instead' : 'Delete'} aria-label={`Delete ${s.name}`} onClick={() => setDel({ ...s, tq, qq })}><Trash2 size={16} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {edit && (
        <FormModal title={edit.id ? `Edit ${edit.name}` : 'New subject'} onClose={() => setEdit(null)} onSubmit={save} busy={busy}>
          <NameSlug form={edit} set={(p) => setEdit({ ...edit, ...p })} errors={errors} />
          <Field label="Description"><textarea className="input" rows={2} value={edit.description || ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
          <fieldset className="field">
            <legend>Categories <em>*</em></legend>
            <div className="check-grid">
              {data.categories.map((c) => (
                <label key={c.id} className="check"><input type="checkbox" checked={edit.cats.includes(c.id)} onChange={(e) => setEdit({ ...edit, cats: e.target.checked ? [...edit.cats, c.id] : edit.cats.filter((x) => x !== c.id) })} /> {c.name}</label>
              ))}
            </div>
            {errors.cats && <small className="err-text">{errors.cats}</small>}
          </fieldset>
          <div className="form-row">
            <Field label="Icon">
              <div className="icon-pick"><SubjectIcon name={edit.icon} k={edit.slug} />
                <select className="input" value={edit.icon} onChange={(e) => setEdit({ ...edit, icon: e.target.value })}>{ICON_NAMES.map((n) => <option key={n}>{n}</option>)}</select></div>
            </Field>
            <Field label="Status"><select className="input" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></Field>
            <Field label="Sort order"><input className="input" type="number" value={edit.sort_order ?? 0} onChange={(e) => setEdit({ ...edit, sort_order: e.target.value })} /></Field>
          </div>
        </FormModal>
      )}
      {del && (del.tq || del.qq ? (
        <Confirm title="This subject can't be deleted" confirmLabel="Archive instead" danger={false} busy={busy} onClose={() => setDel(null)}
          onConfirm={async () => { await patch(del, { status: 'archived' }, 'Subject archived.'); setDel(null); }}>
          <p><strong>{del.name}</strong> still has {del.tq} topic(s) and {del.qq} question(s). Deleting it would orphan that content, so the database blocks it.</p>
          <p>Archive it to hide it from students while keeping everything, or move/delete its topics and questions first.</p>
        </Confirm>
      ) : (
        <Confirm title={`Delete ${del.name}?`} busy={busy} onClose={() => setDel(null)} onConfirm={remove}>
          <p>This permanently deletes the subject. It has no topics or questions. This can't be undone.</p>
        </Confirm>
      ))}
    </>
  );
}

// =================================================================== TOPICS
export function TopicsAdmin() {
  const { data, loading, error, reload } = useCatalogAdmin();
  const toast = useToast();
  const params = new URLSearchParams(window.location.search);
  const [subject, setSubject] = useState(params.get('subject') || ''); const [q, setQ] = useState(''); const [status, setStatus] = useState('');
  const [edit, setEdit] = useState(null); const [del, setDel] = useState(null);
  const [errors, setErrors] = useState({}); const [busy, setBusy] = useState(false);
  const subjName = (id) => data?.subjects.find((s) => s.id === id)?.name || '—';

  const list = useMemo(() => data ? data.topics
    .filter((t) => (!subject || t.subject_id === subject) && (!status || t.status === status) && (!q || normText(t.name).includes(normText(q))))
    .sort((a, b) => subjName(a.subject_id).localeCompare(subjName(b.subject_id)) || a.sort_order - b.sort_order) : [], [data, subject, q, status]); // eslint-disable-line

  const open = (t) => { setErrors({}); setEdit(t ? { ...t } : { subject_id: subject || '', name: '', slug: '', description: '', status: 'published', sort_order: 0 }); };
  const save = async () => {
    if (busy) return;
    const e = validateSlugged(edit);
    if (!edit.subject_id) e.subject_id = 'Choose a subject.';
    if (data.topics.some((t) => t.subject_id === edit.subject_id && t.slug === edit.slug && t.id !== edit.id)) e.slug = 'This subject already has a topic with this slug.';
    if (edit.id && edit.subject_id !== data.topics.find((t) => t.id === edit.id).subject_id && data.counts.byTopic[edit.id]) e.subject_id = 'This topic has questions, so it cannot move to another subject. Move its questions first.';
    setErrors(e); if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const row = { subject_id: edit.subject_id, name: edit.name.trim(), slug: edit.slug, description: edit.description?.trim() || null, status: edit.status, sort_order: Number(edit.sort_order) || 0 };
      edit.id ? await admin.update('topics', edit.id, row) : await admin.insert('topics', row);
      toast(edit.id ? 'Topic updated.' : 'Topic created.'); setEdit(null); reload();
    } catch (err) { toast(err.message, 'error'); }
    setBusy(false);
  };
  const patch = async (t, p, msg) => { try { await admin.update('topics', t.id, p); toast(msg); reload(); } catch (e) { toast(e.message, 'error'); } };

  return (
    <>
      <AdminHead title="Topics" sub="Topics organise questions inside a subject.">
        <button className="btn btn-primary" onClick={() => open(null)} disabled={!data}><Plus size={17} /> New topic</button>
      </AdminHead>
      <div className="filters">
        <input className="input" placeholder="Search topics…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search topics" />
        <select className="input" value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Filter by subject"><option value="">All subjects</option>{data?.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status"><option value="">Any status</option><option value="published">Published</option><option value="draft">Draft</option></select>
      </div>
      {loading ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : list.length === 0 ? <Empty title="No topics found" action={<button className="btn btn-primary" onClick={() => open(null)}>Add a topic</button>} /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Topic</th><th>Subject</th><th>Questions</th><th>Order</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {list.map((t) => {
                const n = data.counts.byTopic[t.id] || 0;
                return (
                  <tr key={t.id}>
                    <td><strong>{t.name}</strong><div className="muted small mono">{t.slug}</div></td>
                    <td>{subjName(t.subject_id)}</td>
                    <td><Link to={`/admin/questions?subject=${t.subject_id}&topic=${t.id}`}>{n}</Link></td>
                    <td>{t.sort_order}</td>
                    <td><StatusBadge s={t.status} /></td>
                    <td className="row-actions">
                      <button className="icon-btn" aria-label={`Edit ${t.name}`} title="Edit" onClick={() => open(t)}><Pencil size={16} /></button>
                      {t.status === 'published'
                        ? <button className="icon-btn" title="Unpublish" aria-label={`Unpublish ${t.name}`} onClick={() => patch(t, { status: 'draft' }, 'Topic unpublished. Its questions are hidden from students.')}><EyeOff size={16} /></button>
                        : <button className="icon-btn" title="Publish" aria-label={`Publish ${t.name}`} onClick={() => patch(t, { status: 'published' }, 'Topic published.')}><Eye size={16} /></button>}
                      <button className="icon-btn danger" title="Delete" aria-label={`Delete ${t.name}`} onClick={() => setDel({ ...t, n })}><Trash2 size={16} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {edit && (
        <FormModal title={edit.id ? `Edit ${edit.name}` : 'New topic'} onClose={() => setEdit(null)} onSubmit={save} busy={busy}>
          <Field label="Subject" required error={errors.subject_id}>
            <select className="input" value={edit.subject_id} onChange={(e) => setEdit({ ...edit, subject_id: e.target.value })}><option value="">Choose…</option>{data.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          </Field>
          <NameSlug form={edit} set={(p) => setEdit({ ...edit, ...p })} errors={errors} />
          <Field label="Description"><textarea className="input" rows={2} value={edit.description || ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
          <div className="form-row">
            <Field label="Status"><select className="input" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}><option value="published">Published</option><option value="draft">Draft</option></select></Field>
            <Field label="Sort order"><input className="input" type="number" value={edit.sort_order ?? 0} onChange={(e) => setEdit({ ...edit, sort_order: e.target.value })} /></Field>
          </div>
        </FormModal>
      )}
      {del && (del.n ? (
        <Confirm title="This topic can't be deleted" confirmLabel="Unpublish instead" danger={false} onClose={() => setDel(null)} onConfirm={async () => { await patch(del, { status: 'draft' }, 'Topic unpublished.'); setDel(null); }}>
          <p><strong>{del.name}</strong> has {del.n} question(s). Move or delete them first, or unpublish the topic to hide it.</p>
        </Confirm>
      ) : (
        <Confirm title={`Delete ${del.name}?`} busy={busy} onClose={() => setDel(null)} onConfirm={async () => {
          setBusy(true); try { await admin.remove('topics', del.id); toast('Topic deleted.'); setDel(null); reload(); } catch (e) { toast(e.message, 'error'); } setBusy(false);
        }}><p>This topic has no questions. Deleting it can't be undone.</p></Confirm>
      ))}
    </>
  );
}

// =================================================================== EXAMS
export function ExamsAdmin() {
  const { data, loading, error, reload } = useAsync(async () => {
    const [exams, questions] = await Promise.all([admin.select('exams'), admin.select('questions')]);
    const n = {}; questions.forEach((q) => { if (q.exam_id) n[q.exam_id] = (n[q.exam_id] || 0) + 1; });
    return { exams, n };
  }, []);
  const toast = useToast();
  const [edit, setEdit] = useState(null); const [del, setDel] = useState(null);
  const [errors, setErrors] = useState({}); const [busy, setBusy] = useState(false);
  const open = (e) => { setErrors({}); setEdit(e ? { ...e } : { name: '', slug: '', group_name: '', description: '', status: 'published', sort_order: data.exams.length }); };
  const save = async () => {
    if (busy) return;
    const e = validateSlugged(edit);
    if (data.exams.some((x) => x.slug === edit.slug && x.id !== edit.id)) e.slug = 'Another exam already uses this slug.';
    setErrors(e); if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const row = { name: edit.name.trim(), slug: edit.slug, group_name: edit.group_name?.trim() || null, description: edit.description?.trim() || null, status: edit.status, sort_order: Number(edit.sort_order) || 0 };
      edit.id ? await admin.update('exams', edit.id, row) : await admin.insert('exams', row);
      toast(edit.id ? 'Exam updated.' : 'Exam created.'); setEdit(null); reload();
    } catch (err) { toast(err.message, 'error'); }
    setBusy(false);
  };
  return (
    <>
      <AdminHead title="Exams" sub="Examinations that questions and practice sets can be tagged with.">
        <button className="btn btn-primary" onClick={() => open(null)} disabled={!data}><Plus size={17} /> New exam</button>
      </AdminHead>
      {loading ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : data.exams.length === 0 ? <Empty title="No exams yet" /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Exam</th><th>Group</th><th>Questions</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {data.exams.map((x) => (
                <tr key={x.id}>
                  <td><strong>{x.name}</strong><div className="muted small mono">/exams/{x.slug}</div></td>
                  <td>{x.group_name || '—'}</td>
                  <td><Link to={`/admin/questions?exam=${x.id}`}>{data.n[x.id] || 0}</Link></td>
                  <td><StatusBadge s={x.status} /></td>
                  <td className="row-actions">
                    <button className="icon-btn" aria-label={`Edit ${x.name}`} title="Edit" onClick={() => open(x)}><Pencil size={16} /></button>
                    <button className="icon-btn danger" aria-label={`Delete ${x.name}`} title="Delete" onClick={() => setDel(x)}><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edit && (
        <FormModal title={edit.id ? `Edit ${edit.name}` : 'New exam'} onClose={() => setEdit(null)} onSubmit={save} busy={busy}>
          <NameSlug form={edit} set={(p) => setEdit({ ...edit, ...p })} errors={errors} />
          <div className="form-row">
            <Field label="Group" hint="e.g. SSC, Railway"><input className="input" value={edit.group_name || ''} onChange={(e) => setEdit({ ...edit, group_name: e.target.value })} /></Field>
            <Field label="Status"><select className="input" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}><option value="published">Published</option><option value="draft">Draft</option></select></Field>
          </div>
          <Field label="Description"><textarea className="input" rows={2} value={edit.description || ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
        </FormModal>
      )}
      {del && (
        <Confirm title={`Delete ${del.name}?`} busy={busy} onClose={() => setDel(null)} onConfirm={async () => {
          setBusy(true); try { await admin.remove('exams', del.id); toast('Exam deleted.'); setDel(null); reload(); } catch (e) { toast(e.message, 'error'); } setBusy(false);
        }}>
          <p>{data.n[del.id] ? `${data.n[del.id]} question(s) are tagged with this exam. They will be kept, but lose the exam tag.` : 'No questions use this exam.'} This can't be undone.</p>
        </Confirm>
      )}
    </>
  );
}
