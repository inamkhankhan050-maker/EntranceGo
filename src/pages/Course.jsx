import { Link, useParams } from 'react-router-dom';
import { FileText, CalendarDays } from 'lucide-react';
import { getCoursePage } from '../lib/api.js';
import { getMockCatalog } from '../lib/mocks.js';
import { useAsync, useMeta } from '../lib/hooks.js';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import { SubjectCard } from '../components/Cards.jsx';
import { MockCard } from './Mocks.jsx';
import { Loading, ErrorState, Empty, NotFoundBlock } from '../components/States.jsx';

// A course inside a category: its subjects, its full mock tests and its previous year papers.
export default function CoursePage() {
  const { slug } = useParams();
  const { data, loading, error, reload } = useAsync(async () => {
    const [page, mc] = await Promise.all([getCoursePage(slug), getMockCatalog().catch(() => ({ mocks: [] }))]);
    return page && { ...page, mocks: mc.mocks.filter((m) => m.course_id === page.course.id) };
  }, [slug]);
  const k = data?.course;
  useMeta(k ? `${k.name} MCQs, Mock Tests & PYQs` : 'Course', k?.description || (k ? `Practise ${k.name} subject-wise MCQs, full mock tests and previous year papers.` : undefined));
  if (loading) return <Loading />;
  if (error) return <div className="container section"><ErrorState error={error} onRetry={reload} /></div>;
  if (!k) return <NotFoundBlock what="course" />;
  const crumbs = [{ to: '/subjects', label: 'Subjects' }, ...(data.category ? [{ to: `/subjects#${data.category.slug}`, label: data.category.name }] : []), { label: k.name }];
  return (
    <div className="container section">
      <Breadcrumbs items={crumbs} />
      <header className="page-head">
        <h1>{k.name}</h1>
        {k.description && <p className="muted">{k.description}</p>}
      </header>

      <section className="cat-block">
        <h2>Subjects <span className="count">{k.subjects.length}</span></h2>
        {k.subjects.length ? <div className="sv-grid">{k.subjects.map((s) => <SubjectCard key={s.id} s={s} />)}</div>
          : <Empty title="Subjects are coming soon" />}
      </section>

      {data.mocks.length > 0 && (
        <section className="cat-block">
          <h2>Full mock tests <span className="count">{data.mocks.length}</span></h2>
          <div className="mock-grid">{data.mocks.map((m) => <MockCard key={m.id} m={m} />)}</div>
        </section>
      )}

      {data.pyqs.length > 0 && (
        <section className="cat-block">
          <h2>Previous year papers <span className="count">{data.pyqs.length}</span></h2>
          <div className="chips">
            {data.pyqs.map((p) => <Link key={p.id} to={`/pyq/${p.slug}`} className="chip"><FileText size={14} /> {p.exam_name} {p.year}</Link>)}
          </div>
        </section>
      )}
      {data.pyqs.length === 0 && <p className="small muted"><CalendarDays size={14} /> Previous year papers for this course will appear here once published.</p>}
    </div>
  );
}
