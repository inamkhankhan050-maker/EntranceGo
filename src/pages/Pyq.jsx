import { useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Play, Timer, Clock, ListChecks, FileText, CalendarDays, GraduationCap, ArrowRight } from 'lucide-react';
import { getPyqs, getPyqPage } from '../lib/api.js';
import { useAsync, useMeta } from '../lib/hooks.js';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import { Loading, ErrorState, Empty, NotFoundBlock } from '../components/States.jsx';
import { normText, plural } from '../lib/text.js';

const uniq = (arr) => [...new Set(arr.filter(Boolean))];
// Always offered, even before a paper exists for them.
const EXAMS = ['JMI', 'AMU', 'CUET', 'BHU', 'DU'];
const LEVELS = ['School', 'Diploma', 'UG', 'PG'];
const withDefaults = (defaults, found) => [...defaults, ...uniq(found).filter((x) => !defaults.includes(x)).sort()];

// Previous Year Question papers: filter by Exam > Level (School / UG / PG ...) > Course > Year.
export function PyqList() {
  useMeta('Previous Year Question Papers (PYQs)', 'Previous year question papers for JMI, AMU, CUET, BHU, DU and other entrance exams, by level, course and year, with answers and explanations.');
  const { data, loading, error, reload } = useAsync(getPyqs, []);
  const [params, setParams] = useSearchParams();
  const f = { exam: params.get('exam') || '', level: params.get('level') || '', course: params.get('course') || '', year: params.get('year') || '', q: params.get('q') || '' };

  // Each later filter only offers values that exist under the earlier ones.
  const papers = data || [];
  const byExam = papers.filter((p) => !f.exam || p.exam_name === f.exam);
  const byLevel = byExam.filter((p) => !f.level || p.level === f.level);
  const byCourse = byLevel.filter((p) => !f.course || p.course === f.course);
  const list = byCourse.filter((p) => (!f.year || String(p.year) === f.year)
    && (!f.q || normText(`${p.title} ${p.exam_name} ${p.level} ${p.course} ${p.year}`).includes(normText(f.q))));
  const exams = useMemo(() => withDefaults(EXAMS, papers.map((p) => p.exam_name)), [papers]);
  const levels = withDefaults(LEVELS, byExam.map((p) => p.level));
  const courses = uniq(byLevel.map((p) => p.course)).sort();
  const years = uniq(byCourse.map((p) => p.year)).sort((a, b) => b - a);

  const set = (key, value) => {
    const next = { ...f, [key]: value };
    const order = ['exam', 'level', 'course', 'year'];
    const i = order.indexOf(key);
    if (i >= 0) order.slice(i + 1).forEach((k) => { next[k] = ''; });   // reset the filters below
    setParams(Object.fromEntries(Object.entries(next).filter(([, v]) => v)), { replace: true });
  };

  return (
    <div className="container section">
      <Breadcrumbs items={[{ label: 'PYQ Papers' }]} />
      <header className="page-head">
        <h1>Previous Year Question Papers</h1>
        <p className="muted">Choose the exam, then School / UG / PG, the course and the year. Practise each paper with answers, or take it as a timed test.</p>
      </header>

      <div className="card pyq-filters">
        <label className="pyq-f"><span>Exam</span>
          <select className="input" value={f.exam} onChange={(e) => set('exam', e.target.value)}><option value="">All exams</option>{exams.map((x) => <option key={x} value={x}>{x}</option>)}</select></label>
        <label className="pyq-f"><span>Level</span>
          <select className="input" value={f.level} onChange={(e) => set('level', e.target.value)}><option value="">All levels</option>{levels.map((x) => <option key={x} value={x}>{x}</option>)}</select></label>
        <label className="pyq-f"><span>Course</span>
          <select className="input" value={f.course} onChange={(e) => set('course', e.target.value)}><option value="">All courses</option>{courses.map((x) => <option key={x} value={x}>{x}</option>)}</select></label>
        <label className="pyq-f"><span>Year</span>
          <select className="input" value={f.year} onChange={(e) => set('year', e.target.value)}><option value="">All years</option>{years.map((x) => <option key={x} value={x}>{x}</option>)}</select></label>
        <label className="pyq-f pyq-q"><span>Search</span>
          <input className="input" placeholder="e.g. JMI B.Tech 2024" value={f.q} onChange={(e) => set('q', e.target.value)} /></label>
      </div>

      {loading ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : !papers.length && !f.exam && !f.level ? (
        <Empty title="PYQ papers are coming soon">Previous year papers will appear here once they are published.</Empty>
      ) : !list.length ? (
        <Empty title={f.exam ? `No ${f.exam}${f.level ? ` ${f.level}` : ''} papers yet` : 'No papers match'} action={<button className="btn btn-outline" onClick={() => setParams({}, { replace: true })}>Clear filters</button>}>Try another year or course.</Empty>
      ) : (
        <>
          <p className="muted small">{plural(list.length, 'paper')}</p>
          <div className="mock-grid">{list.map((p) => <PyqCard key={p.id} p={p} />)}</div>
        </>
      )}
    </div>
  );
}

