import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { getCatalog } from '../lib/api.js';
import { useAsync, useMeta } from '../lib/hooks.js';
import { SubjectCard } from '../components/Cards.jsx';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import { Loading, ErrorState, Empty } from '../components/States.jsx';
import { normText } from '../lib/text.js';

export default function Subjects() {
  useMeta('All Subjects', 'Browse every EntranceGo subject: competitive exams, computer and programming, engineering and GATE, graduation and postgraduate, and interview preparation.');
  const { data: c, loading, error, reload } = useAsync(getCatalog, []);
  const [filter, setFilter] = useState('');
  const { hash } = useLocation();
  useEffect(() => { if (c && hash) document.getElementById(hash.slice(1))?.scrollIntoView(); }, [c, hash]);
  const f = normText(filter);

  return (
    <div className="container section">
      <Breadcrumbs items={[{ label: 'Subjects' }]} />
      <div className="page-head">
        <h1>All subjects</h1>
        <p className="muted">Pick a subject to see its topics, or start a mixed practice session.</p>
        <label className="sr-only" htmlFor="subj-filter">Filter subjects</label>
        <input id="subj-filter" className="input filter-input" placeholder="Filter subjects…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
      {c && (
        <nav className="chips cat-jump" aria-label="Categories">
          {c.categories.map((k) => <a key={k.id} href={`#${k.slug}`} className="chip">{k.name}</a>)}
        </nav>
      )}
      {loading && <Loading />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {c && c.categories.map((cat) => {
        const list = c.subjects.filter((s) => s.category_ids.includes(cat.id) && (!f || normText(s.name).includes(f)));
        if (!list.length) return null;
        return (
          <section key={cat.id} id={cat.slug} className="cat-block">
            <h2>{cat.name} <span className="count">{list.length}</span></h2>
            <div className="sv-grid">{list.map((s) => <SubjectCard key={s.id} s={s} />)}</div>
          </section>
        );
      })}
      {c && f && !c.subjects.some((s) => normText(s.name).includes(f)) && <Empty title="No subjects match">Try a shorter word, or use the main search to look inside questions.</Empty>}
    </div>
  );
}
