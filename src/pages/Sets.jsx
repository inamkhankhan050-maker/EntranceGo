import { Link, useParams } from 'react-router-dom';
import { Play, Timer, Clock, ListChecks } from 'lucide-react';
import { getCatalog, getSetPage } from '../lib/api.js';
import { useAsync, useMeta } from '../lib/hooks.js';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import { SetCard } from '../components/Cards.jsx';
import { Loading, ErrorState, Empty, NotFoundBlock } from '../components/States.jsx';
import { plural } from '../lib/text.js';

export function Sets() {
  useMeta('Practice Sets', 'Ready-made MCQ practice sets and timed mini mocks.');
  const { data: c, loading, error, reload } = useAsync(getCatalog, []);
  if (loading) return <Loading />;
  if (error) return <div className="container section"><ErrorState error={error} onRetry={reload} /></div>;
  const sets = c.sets.filter((p) => p.question_count && !p.slug.startsWith('pyq-'));   // PYQ papers have their own page
  return (
    <div className="container section">
      <Breadcrumbs items={[{ label: 'Practice Sets' }]} />
      <header className="page-head"><h1>Practice sets</h1><p className="muted">Hand-picked sets. Use Practice mode to learn as you go, or Test mode for a timed attempt.</p></header>
      {sets.length ? <div className="grid-sets">{sets.map((p) => <SetCard key={p.id} p={p} />)}</div>
        : <Empty title="No practice sets yet" action={<Link className="btn btn-primary" to="/subjects">Practise by subject</Link>}>Sets will appear here once they are published.</Empty>}
    </div>
  );
}

export function SetPage() {
  const { slug } = useParams();
  const { data: p, loading, error, reload } = useAsync(() => getSetPage(slug), [slug]);
  useMeta(p ? p.title : 'Practice Set', p?.description);
  if (loading) return <Loading />;
  if (error) return <div className="container section"><ErrorState error={error} onRetry={reload} /></div>;
  if (!p) return <NotFoundBlock what="practice set" />;
  return (
    <div className="container section narrow">
      <Breadcrumbs items={[{ to: '/practice', label: 'Practice Sets' }, { label: p.title }]} />
      <div className="card start-card">
        <span className="eyebrow">{p.exam?.name || p.subject?.name || 'Practice set'}</span>
        <h1>{p.title}</h1>
        {p.description && <p className="muted">{p.description}</p>}
        <div className="set-meta big">
          <span><ListChecks size={18} /> {plural(p.question_count, 'question')}</span>
          <span><Clock size={18} /> {p.time_limit_minutes ? `${p.time_limit_minutes} minutes in Test mode` : 'No time limit'}</span>
        </div>
        {p.question_count ? (
          <div className="mode-choice">
            <Link to={`/play?type=set&slug=${p.slug}&mode=practice`} className="mode-card">
              <Play size={22} /><strong>Practice mode</strong><span className="muted small">Check each answer and read the explanation straight away.</span>
            </Link>
            <Link to={`/play?type=set&slug=${p.slug}&mode=test`} className="mode-card">
              <Timer size={22} /><strong>Test mode</strong><span className="muted small">Answers stay hidden until you submit{p.time_limit_minutes ? ', with a timer' : ''}.</span>
            </Link>
          </div>
        ) : <Empty title="This set has no published questions yet" />}
        <div className="small muted">
          {p.subject && <>Subject: <Link to={`/subjects/${p.subject.slug}`}>{p.subject.name}</Link>. </>}
          {p.exam && <>Exam: <Link to={`/exams/${p.exam.slug}`}>{p.exam.name}</Link>.</>}
        </div>
      </div>
    </div>
  );
}
