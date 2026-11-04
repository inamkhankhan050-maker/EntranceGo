import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Upload, CheckCircle2, XCircle, MinusCircle, FileText } from 'lucide-react';
import { admin } from '../lib/api.js';
import { useAsync, useToast } from '../lib/hooks.js';
import { parseQuestionCSV, buildImportRows, SAMPLE_CSV, CSV_COLUMNS, REQUIRED_COLUMNS, downloadText } from '../lib/csv.js';
import { extractQuestions, sniffKind, DOC_SAMPLE, DOC_MAX_BYTES } from '../lib/docImport.js';
import { AdminHead, Field } from './common.jsx';
import { Loading, ErrorState } from '../components/States.jsx';

const MAX_BYTES = 5 * 1024 * 1024;

export default function ImportCSV() {
  const toast = useToast();
  const { data: L, loading, error, reload } = useAsync(async () => {
    const [l, qs] = await Promise.all([admin.lookups(), admin.select('questions')]);
    return { ...l, existing: qs.map((q) => ({ subject_id: q.subject_id, question: q.question })) };
  }, []);
  const [file, setFile] = useState(null);
  const [kind, setKind] = useState(null);
  const [csvParsed, setCsvParsed] = useState(null);
  const [doc, setDoc] = useState(null); // { records, fileErrors }
  const [reading, setReading] = useState(false);
  const [opts, setOpts] = useState({ subject: '', topic: '', exam: '', difficulty: 'medium', status: 'draft' });
  const setOpt = (k, v) => setOpts((o) => ({ ...o, [k]: v, ...(k === 'subject' ? { topic: '' } : {}) }));
  const [view, setView] = useState('all');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [summary, setSummary] = useState(null);
  const inputRef = useRef();

  const fail = (msg) => { setKind('csv'); setCsvParsed({ rows: [], fileErrors: [msg] }); };
  const onFile = async (f) => {
    setSummary(null); setCsvParsed(null); setDoc(null); setKind(null); setView('all'); setFile(f || null);
    if (inputRef.current) inputRef.current.value = ''; // so picking the same file again still fires
    if (!f) return;
    const k = await sniffKind(f);
    if (k === 'doc') return fail('Old Word (.doc) files are not supported. In Word, use Save As → Word Document (.docx) and upload that.');
    if (!k) return fail('Please choose a CSV, Word (.docx) or PDF file.');
    if (k === 'csv') {
      if (f.size > MAX_BYTES) return fail('File is larger than 5 MB. Split it into smaller files.');
      setKind('csv'); setCsvParsed(parseQuestionCSV(await f.text(), L)); return;
    }
    if (f.size > DOC_MAX_BYTES) return fail('File is larger than 10 MB. Split it into smaller files.');
    setReading(true);
    try {
      const { records, warnings, empty } = await Promise.race([
        extractQuestions(f, k),
        new Promise((_, rej) => setTimeout(() => rej(new Error('reading took too long')), 90000)),
      ]);
      const fileErrors = [];
      if (empty) fileErrors.push(k === 'pdf' ? 'No text found in this PDF. It may be a scanned image; use a PDF made from Word or typed text.' : 'This Word file has no text.');
      setKind(k); setDoc({ records, fileErrors: [...fileErrors, ...warnings] });
    } catch (e) {
      fail(`Could not read this file (${e.message || 'unknown error'}). Make sure it is a valid, unlocked ${k === 'pdf' ? 'PDF' : 'Word .docx'} file.`);
    }
    setReading(false);
  };

  const isDoc = kind === 'docx' || kind === 'pdf';
  const subjectObj = L?.subjects.find((x) => x.id === opts.subject);
  const docParsed = useMemo(() => {
    if (!isDoc || !doc || !L) return null;
    if (!doc.records.length) return { rows: [], fileErrors: doc.fileErrors };
    if (!subjectObj) return { rows: [], fileErrors: doc.fileErrors, needSubject: true, count: doc.records.length };
    const topic = L.topics.find((t) => t.id === opts.topic);
    const exam = L.exams.find((x) => x.id === opts.exam);
    const records = doc.records.map((r) => ({ ...r, subject: subjectObj.slug, topic: topic?.slug || '', exam: exam?.slug || '', difficulty: opts.difficulty, status: opts.status }));
    return { rows: buildImportRows(records, L), fileErrors: doc.fileErrors };
  }, [isDoc, doc, L, subjectObj, opts]);
  const parsed = isDoc ? docParsed : csvParsed;

  const valid = parsed?.rows.filter((r) => r.state === 'valid') || [];
  const invalid = parsed?.rows.filter((r) => r.state === 'invalid') || [];
  const dups = parsed?.rows.filter((r) => r.state === 'duplicate') || [];
  const shown = parsed?.rows.filter((r) => view === 'all' || r.state === view) || [];

  const run = async () => {
    if (busy || !valid.length) return;
    setBusy(true); setProgress([0, valid.length]);
    try {
      const r = await admin.importQuestions(valid, (d, t) => setProgress([d, t]));
      setSummary({ created: r.created.length, failed: [...invalid.map((x) => ({ rowNumber: x.rowNumber, error: x.errors.join(' ') })), ...r.failed], skipped: dups.map((x) => ({ rowNumber: x.rowNumber, error: x.errors.join(' ') })), isDoc });
      toast(`Imported ${r.created.length} question${r.created.length === 1 ? '' : 's'}.`);
      setCsvParsed(null); setDoc(null); setKind(null); setFile(null); if (inputRef.current) inputRef.current.value = '';
      reload();
    } catch (e) { toast(e.message, 'error'); }
    setBusy(false); setProgress(null);
  };

  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <>
      <AdminHead title="Bulk import" sub="Add many questions at once from a CSV, Word (.docx) or PDF file. Nothing is saved until you confirm.">
        <button className="btn btn-outline" onClick={() => downloadText('entrancego-sample.csv', SAMPLE_CSV)}><Download size={17} /> Sample CSV</button>
      </AdminHead>

      <section className="card">
        <h2>1. Prepare your file</h2>
        <h3 className="import-h3"><FileText size={17} aria-hidden="true" /> Word (.docx) or PDF</h3>
        <p className="small">Write each question in this pattern. Number every question, give four options A) to D), then the answer. Explanation is optional.</p>
        <pre className="doc-sample" aria-label="Word or PDF format example">{DOC_SAMPLE}</pre>
        <ul className="small muted bullets">
          <li>Also understood: <code>Q1.</code>, <code>(a)</code>, <code>A.</code>, options on one line, <code>Ans: (b)</code>, <code>Correct Answer: 25%</code>, <code>Solution:</code>, and Word&apos;s automatic numbering.</li>
          <li>Table exports from quiz apps also work: rows labelled <code>Question</code>, <code>Option</code> (with Correct / Incorrect) and <code>Solution</code>.</li>
          <li>You choose the subject, topic, difficulty and status once for the whole file after uploading.</li>
          <li>Scanned or photo PDFs can&apos;t be read. Use a PDF saved from Word or typed text. Old <code>.doc</code> files must be saved as <code>.docx</code>.</li>
        </ul>
        <h3 className="import-h3">CSV</h3>
        <p className="small">Required columns: <code>{REQUIRED_COLUMNS.join(', ')}</code>. Optional: <code>{CSV_COLUMNS.filter((c) => !REQUIRED_COLUMNS.includes(c)).join(', ')}</code>.</p>
        <ul className="small muted bullets">
          <li><code>subject</code>, <code>topic</code> and <code>exam</code> accept a slug (e.g. <code>aptitude</code>) or the exact name. Topics must already exist under that subject.</li>
          <li><code>correct_option</code> is A, B, C or D. <code>difficulty</code> is easy, medium or hard (default medium). <code>status</code> is draft or published (default draft).</li>
          <li>Separate multiple <code>tags</code> with semicolons. Save the file as UTF-8 CSV so ₹, × and other symbols survive.</li>
        </ul>
      </section>

      <section className="card">
        <h2>2. Upload and check</h2>
        <label className="dropzone">
          <Upload size={22} aria-hidden="true" />
          <span>{reading ? 'Reading file…' : file ? file.name : 'Choose a CSV, Word or PDF file'}</span>
          <input ref={inputRef} type="file" onChange={(e) => onFile(e.target.files[0])} disabled={reading} />
        </label>
        {isDoc && doc?.records.length > 0 && (
          <div className="doc-opts">
            <p className="small"><strong>{doc.records.length} question{doc.records.length === 1 ? '' : 's'} found.</strong> Choose where they go:</p>
            <div className="form-row">
              <Field label="Subject" required><select className="input" value={opts.subject} onChange={(e) => setOpt('subject', e.target.value)}><option value="">Choose…</option>{L.subjects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
              <Field label="Topic"><select className="input" value={opts.topic} onChange={(e) => setOpt('topic', e.target.value)} disabled={!opts.subject}><option value="">No topic</option>{L.topics.filter((t) => t.subject_id === opts.subject).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
            </div>
            <div className="form-row">
              <Field label="Difficulty"><select className="input" value={opts.difficulty} onChange={(e) => setOpt('difficulty', e.target.value)}><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></Field>
              <Field label="Status"><select className="input" value={opts.status} onChange={(e) => setOpt('status', e.target.value)}><option value="draft">Draft</option><option value="published">Published</option></select></Field>
              <Field label="Related exam"><select className="input" value={opts.exam} onChange={(e) => setOpt('exam', e.target.value)}><option value="">None</option>{L.exams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
            </div>
            {parsed?.needSubject && <p className="small warn-text">Choose a subject to check the questions.</p>}
          </div>
        )}
        {parsed?.fileErrors.length > 0 && <div className="notice err" role="alert">{parsed.fileErrors.map((e, i) => <div key={i}>{e}</div>)}</div>}
        {parsed?.rows.length > 0 && (
          <>
            <div className="import-summary">
              <button className={view === 'all' ? 'on' : ''} onClick={() => setView('all')}>{parsed.rows.length} {isDoc ? 'questions' : 'rows'}</button>
              <button className={'ok ' + (view === 'valid' ? 'on' : '')} onClick={() => setView('valid')}><CheckCircle2 size={16} /> {valid.length} ready</button>
              <button className={'bad ' + (view === 'invalid' ? 'on' : '')} onClick={() => setView('invalid')}><XCircle size={16} /> {invalid.length} with errors</button>
              <button className={'warn ' + (view === 'duplicate' ? 'on' : '')} onClick={() => setView('duplicate')}><MinusCircle size={16} /> {dups.length} duplicates</button>
            </div>
            <div className="table-wrap tall">
              <table className="table">
                <thead><tr><th>{isDoc ? 'Q' : 'Row'}</th><th>Question</th><th>Subject / topic</th><th>Answer</th><th>Status</th><th>Check</th></tr></thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.rowNumber} className={'row-' + r.state}>
                      <td className="mono">{r.rowNumber}</td>
                      <td className="q-cell"><span className="clamp-2">{r.data.question || <em className="muted">empty</em>}</span>{r.state !== 'valid' && <div className={'row-err small ' + (r.state === 'duplicate' ? 'warn-text' : 'err-text')}>{r.errors.join(' ')}</div>}</td>
                      <td className="small">{r.label.subject}{r.label.topic && <div className="muted">{r.label.topic}</div>}</td>
                      <td className="mono">{r.data.correct_option}</td>
                      <td className="small">{r.data.status}</td>
                      <td className="small">{r.state === 'valid' ? <span className="ok-text">Ready</span> : <span className={r.state === 'duplicate' ? 'warn-text' : 'err-text'}>{r.errors.join(' ')}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="form-actions">
              {progress && <span className="muted small">Importing {progress[0]} / {progress[1]}…</span>}
              <button className="btn btn-primary" disabled={busy || !valid.length} onClick={run}>{busy ? 'Importing…' : `Import ${valid.length} valid question${valid.length === 1 ? '' : 's'}`}</button>
            </div>
            {(invalid.length > 0 || dups.length > 0) && <p className="small muted">Rows with errors and duplicates will be skipped. Fix them in your file and upload again to add them.</p>}
          </>
        )}
      </section>

      {summary && (
        <section className="card" aria-live="polite">
          <h2>Import summary</h2>
          <div className="stat-row">
            <div className="stat ok"><strong>{summary.created}</strong><span>Created</span></div>
            <div className="stat"><strong>{summary.skipped.length}</strong><span>Skipped (duplicates)</span></div>
            <div className="stat bad"><strong>{summary.failed.length}</strong><span>Failed</span></div>
          </div>
          {[...summary.failed, ...summary.skipped].length > 0 && (
            <ul className="small bullets">{[...summary.failed, ...summary.skipped].sort((a, b) => a.rowNumber - b.rowNumber).map((f) => <li key={f.rowNumber}><strong>{summary.isDoc ? 'Question' : 'Row'} {f.rowNumber}:</strong> {f.error}</li>)}</ul>
          )}
          <Link className="btn btn-outline" to="/admin/questions">View questions</Link>
        </section>
      )}
    </>
  );
}
