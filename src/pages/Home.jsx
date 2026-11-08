import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { getCatalog } from '../lib/api.js';
import { useAsync, useMeta } from '../lib/hooks.js';
import { SearchBox } from '../components/Layout.jsx';
import { SubjectCard, ExamCard, SetCard } from '../components/Cards.jsx';
import { Loading, ErrorState } from '../components/States.jsx';

// Homepage headings and copy per category.
const SECTIONS = {
  'competitive-exams': ['Practice MCQs by Subject', 'Core sections of government and private recruitment tests, each with answers and explanations.'],
  'computer-programming': ['Computer & Programming MCQs', 'From computer basics to Python, SQL, data science and cloud.'],
  'engineering-gate': ['CUET ENTRANCE EXAM MCQs', 'Practice Smart with Subject-wise MCQs for CUET UG & PG Entrance Exams.'],
  'graduation-postgraduate': ['JMI ENTRANCE EXAM MCQs', 'Practice Smart for Class 6, 9, 11, Diploma, UG & PG Entrance Exams at Jamia Millia Islamia.'],
  'interview-preparation': ['BHU ENTRANCE EXAM MCQs', 'Practice Smart for UG & PG Entrance Exams at Banaras Hindu University.'],
};

function SectionHead({ id, title, sub }) {
  return (
    <div className="sv-head">
      <h2 id={id} className="sv-banner">{title}</h2>
      {sub && <p>{sub}</p>}
    </div>
  );
}

export default function Home() {
  useMeta(null, 'EntranceGo: practise MCQs for SSC, Railway and other competitive exams, programming, engineering and university subjects, with answers and explanations.');
  const { data: c, loading, error, reload } = useAsync(getCatalog, []);
  const cats = c ? c.categories.filter((cat) => cat.slug !== 'interview-preparation') : [];
  const interview = c?.categories.find((cat) => cat.slug === 'interview-preparation');
  const sets = c ? c.sets.filter((p) => p.question_count).slice(0, 6) : [];

  const catSection = (cat) => {
    const list = c.subjects.filter((s) => s.category_ids.includes(cat.id));
    if (!list.length) return null;
    const [title, sub] = SECTIONS[cat.slug] || [cat.name, cat.description];
    return (
      <section key={cat.id} className="section sv-section" aria-labelledby={`h-${cat.slug}`}>
        <div className="container">
          <SectionHead id={`h-${cat.slug}`} title={title} sub={sub} />
          <div className="sv-grid">{list.map((s, i) => <SubjectCard key={s.id} s={s} tone={i} simple />)}</div>
        </div>
      </section>
    );
  };

  return (
    <>
      <section className="sv-hero">
        <div className="container">
          <h1>Practice MCQs for <span className="grad">Entrance Exams!</span></h1>
          <p className="sv-hero-lead">Free Mock Tests, Practice MCQs, Answers &amp; Detailed Explanations for JMI (Jamia Millia Islamia), AMU (Aligarh Muslim University), CUET (Common University Entrance Test), DU (University of Delhi), BHU (Banaras Hindu University) and other university entrance exams. Prepare smarter, practise better and achieve your goals!</p>
          <p className="sv-hero-tag">Practice Free. Prepare Smart. Get Selected!</p>
          <div className="sv-search-card">
            <h2>Search MCQs, PYQs, Topics &amp; Exams</h2>
            <SearchBox big />
          </div>
          <div className="action-row center">
            <Link to="/practice" className="btn btn-primary btn-lg sv-start">Start Practicing <ArrowRight size={18} /></Link>
            <Link to="/mock-tests" className="btn btn-outline btn-lg sv-start">Full Mock Tests <ArrowRight size={18} /></Link>
          </div>
        </div>
      </section>

      {loading && <Loading />}
      {error && <div className="container"><ErrorState error={error} onRetry={reload} /></div>}
      {c && (
        <>
          {cats.map(catSection)}

          <section className="section sv-section" aria-labelledby="h-exams">
            <div className="container">
              <SectionHead id="h-exams" title="AMU ENTRANCE EXAM MCQs" sub="Practice Smart for Class 6, 9, 11, Diploma, UG & PG Entrance Exams at Aligarh Muslim University." />
              <div className="sv-grid">{c.exams.map((e, i) => <ExamCard key={e.id} e={e} tone={i} simple />)}</div>
            </div>
          </section>

          {interview && catSection(interview)}

          {sets.length > 0 && (
            <section className="section sv-section sv-tint" aria-labelledby="h-sets">
              <div className="container">
                <SectionHead id="h-sets" title="Featured Practice Sets" sub="Ready-made sets you can finish in a few minutes." />
                <div className="grid-sets">{sets.map((p) => <SetCard key={p.id} p={p} />)}</div>
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}
