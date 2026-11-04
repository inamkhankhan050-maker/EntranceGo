import { useEffect } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { PlayCircle, Download, TrendingUp, Trophy, Target, ListChecks, Printer, FileBarChart } from 'lucide-react';
import { backend } from '../lib/api.js';
import { useAsync, useMeta } from '../lib/hooks.js';
import { getMyMockData, breakdown, fmtMarks, pct, fmtDateTime, availability } from '../lib/mocks.js';
import { formatDuration } from '../lib/scoring.js';
import { OPTIONS, optKey } from '../lib/text.js';
import { useSignedIn, PerfTable } from './MockExam.jsx';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import { Loading, ErrorState, Empty } from '../components/States.jsx';

const scorePct = (a) => pct(Number(a.score), Number(a.max_score));

function MyTabs({ cur }) {
  return (
    <div className="chips my-tabs">
      <Link className={'chip' + (cur === 'tests' ? ' active' : '')} to="/my/mock-tests"><ListChecks size={15} /> My Mock Tests</Link>
      <Link className={'chip' + (cur === 'perf' ? ' active' : '')} to="/my/performance"><TrendingUp size={15} /> My Performance</Link>
    </div>
  );
}

export function MyMockTests() {
  useMeta('My Mock Tests', undefined, { noindex: true });
  const g = useSignedIn();
  const { data, loading, error, reload } = useAsync(() => (g.user ? getMyMockData(g.user.id) : Promise.resolve(null)), [g.user?.id]);
  if (g.wait) return g.wait;
  if (loading || (!data && !error)) return <Loading />;
  if (error) return <div className="container section"><ErrorState error={error} onRetry={reload} /></div>;
  const d = data;
  const attemptsOf = (mid) => d.attempts.filter((a) => a.mock_id === mid);
  return (
    <div className="container section">
      <Breadcrumbs items={[{ label: 'My Mock Tests' }]} />
      <div className="section-head"><div><h1>My Mock Tests</h1><p className="muted small">Signed in as {g.user.email}. Only you can see these results.</p></div></div>
      <MyTabs cur="tests" />
      <div className="stat-row">
        <div className="stat"><strong>{d.submitted.length}</strong><span>Mocks completed</span></div>
        <div className="stat ok"><strong>{d.best ? `${fmtMarks(d.best.score)}/${fmtMarks(d.best.max_score)}` : '–'}</strong><span>Best score</span></div>
        <div className="stat"><strong>{d.latest ? `${fmtMarks(d.latest.score)}/${fmtMarks(d.latest.max_score)}` : '–'}</strong><span>Latest score</span></div>
        <div className="stat"><strong>{d.submitted.length ? `${d.accuracy}%` : '–'}</strong><span>Average accuracy</span></div>
      </div>

      {d.inProgress.length > 0 && (
        <div className="notice">You have an unfinished mock: {d.inProgress.map((a) => <Link key={a.id} to={`/mock/attempt/${a.id}`}> {d.mockById[a.mock_id]?.title || 'Mock test'} (resume)</Link>)}</div>
      )}

      <h2 className="h3">Available mock tests</h2>
      {!d.catalog.mocks.length ? <Empty title="No mock tests published yet" /> : (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Mock test</th><th>Course</th><th>Questions</th><th>Attempts</th><th>Best</th><th><span className="sr-only">Action</span></th></tr></thead>
          <tbody>{d.catalog.mocks.map((m) => {
            const mine = attemptsOf(m.id); const done = mine.filter((a) => a.status === 'submitted');
            const best = done.length ? done.reduce((b, a) => (scorePct(a) > scorePct(b) ? a : b)) : null;
            const av = availability(m); const left = m.max_attempts ? m.max_attempts - mine.length : null;
            return (
              <tr key={m.id}>
                <td><Link to={`/mock-tests/${m.slug}`}>{m.title}</Link></td><td>{m.course.name}</td><td>{m.total_questions} · {m.duration_minutes} min</td>
                <td>{mine.length}{m.max_attempts ? ` / ${m.max_attempts}` : ''}</td>
                <td>{best ? `${fmtMarks(best.score)}/${fmtMarks(best.max_score)}` : '–'}</td>
                <td>{av.open && (left == null || left > 0) ? <Link className="btn btn-primary btn-sm" to={`/mock-tests/${m.slug}`}><PlayCircle size={15} /> {mine.length ? 'Take again' : 'Start'}</Link> : <span className="muted small">{av.open ? 'No attempts left' : av.label}</span>}</td>
              </tr>);
          })}</tbody>
        </table></div>
      )}

      <h2 className="h3">Completed mock tests</h2>
      {!d.perMock.length ? <Empty title="No completed mocks yet" action={<Link className="btn btn-primary" to="/mock-tests">Browse mock tests</Link>}>Your scores and reports appear here after you submit a mock.</Empty> : (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Mock test</th><th>Attempts</th><th>Best score</th><th>Latest score</th><th>Latest on</th></tr></thead>
          <tbody>{d.perMock.map((b) => (
            <tr key={b.mock_id}><td>{b.mock?.title || 'Mock test'}</td><td>{b.attempts.length}</td>
              <td>{fmtMarks(b.best.score)}/{fmtMarks(b.best.max_score)} <span className="muted small">({scorePct(b.best)}%)</span></td>
              <td>{fmtMarks(b.latest.score)}/{fmtMarks(b.latest.max_score)}</td><td>{fmtDateTime(b.latest.submitted_at)}</td></tr>
          ))}</tbody>
        </table></div>
      )}

      <h2 className="h3">Previous attempts &amp; reports</h2>
      {!d.submitted.length ? <p className="muted small">No attempts yet.</p> : (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Mock test</th><th>Attempt</th><th>Score</th><th>Correct / Wrong / Skipped</th><th>Time</th><th>Date</th><th>Reports</th></tr></thead>
          <tbody>{d.submitted.map((a) => (
            <tr key={a.id}>
              <td>{d.mockById[a.mock_id]?.title || 'Mock test'}</td><td>#{a.attempt_no}</td>
              <td><strong>{fmtMarks(a.score)}</strong>/{fmtMarks(a.max_score)}</td>
              <td>{a.correct} / {a.incorrect} / {a.unanswered}</td><td>{formatDuration(a.duration_seconds || 0)}</td><td>{fmtDateTime(a.submitted_at)}</td>
              <td className="row-actions"><Link className="btn btn-ghost btn-sm" to={`/mock/result/${a.id}`}>View</Link><Link className="btn btn-outline btn-sm" to={`/my/report/${a.id}?print=1`}><Download size={14} /> PDF</Link></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}

      {d.subjects.length > 0 && <><h2 className="h3">Subject-wise performance (all mocks)</h2><PerfTable rows={d.subjects} label="Subject" />
        <p><Link className="btn btn-outline" to="/my/analysis?print=1"><FileBarChart size={17} /> Download detailed performance analysis (PDF)</Link></p></>}
    </div>
  );
}

export function MyPerformance() {
  useMeta('My Performance', undefined, { noindex: true });
  const g = useSignedIn();
  const { data, loading, error, reload } = useAsync(() => (g.user ? getMyMockData(g.user.id) : Promise.resolve(null)), [g.user?.id]);
  if (g.wait) return g.wait;
  if (loading || (!data && !error)) return <Loading />;
  if (error) return <div className="container section"><ErrorState error={error} onRetry={reload} /></div>;
  const d = data;
  const series = [...d.submitted].reverse();   // oldest -> newest
  return (
    <div className="container section">
      <Breadcrumbs items={[{ to: '/my/mock-tests', label: 'My Mock Tests' }, { label: 'My Performance' }]} />
      <div className="section-head"><div><h1>My Performance</h1><p className="muted small">How your mock scores change over time.</p></div>
        {d.submitted.length > 0 && <Link className="btn btn-outline btn-sm" to="/my/analysis?print=1"><Download size={15} /> Analysis PDF</Link>}</div>
      <MyTabs cur="perf" />
      {!series.length ? <Empty title="No results yet" action={<Link className="btn btn-primary" to="/mock-tests">Take a mock test</Link>}>Complete a mock to see your progress.</Empty> : (
        <>
          <div className="stat-row">
            <div className="stat"><Trophy size={18} /><strong>{scorePct(d.best)}%</strong><span>Best</span></div>
            <div className="stat"><Target size={18} /><strong>{d.accuracy}%</strong><span>Avg accuracy</span></div>
            <div className="stat"><TrendingUp size={18} /><strong>{series.length > 1 ? `${scorePct(series[series.length - 1]) - scorePct(series[0]) >= 0 ? '+' : ''}${Math.round((scorePct(series[series.length - 1]) - scorePct(series[0])) * 10) / 10}` : '–'}</strong><span>Change since first mock (pts)</span></div>
          </div>
          <TrendChart points={series.map((a) => ({ v: scorePct(a), label: fmtDateTime(a.submitted_at), title: d.mockById[a.mock_id]?.title }))} />
          <h2 className="h3">Subject-wise</h2><PerfTable rows={d.subjects} label="Subject" />
          {d.topics.length > 0 && <><h2 className="h3">Topic-wise</h2><PerfTable rows={d.topics} label="Topic" /></>}
          <WeakStrong subjects={d.subjects} topics={d.topics} />
        </>
      )}
    </div>
  );
}

function TrendChart({ points }) {
  const W = 640, H = 200, P = 30;
  const x = (i) => P + (points.length === 1 ? (W - 2 * P) / 2 : (i * (W - 2 * P)) / (points.length - 1));
  const y = (v) => H - P - (Math.max(0, Math.min(100, v)) / 100) * (H - 2 * P);
  return (
    <figure className="card trend">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Score percentage per mock attempt, oldest to newest">
        {[0, 25, 50, 75, 100].map((t) => <g key={t}><line x1={P} x2={W - P} y1={y(t)} y2={y(t)} className="grid" /><text x={4} y={y(t) + 4} className="axis">{t}%</text></g>)}
        <polyline points={points.map((p, i) => `${x(i)},${y(p.v)}`).join(' ')} className="line" />
        {points.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.v)} r="5" className="dot"><title>{`${p.title}: ${p.v}% (${p.label})`}</title></circle>)}
      </svg>
      <figcaption className="muted small">Score % in each mock attempt, oldest to newest.</figcaption>
    </figure>
  );
}

function WeakStrong({ subjects, topics }) {
  const pool = [...subjects, ...topics].filter((r) => r.attempted >= 3);
  if (!pool.length) return null;
  const weak = [...pool].sort((a, b) => a.accuracy - b.accuracy).slice(0, 3);
  const strong = [...pool].sort((a, b) => b.accuracy - a.accuracy).slice(0, 3);
  return (
    <div className="grid-2">
      <div className="card"><h3 className="h4">Strongest areas</h3><ul className="small">{strong.map((r) => <li key={r.id}>{r.name}: {r.accuracy}%</li>)}</ul></div>
      <div className="card"><h3 className="h4">Needs practice</h3><ul className="small">{weak.map((r) => <li key={r.id}>{r.name}: {r.accuracy}%</li>)}</ul></div>
    </div>
  );
}

// ---------------------------------------------------------------- printable reports (Save as PDF)
// No stored files and no public URLs: each report is built in the browser from data the database
// returns only to the attempt's owner (or an admin), then printed / saved as PDF.
function usePrint(ready) {
  const [p] = useSearchParams();
  useEffect(() => { if (ready && p.get('print') === '1') { const t = setTimeout(() => window.print(), 600); return () => clearTimeout(t); } return undefined; }, [ready, p]);
}

export function MockReport() {
  const { id } = useParams();
  const g = useSignedIn();
  const { data, loading, error } = useAsync(() => (g.user ? backend.getMockAttempt(id) : Promise.resolve(null)), [id, g.user?.id]);
  usePrint(!!data?.attempt && data.attempt.status === 'submitted');
  useMeta(data ? `Result report – ${data.mock.title}` : 'Result report', undefined, { noindex: true });
  if (g.wait) return g.wait;
  if (loading || (!data && !error)) return <Loading label="Preparing your report…" />;
  if (error) return <div className="container section narrow"><ErrorState error={error} /></div>;
  const a = data.attempt;
  if (a.status !== 'submitted') return <div className="container section narrow"><div className="notice">The report is available after the mock is submitted.</div></div>;
  const qs = data.questions;
  return (
    <div className="report">
      <div className="report-tools no-print"><button className="btn btn-primary" onClick={() => window.print()}><Printer size={17} /> Download PDF</button><span className="muted small">Choose “Save as PDF” as the printer.</span><Link to={`/mock/result/${a.id}`}>Back to result</Link></div>
      <header className="report-head"><div><strong className="report-brand">EntranceGo</strong><span>Mock Test Result Report</span></div><div className="small">Generated {fmtDateTime(new Date().toISOString())}</div></header>
      <table className="report-meta"><tbody>
        <tr><th>Student</th><td>{data.student?.name || '—'}</td><th>Email</th><td>{data.student?.email}</td></tr>
        <tr><th>Course</th><td>{data.course?.name}</td><th>Mock test</th><td>{data.mock.title} (attempt {a.attempt_no})</td></tr>
        <tr><th>Submitted</th><td>{fmtDateTime(a.submitted_at)}</td><th>Time taken</th><td>{formatDuration(a.duration_seconds || 0)} of {data.mock.duration_minutes} min</td></tr>
      </tbody></table>
      <div className="report-score">
        <div><strong>{fmtMarks(a.score)} / {fmtMarks(a.max_score)}</strong><span>Score ({pct(Number(a.score), Number(a.max_score))}%)</span></div>
        <div><strong>{a.correct}</strong><span>Correct</span></div><div><strong>{a.incorrect}</strong><span>Wrong</span></div>
        <div><strong>{a.unanswered}</strong><span>Unanswered</span></div><div><strong>{pct(a.correct, a.correct + a.incorrect)}%</strong><span>Accuracy</span></div>
      </div>
      <p className="small">Marking: +{fmtMarks(a.marks_per_question)} per correct answer{Number(a.negative_marks) ? `, −${fmtMarks(a.negative_marks)} per wrong answer` : ', no negative marking'}.</p>
      <h2>Subject-wise performance</h2><PerfTable rows={breakdown(qs, 'subject_id')} label="Subject" />
      {qs.some((x) => x.topic_id) && <><h2>Topic-wise performance</h2><PerfTable rows={breakdown(qs, 'topic_id')} label="Topic" /></>}
      <h2>Question-wise answers</h2>
      <table className="report-answers"><thead><tr><th>#</th><th>Question</th><th>Your answer</th><th>Correct</th><th>Result</th></tr></thead>
        <tbody>{qs.map((x) => (
          <tr key={x.id}><td>{x.position}</td><td><div>{x.question}</div><div className="small muted">{OPTIONS.map((L) => `${L}) ${x[optKey(L)]}`).join('   ')}</div></td>
            <td>{x.chosen_option || '—'}</td><td>{x.correct_option}</td><td>{x.is_correct ? 'Correct' : x.chosen_option ? 'Wrong' : 'Skipped'}</td></tr>
        ))}</tbody></table>
      <footer className="report-foot small">Private report for {data.student?.email}. EntranceGo · Learn Smarter. Practice Better.</footer>
    </div>
  );
}

export function MyAnalysisReport() {
  const g = useSignedIn();
  const { data, loading, error } = useAsync(() => (g.user ? getMyMockData(g.user.id) : Promise.resolve(null)), [g.user?.id]);
  usePrint(!!data);
  useMeta('Performance analysis', undefined, { noindex: true });
  if (g.wait) return g.wait;
  if (loading || (!data && !error)) return <Loading label="Preparing your analysis…" />;
  if (error) return <div className="container section narrow"><ErrorState error={error} /></div>;
  const d = data;
  const name = g.user.user_metadata?.full_name || g.user.email;
  return (
    <div className="report">
      <div className="report-tools no-print"><button className="btn btn-primary" onClick={() => window.print()}><Printer size={17} /> Download PDF</button><span className="muted small">Choose “Save as PDF” as the printer.</span><Link to="/my/performance">Back</Link></div>
      <header className="report-head"><div><strong className="report-brand">EntranceGo</strong><span>Detailed Performance Analysis</span></div><div className="small">Generated {fmtDateTime(new Date().toISOString())}</div></header>
      <table className="report-meta"><tbody><tr><th>Student</th><td>{name}</td><th>Email</th><td>{g.user.email}</td></tr>
        <tr><th>Mocks completed</th><td>{d.submitted.length}</td><th>Average accuracy</th><td>{d.accuracy}%</td></tr>
        <tr><th>Best score</th><td>{d.best ? `${fmtMarks(d.best.score)}/${fmtMarks(d.best.max_score)} (${scorePct(d.best)}%)` : '—'}</td><th>Latest score</th><td>{d.latest ? `${fmtMarks(d.latest.score)}/${fmtMarks(d.latest.max_score)}` : '—'}</td></tr></tbody></table>
      {!d.submitted.length ? <p>No completed mock tests yet.</p> : (<>
        <h2>All attempts</h2>
        <table className="report-answers"><thead><tr><th>Date</th><th>Mock test</th><th>Score</th><th>%</th><th>C / W / S</th><th>Time</th></tr></thead>
          <tbody>{d.submitted.map((a) => <tr key={a.id}><td>{fmtDateTime(a.submitted_at)}</td><td>{d.mockById[a.mock_id]?.title || 'Mock'} #{a.attempt_no}</td><td>{fmtMarks(a.score)}/{fmtMarks(a.max_score)}</td><td>{scorePct(a)}%</td><td>{a.correct}/{a.incorrect}/{a.unanswered}</td><td>{formatDuration(a.duration_seconds || 0)}</td></tr>)}</tbody></table>
        <h2>Progress over time</h2>
        <TrendChart points={[...d.submitted].reverse().map((a) => ({ v: scorePct(a), label: fmtDateTime(a.submitted_at), title: d.mockById[a.mock_id]?.title }))} />
        <h2>Subject-wise performance</h2><PerfTable rows={d.subjects} label="Subject" />
        {d.topics.length > 0 && <><h2>Topic-wise performance</h2><PerfTable rows={d.topics} label="Topic" /></>}
        <WeakStrong subjects={d.subjects} topics={d.topics} />
      </>)}
      <footer className="report-foot small">Private report for {g.user.email}. EntranceGo · Learn Smarter. Practice Better.</footer>
    </div>
  );
}
