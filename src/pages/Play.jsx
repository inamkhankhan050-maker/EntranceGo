import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Flag, Clock, Trophy, RotateCcw, Bookmark, BookmarkCheck, ListChecks } from 'lucide-react';
import { getPracticeQuestions, backend } from '../lib/api.js';
import { useAsync, useMeta, useToast } from '../lib/hooks.js';
import { useAuth } from '../lib/auth.jsx';
import { computeResult, formatDuration } from '../lib/scoring.js';
import { OPTIONS, optKey, cap, plural } from '../lib/text.js';
import { IS_DEMO } from '../lib/config.js';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import { OptionButton } from '../components/QuestionView.jsx';
import { Loading, ErrorState, Empty, NotFoundBlock } from '../components/States.jsx';
import { Confirm } from '../components/Modal.jsx';
import Discussion from '../components/Discussion.jsx';

export default function Play() {
  const [params] = useSearchParams();
  const source = { type: params.get('type'), slug: params.get('slug'), subject: params.get('subject') };
  const initialMode = params.get('mode') === 'test' ? 'test' : 'practice';
  const { data, loading, error, reload } = useAsync(() => getPracticeQuestions(source), [source.type, source.slug, source.subject]);
  useMeta(data ? `${data.title} – ${initialMode === 'test' ? 'Test' : 'Practice'}` : 'Practice', undefined, { noindex: true });

  if (loading) return <Loading label="Preparing your questions…" />;
  if (error) return <div className="container section"><ErrorState error={error} onRetry={reload} /></div>;
  if (!data) return <NotFoundBlock what="practice session" />;
  if (!data.questions.length) return <div className="container section"><Empty title="No published questions here yet" action={<Link className="btn btn-primary" to="/subjects">Browse subjects</Link>} /></div>;
  return <Session key={`${source.type}:${source.slug}:${initialMode}`} data={data} source={source} initialMode={initialMode} />;
}

