import { Link, useSearchParams } from 'react-router-dom';
import { search } from '../lib/api.js';
import { useAsync, useMeta } from '../lib/hooks.js';
import { SearchBox } from '../components/Layout.jsx';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import { SubjectCard, SetCard, QuestionPreview } from '../components/Cards.jsx';
import { Loading, ErrorState, Empty } from '../components/States.jsx';

export default function Search() {
  const [params] = useSearchParams();
  const q = params.get('q') || '';
  useMeta(q ? `Search: ${q}` : 'Search', 'Search EntranceGo subjects, topics, exams and questions.', { noindex: true });
  const { data, loading, error, reload } = useAsync(() => search(q), [q]);
  const total = data ? data.subjects.length + data.topics.length + data.exams.length + data.sets.length + data.questions.length : 0;
  return (
    <div className="container section narrow">
      <Breadcrumbs items={[{ label: 'Search' }]} />
      <h1>Search</h1>
      <SearchBox big initial={q} autoFocus={!q} />
      {q.trim().length < 2 ? <p className="muted">Type at least two characters to search subjects, topics, exams and question text.</p>
        : loading ? <Loading label="Searching…" />
        : error ? <ErrorState error={error} onRetry={reload} />
        : total === 0 ? <Empty title={`No results for "${q}"`}>Check the spelling or try a broader word, e.g. "percentage" or "python".</Empty>
        : (
          <div className="search-results">
            <p className="muted">{total} result{total === 1 ? '' : 's'} for “{q}”</p>
            {data.subjects.length > 0 && <section className="block"><h2>Subjects</h2><div className="grid-compact">{data.subjects.map((s) => <SubjectCard key={s.id} s={s} compact />)}</div></section>}
            {data.exams.length > 0 && <section className="block"><h2>Exams</h2><div className="chips">{data.exams.map((e) => <Link key={e.id} className="chip" to={`/exams/${e.slug}`}>{e.name}</Link>)}</div></section>}
            {data.topics.length > 0 && <section className="block"><h2>Topics</h2><div className="chips">{data.topics.map((t) => <Link key={t.id} className="chip" to={`/subjects/${t.subject.slug}/${t.slug}`}>{t.name} <span className="muted">· {t.subject.name}</span></Link>)}</div></section>}
            {data.sets.length > 0 && <section className="block"><h2>Practice sets</h2><div className="grid-sets">{data.sets.map((p) => <SetCard key={p.id} p={p} />)}</div></section>}
            {data.questions.length > 0 && <section className="block"><h2>Questions</h2><div className="recent-list">{data.questions.map((x) => <QuestionPreview key={x.id} q={x} />)}</div></section>}
          </div>
        )}
    </div>
  );
}
