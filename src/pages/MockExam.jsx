import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useLocation } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Clock, Flag, Eraser, Send, Download, ListChecks, RotateCcw, Trophy, LayoutGrid } from 'lucide-react';
import { backend } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useAsync, useMeta, useToast } from '../lib/hooks.js';
import { breakdown, fmtMarks, pct, fmtDateTime, rememberNext } from '../lib/mocks.js';
import { formatDuration } from '../lib/scoring.js';
import { OPTIONS, optKey } from '../lib/text.js';
import { OptionButton } from '../components/QuestionView.jsx';
import { Loading, ErrorState } from '../components/States.jsx';
import { Confirm } from '../components/Modal.jsx';
import Breadcrumbs from '../components/Breadcrumbs.jsx';

// Shared guard: these pages are for signed-in users only (the database enforces it too).
export function useSignedIn() {
  const { user, ready } = useAuth();
  const loc = useLocation();
  if (!ready) return { wait: <Loading /> };
  if (!user) { rememberNext(loc.pathname + loc.search); return { wait: <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} /> }; }
  return { user };
}

export function MockAttempt() {
  const { id } = useParams();
  const g = useSignedIn();
  const { data, loading, error, reload } = useAsync(() => (g.user ? backend.getMockAttempt(id) : Promise.resolve(null)), [id, g.user?.id]);
  useMeta(data ? data.mock.title : 'Mock test', undefined, { noindex: true });
  if (g.wait) return g.wait;
  if (loading || (!data && !error)) return <Loading label="Loading your mock test…" />;
  if (error) return <div className="container section"><ErrorState error={error} onRetry={reload} /></div>;
  if (data.attempt.status === 'submitted') return <Navigate to={`/mock/result/${id}`} replace />;
  if (data.attempt.user_id !== g.user.id) return <Navigate to={`/mock/result/${id}`} replace />;
  return <Exam key={id} data={data} />;
}