function Session({ data, source, initialMode }) {
  const toast = useToast();
  const { user } = useAuth();
  const [mode] = useState(initialMode);
  const [round, setRound] = useState({ questions: data.questions, title: data.title, retry: false });
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState({});   // selected option per question
  const [checked, setChecked] = useState({});   // practice mode: answer submitted & locked
  const [marked, setMarked] = useState({});
  const [result, setResult] = useState(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [now, setNow] = useState(Date.now());
  const [saveState, setSaveState] = useState('');
  const submittedRef = useRef(false);            // guards against double submission
  const qs = round.questions;
  const q = qs[idx];
  const limitSec = mode === 'test' && !round.retry && data.timeLimit ? data.timeLimit * 60 : null;
  const elapsed = Math.floor((now - startedAt) / 1000);
  const remaining = limitSec ? Math.max(0, limitSec - elapsed) : null;

  useEffect(() => { if (result) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [result]);

  const finish = useCallback(async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setConfirmSubmit(false);
    const scored = mode === 'practice' ? Object.fromEntries(Object.entries(answers).filter(([id]) => checked[id])) : answers;
    const r = computeResult(qs, scored);
    const duration = Math.floor((Date.now() - startedAt) / 1000);
    setResult({ ...r, duration, answers: scored });
    window.scrollTo(0, 0);
    if (IS_DEMO || user) {
      setSaveState('saving');
      try {
        await backend.saveAttempt({
          source_type: round.retry ? 'retry' : source.type, source_slug: source.slug, title: round.title, mode,
          total: r.total, correct: r.correct, incorrect: r.incorrect, unanswered: r.unanswered, duration_seconds: duration,
          answers: scored,
        });
        setSaveState('saved');
      } catch (e) { setSaveState('error'); toast('Your result could not be saved: ' + e.message, 'error'); }
    } else setSaveState('guest');
  }, [answers, checked, qs, mode, startedAt, user, round, source, toast]);

  // auto-submit when the timer runs out
  useEffect(() => { if (remaining === 0 && !result) { toast("Time's up! Your test has been submitted.", 'info'); finish(); } }, [remaining, result, finish, toast]);

  // warn before leaving an unfinished session
  useEffect(() => {
    if (result || !Object.keys(answers).length) return;
    const h = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [answers, result]);

  const locked = mode === 'practice' && checked[q?.id];
  const select = (L) => { if (!result && !locked) setAnswers((a) => ({ ...a, [q.id]: L })); };
  const checkAnswer = () => { if (answers[q.id] && !checked[q.id]) setChecked((c) => ({ ...c, [q.id]: true })); };
  const go = (i) => setIdx(Math.max(0, Math.min(qs.length - 1, i)));

  // keyboard: 1-4 / A-D choose, Enter checks (practice), arrows move
  useEffect(() => {
    if (result) return;
    const h = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toUpperCase();
      const i = ['1', '2', '3', '4'].indexOf(k);
      if (i >= 0) select(OPTIONS[i]); else if (OPTIONS.includes(k)) select(k);
      else if (e.key === 'ArrowRight') go(idx + 1); else if (e.key === 'ArrowLeft') go(idx - 1);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  const restart = (questions, retry) => {
    submittedRef.current = false;
    setRound({ questions, title: retry ? `${data.title} (retry)` : data.title, retry });
    setIdx(0); setAnswers({}); setChecked({}); setMarked({}); setResult(null); setSaveState('');
    setStartedAt(Date.now()); setNow(Date.now()); window.scrollTo(0, 0);
  };

  const answeredCount = Object.keys(mode === 'practice' ? checked : answers).length;

  if (result) return <Results data={data} round={round} mode={mode} result={result} saveState={saveState} onRestart={restart} />;

  return (
    <div className="container section play">
      <Breadcrumbs items={[...data.crumbs, { label: mode === 'test' ? 'Test' : 'Practice' }]} />
      <div className="play-top">
        <div>
          <h1 className="play-title">{round.title}</h1>
          <span className={`mode-badge ${mode}`}>{mode === 'test' ? 'Test mode' : 'Practice mode'}</span>
        </div>
        <div className={'timer' + (remaining != null && remaining < 60 ? ' urgent' : '')} aria-live="off">
          <Clock size={17} aria-hidden="true" />
          <span>{remaining != null ? formatDuration(remaining) + ' left' : formatDuration(elapsed)}</span>
        </div>
      </div>
      <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={qs.length} aria-valuenow={answeredCount} aria-label="Questions answered">
        <span style={{ width: `${(answeredCount / qs.length) * 100}%` }} />
      </div>
      <p className="muted small">{answeredCount} of {qs.length} answered</p>

      <div className="play-grid">
        <section className="card q-card" aria-labelledby="q-title">
          <div className="q-head">
            <span className="q-num">Question {idx + 1} of {qs.length}</span>
            <span className={`diff diff-${q.difficulty}`}>{cap(q.difficulty)}</span>
          </div>
          <h2 id="q-title" className="q-text">{q.question}</h2>
          {q.image_url && <img className="q-img" src={q.image_url} alt="Figure for this question" />}
          <div className="opts" role="group" aria-label="Answer options">
            {OPTIONS.map((L) => (
              <OptionButton key={L} L={L} text={q[optKey(L)]} selected={answers[q.id] === L}
                reveal={locked} correct={q.correct_option === L} disabled={locked} onSelect={select} />
            ))}
          </div>

          {locked && (
            <div className={'feedback ' + (answers[q.id] === q.correct_option ? 'ok' : 'bad')} role="status">
              <strong>{answers[q.id] === q.correct_option ? 'Correct!' : `Incorrect. The answer is ${q.correct_option}.`}</strong>
              {q.explanation && <p>{q.explanation}</p>}
            </div>
          )}

          <div className="q-actions">
            <button className="btn btn-ghost btn-sm" onClick={() => setMarked((m) => ({ ...m, [q.id]: !m[q.id] }))} aria-pressed={!!marked[q.id]}>
              <Flag size={16} /> {marked[q.id] ? 'Marked' : 'Mark for review'}
            </button>
            <div className="spacer" />
            <button className="btn btn-outline" onClick={() => go(idx - 1)} disabled={idx === 0}><ChevronLeft size={17} /> Prev</button>
            {mode === 'practice' && !locked
              ? <button className="btn btn-primary" onClick={checkAnswer} disabled={!answers[q.id]}>Submit answer</button>
              : idx < qs.length - 1
                ? <button className="btn btn-primary" onClick={() => go(idx + 1)}>Next <ChevronRight size={17} /></button>
                : <button className="btn btn-primary" onClick={() => setConfirmSubmit(true)}>Finish</button>}
          </div>
        </section>

        <aside className="card palette" aria-label="Question navigator">
          <h2 className="palette-title">Questions</h2>
          <div className="palette-grid">
            {qs.map((x, i) => {
              let cls = 'pal';
              if (mode === 'practice' && checked[x.id]) cls += answers[x.id] === x.correct_option ? ' p-correct' : ' p-wrong';
              else if (answers[x.id]) cls += ' p-answered';
              if (marked[x.id]) cls += ' p-marked';
              if (i === idx) cls += ' p-current';
              return <button key={x.id} className={cls} onClick={() => go(i)} aria-label={`Question ${i + 1}${answers[x.id] ? ', answered' : ''}${marked[x.id] ? ', marked for review' : ''}`} aria-current={i === idx}>{i + 1}</button>;
            })}
          </div>
          <ul className="legend small muted">
            <li><span className="pal p-answered" /> Answered</li>
            <li><span className="pal p-marked" /> Marked</li>
            {mode === 'practice' && <><li><span className="pal p-correct" /> Correct</li><li><span className="pal p-wrong" /> Wrong</li></>}
          </ul>
          <button className="btn btn-primary btn-block" onClick={() => setConfirmSubmit(true)}>{mode === 'test' ? 'Submit test' : 'Finish practice'}</button>
        </aside>
      </div>

      {confirmSubmit && (
        <Confirm title={mode === 'test' ? 'Submit test?' : 'Finish practice?'} confirmLabel="Submit" danger={false} onConfirm={finish} onClose={() => setConfirmSubmit(false)}>
          <p>You have answered {answeredCount} of {qs.length} questions{Object.values(marked).filter(Boolean).length ? `, with ${plural(Object.values(marked).filter(Boolean).length, 'question')} marked for review` : ''}.</p>
          {answeredCount < qs.length && <p>Unanswered questions will be counted as unanswered.</p>}
        </Confirm>
      )}
    </div>
  );
}

function Results({ data, round, mode, result, saveState, onRestart }) {
  const [filter, setFilter] = useState('all');
  const [bookmarks, setBookmarks] = useState(null);
  // Briefly ignore taps so a double-tap on "Submit" cannot trigger "Retake all".
  const [armed, setArmed] = useState(false);
  useEffect(() => { const t = setTimeout(() => setArmed(true), 600); return () => clearTimeout(t); }, []);
  const { user } = useAuth();
  const toast = useToast();
  const canBookmark = IS_DEMO || !!user;
  useEffect(() => { if (canBookmark) backend.listBookmarks().then((b) => setBookmarks(new Set(b))).catch(() => setBookmarks(new Set())); }, [canBookmark]);

  const byId = useMemo(() => Object.fromEntries(result.detail.map((d) => [d.id, d])), [result]);
  const list = round.questions.filter((q) => filter === 'all' || byId[q.id]?.state === filter);
  const wrong = round.questions.filter((q) => byId[q.id]?.state !== 'correct');
  const toggle = async (id) => {
    const on = !bookmarks.has(id);
    try { await backend.toggleBookmark(id, on); setBookmarks((b) => { const n = new Set(b); on ? n.add(id) : n.delete(id); return n; }); }
    catch (e) { toast(e.message, 'error'); }
  };

  return (
    <div className="container section narrow">
      <Breadcrumbs items={[...data.crumbs, { label: 'Result' }]} />
      <section className="card result-card">
        <Trophy size={34} className="trophy" aria-hidden="true" />
        <h1>{round.title}</h1>
        <p className="muted">{mode === 'test' ? 'Test' : 'Practice'} completed in {formatDuration(result.duration)}</p>
        <div className="score-big"><span>{result.score}%</span><small>score</small></div>
        <div className="stat-row">
          <div className="stat ok"><strong>{result.correct}</strong><span>Correct</span></div>
          <div className="stat bad"><strong>{result.incorrect}</strong><span>Incorrect</span></div>
          <div className="stat"><strong>{result.unanswered}</strong><span>Unanswered</span></div>
          <div className="stat"><strong>{result.accuracy}%</strong><span>Accuracy</span></div>
        </div>
        <p className="small muted">
          {saveState === 'saving' && 'Saving your result…'}
          {saveState === 'saved' && (IS_DEMO ? 'Result saved on this device. ' : 'Result saved to your account. ')}
          {saveState === 'saved' && <Link to="/progress">View progress</Link>}
          {saveState === 'guest' && <><Link to="/login">Sign in</Link> to save results and bookmarks.</>}
          {saveState === 'error' && 'This result could not be saved.'}
        </p>
        <div className="action-row center">
          {wrong.length > 0 && <button className="btn btn-primary" disabled={!armed} onClick={() => onRestart(wrong, true)}><RotateCcw size={17} /> Retry {plural(wrong.length, 'incorrect / skipped question')}</button>}
          <button className="btn btn-outline" disabled={!armed} onClick={() => onRestart(data.questions, false)}>Retake all</button>
          <Link className="btn btn-ghost" to={data.crumbs[data.crumbs.length - 1].to}>Done</Link>
        </div>
      </section>

      <section className="block">
        <div className="section-head">
          <h2><ListChecks size={20} aria-hidden="true" /> Review answers</h2>
          <div className="seg" role="tablist" aria-label="Filter review">
            {[['all', 'All'], ['correct', 'Correct'], ['incorrect', 'Incorrect'], ['unanswered', 'Unanswered']].map(([k, l]) => (
              <button key={k} role="tab" aria-selected={filter === k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>
            ))}
          </div>
        </div>
        {list.length === 0 && <Empty title="Nothing in this filter" />}
        <div className="q-stack">
          {list.map((q) => {
            const d = byId[q.id]; const n = round.questions.indexOf(q) + 1;
            return (
              <article key={q.id} className={`q-review ${d.state}`}>
                <div className="q-head">
                  <span className="q-num">Q{n}.</span>
                  <span className={`state-tag ${d.state}`}>{cap(d.state)}</span>
                  <div className="spacer" />
                  {canBookmark && bookmarks && (
                    <button className="icon-btn" onClick={() => toggle(q.id)} aria-label={bookmarks.has(q.id) ? 'Remove bookmark' : 'Bookmark question'} aria-pressed={bookmarks.has(q.id)}>
                      {bookmarks.has(q.id) ? <BookmarkCheck size={19} /> : <Bookmark size={19} />}
                    </button>
                  )}
                </div>
                <p className="q-text">{q.question}</p>
                <ol className="opt-list">
                  {OPTIONS.map((L) => (
                    <li key={L} className={'opt-static' + (q.correct_option === L ? ' correct' : '') + (d.answer === L && d.answer !== q.correct_option ? ' wrong' : '')}>
                      <span className="opt-letter">{L}</span><span>{q[optKey(L)]}</span>
                      {d.answer === L && <span className="you">Your answer</span>}
                    </li>
                  ))}
                </ol>
                {q.explanation && <div className="explain"><strong>Explanation</strong><p>{q.explanation}</p></div>}
                <Discussion qid={q.id} />
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
