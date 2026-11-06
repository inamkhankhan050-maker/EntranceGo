import { useState } from 'react';
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom';
import { Clock, ListChecks, Award, Lock, PlayCircle, MinusCircle, Repeat, CalendarClock } from 'lucide-react';
import { backend } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useAsync, useMeta, useToast } from '../lib/hooks.js';
import { getMockCatalog, availability, fmtMarks, rememberNext } from '../lib/mocks.js';
import { IS_DEMO } from '../lib/config.js';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import { Loading, ErrorState, Empty, NotFoundBlock } from '../components/States.jsx';

export function MocksList() {
  useMeta('Full Mock Tests', 'Full-length timed mock tests for B.Ed and other entrance exams, with subject-wise results and downloadable reports.');
  const { data, loading, error, reload } = useAsync(getMockCatalog, []);
  return (
    <div className="container section">
      <Breadcrumbs items={[{ label: 'Mock Tests' }]} />
      <header className="page-head"><h1>Full mock tests</h1>
        <p className="muted">Timed, exam-pattern tests. Every new mock gives you questions you haven't attempted yet, as far as the question bank allows.</p></header>
      {IS_DEMO && <div className="notice">Mock tests run on the online database and are not available in demo mode.</div>}
      {loading ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : !data.mocks.length ? (
        <Empty title="No mock tests published yet">Check back soon.</Empty>
      ) : data.courses.filter((c) => c.mocks.length).map((c) => (
        <section key={c.id} className="mock-course">
          <h2 className="mock-course-h">{c.name}</h2>
          {c.description && <p className="muted small">{c.description}</p>}
          <div className="mock-grid">{c.mocks.map((m) => <MockCard key={m.id} m={m} />)}</div>
        </section>
      ))}
    </div>
  );
}

function MockCard({ m }) {
  const av = availability(m);
  return (
    <Link to={`/mock-tests/${m.slug}`} className="card mock-card">
      <strong className="mock-title">{m.title}</strong>
      <div className="mock-facts small">
        <span><ListChecks size={15} /> {m.total_questions} questions</span>
        <span><Clock size={15} /> {m.duration_minutes} min</span>
        <span><Award size={15} /> {fmtMarks(m.total_questions * m.marks_per_question)} marks</span>
      </div>
      <div className="muted small">{m.sections.map((s) => `${s.subject?.name || 'Subject'} ${s.question_count}`).join(' · ')}</div>
      <span className={'badge ' + (av.open ? 'badge-published' : 'badge-draft')}>{av.label}</span>
    </Link>
  );
}

export function MockDetail() {
  const { slug } = useParams();
  const nav = useNavigate();
  const loc = useLocation();
  const toast = useToast();
  const { user, ready } = useAuth();
  const { data, loading, error, reload } = useAsync(getMockCatalog, []);
  const m = data?.mocks.find((x) => x.slug === slug);
  const mine = useAsync(() => (user && m ? backend.myMockAttempts(user.id).then((r) => r.filter((a) => a.mock_id === m.id)) : Promise.resolve([])), [user?.id, m?.id]);
  const [busy, setBusy] = useState(false);
  useMeta(m ? `${m.title} – ${m.course.name}` : 'Mock test', m?.description || undefined);

  if (loading) return <Loading />;
  if (error) return <div className="container section"><ErrorState error={error} onRetry={reload} /></div>;
  if (!m) return <NotFoundBlock what="mock test" />;
  const av = availability(m);
  const used = (mine.data || []).length;
  const running = (mine.data || []).find((a) => a.status === 'in_progress' && Date.parse(a.expires_at) > Date.now());
  const left = m.max_attempts ? Math.max(0, m.max_attempts - used) : null;

  const start = async () => {
    if (!user) {                                     // guests sign in first, then return here
      rememberNext(loc.pathname);
      nav('/login', { state: { from: loc.pathname, reason: 'mock', mockTitle: m.title } });
      return;
    }
    setBusy(true);
    try { const id = await backend.startMock(m.id); nav(`/mock/attempt/${id}`); }
    catch (e) { toast(e.message, 'error'); setBusy(false); mine.reload(); }
  };

  return (
    <div className="container section narrow">
      <Breadcrumbs items={[{ to: '/mock-tests', label: 'Mock Tests' }, { label: m.course.name }, { label: m.title }]} />
      <div className="card mock-detail">
        <span className="muted small">{m.course.name}</span>
        <h1>{m.title}</h1>
        {m.description && <p>{m.description}</p>}
        <div className="stat-row">
          <div className="stat"><strong>{m.total_questions}</strong><span>Questions</span></div>
          <div className="stat"><strong>{m.duration_minutes} min</strong><span>Duration</span></div>
          <div className="stat"><strong>{fmtMarks(m.total_questions * m.marks_per_question)}</strong><span>Total marks</span></div>
          <div className="stat"><strong>{Number(m.negative_marks) ? '−' + fmtMarks(m.negative_marks) : 'None'}</strong><span>Negative marking</span></div>
        </div>
        <h2 className="h3">Sections</h2>
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Subject</th><th>Questions</th><th>Marks</th></tr></thead>
          <tbody>{m.sections.map((s) => <tr key={s.id}><td>{s.subject?.name}</td><td>{s.question_count}</td><td>{fmtMarks(s.question_count * m.marks_per_question)}</td></tr>)}</tbody>
        </table></div>
        <ul className="mock-rules small">
          <li><Award size={15} /> +{fmtMarks(m.marks_per_question)} for each correct answer</li>
          <li><MinusCircle size={15} /> {Number(m.negative_marks) ? `−${fmtMarks(m.negative_marks)} for each wrong answer` : 'No negative marking'}; unanswered questions score 0</li>
          <li><Repeat size={15} /> {m.max_attempts ? `${m.max_attempts} attempt${m.max_attempts > 1 ? 's' : ''} allowed` : 'Unlimited attempts'}{user && left != null ? ` (${left} left)` : ''}</li>
          <li><CalendarClock size={15} /> {av.label}</li>
        </ul>
        {m.instructions && <div className="notice small">{m.instructions}</div>}
        <div className="action-row">
          {running ? (
            <Link className="btn btn-primary btn-lg" to={`/mock/attempt/${running.id}`}><PlayCircle size={19} /> Resume mock test</Link>
          ) : (
            <button className="btn btn-primary btn-lg" onClick={start} disabled={busy || !av.open || !ready || (user && left === 0) || IS_DEMO}>
              {user ? <PlayCircle size={19} /> : <Lock size={18} />} {busy ? 'Preparing your questions…' : 'Start Mock Test'}
            </button>
          )}
          {user && used > 0 && <Link className="btn btn-outline" to="/my/mock-tests">My attempts ({used})</Link>}
        </div>
        {!user && ready && <p className="muted small">Free registration is required to take full mock tests, save results and download reports.</p>}
        {user && left === 0 && <p className="err-text small">You have used all attempts for this mock.</p>}
      </div>
    </div>
  );
}