function Exam({ data }) {
  const nav = useNavigate();
  const toast = useToast();
  const qs = data.questions;
  const attemptId = data.attempt.id;
  // Server clock decides the time limit; correct for any difference with this device's clock.
  const offset = useMemo(() => Date.parse(data.attempt.server_now) - Date.now(), [data]);
  const expires = Date.parse(data.attempt.expires_at);
  const [now, setNow] = useState(Date.now());
  const remaining = Math.max(0, Math.floor((expires - (now + offset)) / 1000));
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState(() => Object.fromEntries(qs.filter((q) => q.chosen_option).map((q) => [q.id, q.chosen_option])));
  const [marked, setMarked] = useState({});
  const [visited, setVisited] = useState({ [qs[0]?.id]: true });
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(0);
  const [showPalette, setShowPalette] = useState(false);
  const done = useRef(false);
  const q = qs[idx];
  const sections = useMemo(() => {
    const out = [];
    qs.forEach((x, i) => { let s = out.find((y) => y.id === x.subject_id); if (!s) out.push(s = { id: x.subject_id, name: x.subject, first: i, items: [] }); s.items.push(i); });
    return out;
  }, [qs]);
  const answered = Object.values(answers).filter(Boolean).length;

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { if (q) setVisited((v) => ({ ...v, [q.id]: true })); }, [q]);

  const submit = useCallback(async (auto = false) => {
    if (done.current) return;
    done.current = true; setBusy(true); setConfirm(false);
    try {
      await backend.submitMock(attemptId, Object.fromEntries(qs.map((x) => [x.id, answers[x.id] || null])));
      if (auto) toast("Time's up! Your mock test was submitted.", 'info');
      nav(`/mock/result/${attemptId}`, { replace: true });
    } catch (e) { done.current = false; setBusy(false); toast('Could not submit: ' + e.message, 'error'); }
  }, [attemptId, answers, qs, nav, toast]);

  useEffect(() => { if (remaining === 0 && !done.current) submit(true); }, [remaining, submit]);
  useEffect(() => {
    const warn = (e) => { if (!done.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const choose = (L) => {
    const v = answers[q.id] === L ? null : L;       // tap again to clear
    setAnswers((a) => ({ ...a, [q.id]: v }));
    setSaving((n) => n + 1);
    backend.saveMockAnswer(attemptId, q.id, v).catch((e) => toast('Answer not saved: ' + e.message, 'error')).finally(() => setSaving((n) => n - 1));
  };
  const clear = () => { if (answers[q.id]) choose(answers[q.id]); };
  const go = (i) => { setIdx(Math.max(0, Math.min(qs.length - 1, i))); setShowPalette(false); window.scrollTo({ top: 0 }); };
  const low = remaining <= 60;
  const stateOf = (x) => (answers[x.id] ? (marked[x.id] ? 'ans-marked' : 'answered') : marked[x.id] ? 'marked' : visited[x.id] ? 'skipped' : 'fresh');
  const curSection = sections.find((s) => s.items.includes(idx));

  return (
    <div className="container section exam">
      <div className="exam-bar card">
        <div className="exam-title"><strong>{data.mock.title}</strong><span className="muted small">{data.course?.name} · Attempt {data.attempt.attempt_no}</span></div>
        <div className={'exam-timer' + (low ? ' low' : '')} role="timer" aria-live={low ? 'assertive' : 'off'}><Clock size={18} /> {formatDuration(remaining)}</div>
        <button className="btn btn-primary btn-sm" onClick={() => setConfirm(true)} disabled={busy}><Send size={16} /> Submit</button>
      </div>

      <div className="exam-sections" role="tablist" aria-label="Sections">
        {sections.map((s) => (
          <button key={s.id} role="tab" aria-selected={curSection?.id === s.id} className={'chip' + (curSection?.id === s.id ? ' active' : '')} onClick={() => go(s.first)}>
            {s.name} <span className="muted">({s.items.filter((i) => answers[qs[i].id]).length}/{s.items.length})</span>
          </button>
        ))}
      </div>

      <div className="exam-layout">
        <div className="card exam-q">
          <div className="exam-qhead small muted"><span>Question {idx + 1} of {qs.length}</span><span>{q.subject}{q.topic ? ` · ${q.topic}` : ''}</span></div>
          <p className="q-text">{q.question}</p>
          {q.image_url && <img className="q-img" src={q.image_url} alt="" loading="lazy" />}
          <div className="opts">
            {OPTIONS.map((L) => <OptionButton key={L} L={L} text={q[optKey(L)]} selected={answers[q.id] === L} onSelect={choose} disabled={busy} />)}
          </div>
          <div className="exam-actions">
            <button className="btn btn-outline btn-sm" onClick={() => go(idx - 1)} disabled={idx === 0}><ChevronLeft size={16} /> Previous</button>
            <button className={'btn btn-sm ' + (marked[q.id] ? 'btn-warn' : 'btn-ghost')} onClick={() => setMarked((m) => ({ ...m, [q.id]: !m[q.id] }))}><Flag size={16} /> {marked[q.id] ? 'Marked' : 'Mark for review'}</button>
            <button className="btn btn-ghost btn-sm" onClick={clear} disabled={!answers[q.id]}><Eraser size={16} /> Clear</button>
            {idx < qs.length - 1
              ? <button className="btn btn-primary btn-sm" onClick={() => go(idx + 1)}>Save &amp; Next <ChevronRight size={16} /></button>
              : <button className="btn btn-primary btn-sm" onClick={() => setConfirm(true)}><Send size={16} /> Submit test</button>}
          </div>
          <p className="muted small exam-save">{saving ? 'Saving…' : 'Answers are saved automatically.'} {answered}/{qs.length} answered.</p>
        </div>

        <aside className={'card exam-palette' + (showPalette ? ' open' : '')} aria-label="Question palette">
          <div className="palette-head"><strong>Questions</strong><span className="muted small">{answered} answered</span></div>
          {sections.map((s) => (
            <div key={s.id}>
              <div className="small muted palette-sec">{s.name}</div>
              <div className="palette-grid">
                {s.items.map((i) => <button key={i} className={`pal ${stateOf(qs[i])}${i === idx ? ' current' : ''}`} onClick={() => go(i)} aria-label={`Question ${i + 1}`}>{i + 1}</button>)}
              </div>
            </div>
          ))}
          <div className="palette-legend small">
            <span><i className="pal answered" /> Answered</span><span><i className="pal skipped" /> Not answered</span>
            <span><i className="pal marked" /> Marked</span><span><i className="pal fresh" /> Not visited</span>
          </div>
        </aside>
      </div>
      <button className="btn btn-outline palette-toggle" onClick={() => setShowPalette((v) => !v)}><LayoutGrid size={17} /> {showPalette ? 'Hide' : 'Show'} all questions</button>

      {confirm && (
        <Confirm title="Submit this mock test?" confirmLabel={busy ? 'Submitting…' : 'Submit'} danger={false} busy={busy} onClose={() => setConfirm(false)} onConfirm={() => submit(false)}>
          <p>You have answered <strong>{answered}</strong> of {qs.length} questions{qs.length - answered ? `; ${qs.length - answered} are unanswered` : ''}. {Object.values(marked).filter(Boolean).length ? `${Object.values(marked).filter(Boolean).length} marked for review. ` : ''}You can't change answers after submitting.</p>
        </Confirm>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- result
export function MockResult() {
  const { id } = useParams();
  const g = useSignedIn();
  const { isAdmin } = useAuth();
  const { data, loading, error, reload } = useAsync(() => (g.user ? backend.getMockAttempt(id) : Promise.resolve(null)), [id, g.user?.id]);
  const [filter, setFilter] = useState('all');
  useMeta(data ? `Result: ${data.mock.title}` : 'Result', undefined, { noindex: true });
  if (g.wait) return g.wait;
  if (loading || (!data && !error)) return <Loading label="Loading your result…" />;
  if (error) return <div className="container section narrow"><ErrorState error={error} /><p className="center"><Link to="/my/mock-tests">Go to My Mock Tests</Link></p></div>;
  const a = data.attempt;
  const own = a.user_id === g.user.id;
  if (a.status !== 'submitted') return own ? <Navigate to={`/mock/attempt/${id}`} replace /> : <div className="container section narrow"><div className="notice">This attempt is still in progress ({data.student?.name || data.student?.email}). Results appear after it is submitted or its time runs out.</div></div>;
  const qs = data.questions;
  const subj = breakdown(qs, 'subject_id');
  const topics = breakdown(qs, 'topic_id');
  const shown = qs.filter((x) => filter === 'all' || (filter === 'wrong' ? x.chosen_option && !x.is_correct : filter === 'skipped' ? !x.chosen_option : x.is_correct));

  return (
    <div className="container section narrow">
      <Breadcrumbs items={own ? [{ to: '/my/mock-tests', label: 'My Mock Tests' }, { label: 'Result' }] : [{ to: '/admin/mock-attempts', label: 'Mock attempts' }, { label: 'Result' }]} />
      <div className="card result-hero">
        <Trophy size={34} className="result-icon" aria-hidden="true" />
        <span className="muted small">{data.course?.name} · Attempt {a.attempt_no} · {fmtDateTime(a.submitted_at)}</span>
        <h1>{data.mock.title}</h1>
        {!own && <p className="notice small">Admin view: {data.student?.name || 'Student'} ({data.student?.email})</p>}
        <div className="result-score"><strong>{fmtMarks(a.score)}</strong><span>/ {fmtMarks(a.max_score)} marks</span></div>
        <div className="stat-row">
          <div className="stat ok"><strong>{a.correct}</strong><span>Correct</span></div>
          <div className="stat bad"><strong>{a.incorrect}</strong><span>Wrong</span></div>
          <div className="stat"><strong>{a.unanswered}</strong><span>Unanswered</span></div>
          <div className="stat"><strong>{pct(a.correct, a.correct + a.incorrect)}%</strong><span>Accuracy</span></div>
          <div className="stat"><strong>{formatDuration(a.duration_seconds || 0)}</strong><span>Time taken</span></div>
        </div>
        {a.reused_count > 0 && <p className="muted small">{a.reused_count} question{a.reused_count > 1 ? 's were' : ' was'} repeated from earlier attempts because the question bank had no unattempted ones left in that subject.</p>}
        <div className="action-row center">
          <Link className="btn btn-primary" to={`/my/report/${a.id}?print=1`}><Download size={17} /> Download result PDF</Link>
          {own && <Link className="btn btn-outline" to={`/mock-tests/${data.mock.slug}`}><RotateCcw size={17} /> Take another mock</Link>}
          {own && <Link className="btn btn-ghost" to="/my/mock-tests"><ListChecks size={17} /> My Mock Tests</Link>}
        </div>
      </div>

      <h2 className="h3">Subject-wise performance</h2>
      <PerfTable rows={subj} label="Subject" />
      {topics.length > 0 && <><h2 className="h3">Topic-wise performance</h2><PerfTable rows={topics} label="Topic" /></>}

      <h2 className="h3">Answer review</h2>
      <div className="chips">
        {[['all', `All (${qs.length})`], ['correct', `Correct (${a.correct})`], ['wrong', `Wrong (${a.incorrect})`], ['skipped', `Unanswered (${a.unanswered})`]].map(([k, l]) =>
          <button key={k} className={'chip' + (filter === k ? ' active' : '')} onClick={() => setFilter(k)}>{l}</button>)}
      </div>
      {shown.map((x) => (
        <div key={x.id} className="card review-q">
          <div className="small muted">Q{x.position}. {x.subject}{x.topic ? ` · ${x.topic}` : ''} · <span className={x.is_correct ? 'ok-text' : x.chosen_option ? 'err-text' : ''}>{x.is_correct ? 'Correct' : x.chosen_option ? 'Wrong' : 'Not answered'}</span></div>
          <p className="q-text">{x.question}</p>
          <div className="opts">{OPTIONS.map((L) => <OptionButton key={L} L={L} text={x[optKey(L)]} selected={x.chosen_option === L} reveal correct={x.correct_option === L} disabled onSelect={() => {}} />)}</div>
          {x.explanation && <p className="explain small"><strong>Explanation:</strong> {x.explanation}</p>}
        </div>
      ))}
      {isAdmin && own && <p className="muted small">Signed in as an administrator.</p>}
    </div>
  );
}

export function PerfTable({ rows, label }) {
  return (
    <div className="table-wrap"><table className="table perf-table">
      <thead><tr><th>{label}</th><th>Questions</th><th>Attempted</th><th>Correct</th><th>Wrong</th><th>Accuracy</th></tr></thead>
      <tbody>{rows.map((r) => (
        <tr key={r.id}><td>{r.name}</td><td>{r.total}</td><td>{r.attempted}</td><td>{r.correct}</td><td>{r.incorrect}</td>
          <td><div className="bar" aria-hidden="true"><i style={{ width: `${r.accuracy}%` }} /></div> {r.accuracy}%</td></tr>
      ))}</tbody>
    </table></div>
  );
}
