import { Link, useParams } from 'react-router-dom';
import { Play, Timer, ArrowRight } from 'lucide-react';
import { getCatalog, getExamPage } from '../lib/api.js';
import { useAsync, useMeta } from '../lib/hooks.js';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import { SetCard, SubjectCard, ExamCard } from '../components/Cards.jsx';
import { Loading, ErrorState, Empty, NotFoundBlock } from '../components/States.jsx';
import { plural } from '../lib/text.js';

export function Exams() {
  useMeta('Competitive Examinations', 'Practice questions for SSC (CGL, CHSL, MTS, CPO, JE, GD) and Railway (RRB NTPC, Group D, ALP, Technician, Section Controller) exams.');
  const { data: c, loading, error, reload } = useAsync(getCatalog, []);
  if (loading) return <Loading />;
  if (error) return <div className="container section"><ErrorState error={error} onRetry={reload} /></div>;
  const groups = [...new Set(c.exams.map((e) => e.group_name || 'Other'))];
  return (
    <div className="container section">
      <Breadcrumbs items={[{ label: 'Exams' }]} />
      <header className="page-head"><h1>Competitive examinations</h1><p className="muted">Questions tagged to each exam's pattern. EntranceGo is independent and not affiliated with any conducting body.</p></header>
      {groups.map((g) => (
        <section key={g} className="cat-block">
          <h2>{g === 'SSC' ? 'SSC Exams' : g === 'Railway' ? 'Railway Exams' : g}</h2>
          <div className="sv-grid">{c.exams.filter((e) => (e.group_name || 'Other') === g).map((e) => <ExamCard key={e.id} e={e} />)}</div>
        </section>
      ))}
    </div>
  );
}

export function Exam() {
  const { exam: slug } = useParams();
  const { data, loading, error, reload } = useAsync(() => getExamPage(slug), [slug]);
  const e = data?.exam;
  useMeta(e ? `${e.name} Practice Questions` : 'Exam', e ? `Practise ${e.name}-style MCQs with answers and explanations.` : undefined);
  if (loading) return <Loading />;
  if (error) return <div className="container section"><ErrorState error={error} onRetry={reload} /></div>;
  if (!data) return <NotFoundBlock what="exam" />;
  return (
    <div className="container section">
      <Breadcrumbs items={[{ to: '/exams', label: 'Exams' }, { label: e.name }]} />
      <header className="page-head"><h1>{e.name}</h1><p className="muted">{e.description}</p><p className="small muted">Independent practice in the style of this exam. Not affiliated with the conducting body.</p><p className="meta-line">{plural(data.questions.length, 'question')}</p></header>
      {data.questions.length > 0 ? (
        <div className="action-row">
          <Link className="btn btn-primary" to={`/play?type=exam&slug=${e.slug}&mode=practice`}><Play size={17} /> Practice</Link>
          <Link className="btn btn-outline" to={`/play?type=exam&slug=${e.slug}&mode=test`}><Timer size={17} /> Take as test</Link>
        </div>
      ) : <Empty title={`No ${e.name} questions yet`}>Questions tagged to this exam haven't been published. The subjects below are a good place to start.</Empty>}
      {data.sets.length > 0 && <section className="block"><h2>Practice sets</h2><div className="grid-sets">{data.sets.map((p) => <SetCard key={p.id} p={p} />)}</div></section>}
      {data.subjects.length > 0 && <section className="block"><h2>Subjects covered</h2><div className="grid-compact">{data.subjects.map((s) => <SubjectCard key={s.id} s={s} compact />)}</div></section>}
      {data.related.length > 0 && <section className="block"><h2>Related exams</h2><div className="chips">{data.related.map((r) => <Link key={r.id} className="chip" to={`/exams/${r.slug}`}>{r.name}</Link>)}</div></section>}
    </div>
  );
}