function PyqCard({ p }) {
  return (
    <Link to={`/pyq/${p.slug}`} className="card mock-card">
      <span className="eyebrow">{p.exam_name} · {p.level}</span>
      <strong className="mock-title">{p.title}</strong>
      <div className="mock-facts small">
        <span><GraduationCap size={15} /> {p.course}</span>
        <span><CalendarDays size={15} /> {p.year}</span>
        {p.set?.question_count > 0 && <span><ListChecks size={15} /> {plural(p.set.question_count, 'question')}</span>}
        {p.pdf_url && <span><FileText size={15} /> PDF</span>}
      </div>
      <span className="set-meta"><span className="muted small">Open paper</span><ArrowRight size={15} className="set-go" aria-hidden="true" /></span>
    </Link>
  );
}

export function PyqDetail() {
  const { slug } = useParams();
  const { data: p, loading, error, reload } = useAsync(() => getPyqPage(slug), [slug]);
  useMeta(p ? `${p.title} – ${p.exam_name} ${p.course} ${p.year} PYQ` : 'PYQ Paper', p?.description || (p ? `${p.exam_name} ${p.level} ${p.course} ${p.year} previous year question paper with answers.` : undefined));
  if (loading) return <Loading />;
  if (error) return <div className="container section"><ErrorState error={error} onRetry={reload} /></div>;
  if (!p) return <NotFoundBlock what="question paper" />;
  const s = p.set;
  return (
    <div className="container section narrow">
      <Breadcrumbs items={[{ to: '/pyq', label: 'PYQ Papers' }, { to: `/pyq?exam=${encodeURIComponent(p.exam_name)}`, label: p.exam_name }, { label: `${p.course} ${p.year}` }]} />
      <div className="card start-card">
        <span className="eyebrow">{p.exam_name} · {p.level} · {p.course} · {p.year}</span>
        <h1>{p.title}</h1>
        {p.description && <p className="muted">{p.description}</p>}
        {s?.question_count > 0 && (
          <div className="set-meta big">
            <span><ListChecks size={18} /> {plural(s.question_count, 'question')}</span>
            <span><Clock size={18} /> {s.time_limit_minutes ? `${s.time_limit_minutes} minutes in Test mode` : 'No time limit'}</span>
          </div>
        )}
        {s?.question_count > 0 ? (
          <div className="mode-choice">
            <Link to={`/play?type=set&slug=${s.slug}&mode=practice`} className="mode-card">
              <Play size={22} /><strong>Practice mode</strong><span className="muted small">Check each answer and read the explanation straight away.</span>
            </Link>
            <Link to={`/play?type=set&slug=${s.slug}&mode=test`} className="mode-card">
              <Timer size={22} /><strong>Test mode</strong><span className="muted small">Attempt it like the real paper{s.time_limit_minutes ? ', with a timer' : ''}. Answers show after you submit.</span>
            </Link>
          </div>
        ) : !p.pdf_url && <Empty title="Questions for this paper are coming soon" />}
        {p.pdf_url && /\.(jpe?g|png|webp)(\?|$)/i.test(p.pdf_url) && <img className="pyq-photo" src={p.pdf_url} alt={`${p.title} question paper`} loading="lazy" />}
        {p.pdf_url && (
          <div className="action-row">
            <a className="btn btn-outline" href={p.pdf_url} target="_blank" rel="noopener noreferrer"><FileText size={17} /> View question paper{/\.pdf(\?|$)/i.test(p.pdf_url) ? ' (PDF)' : ''}</a>
          </div>
        )}
      </div>
      {p.years?.length > 0 && (
        <section className="card start-card">
          <h2 className="h4">Other years: {p.exam_name} {p.course}</h2>
          <div className="pyq-years">{p.years.map((x) => <Link key={x.id} className="chip" to={`/pyq/${x.slug}`}><CalendarDays size={14} /> {x.year}</Link>)}</div>
        </section>
      )}
    </div>
  );
}
