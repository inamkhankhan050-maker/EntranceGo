import { useState } from 'react';
import { backend } from '../lib/api.js';
import { useAsync } from '../lib/hooks.js';
import { AdminHead } from './common.jsx';
import { Loading, ErrorState } from '../components/States.jsx';

const n = (x) => Number(x || 0).toLocaleString('en-IN');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthName = (ym) => { const [y, m] = ym.split('-'); return `${MONTHS[Number(m) - 1]} ${y}`; };
const dayName = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

export default function VisitorsAdmin() {
  const { data, loading, error, reload } = useAsync(() => backend.visitStats(), []);
  const [tab, setTab] = useState('daily');
  if (loading) return <Loading />;
  if (error) {
    const missing = /visit_stats|function|schema cache/i.test(error.message || '');
    return (<><AdminHead title="Visitors" /><div className="card">{missing ? <p>Visitor tracking isn't switched on in the database yet. Run <code>supabase/migrations/005_site_visits.sql</code> in the Supabase SQL Editor, then reload.</p> : <ErrorState error={error} onRetry={reload} />}</div></>);
  }
  const cards = [['Today', data.today], ['Yesterday', data.yesterday], ['This month', data.month], ['This year', data.year], ['All time', data.all]];
  const max = Math.max(1, ...data.daily.map((d) => d.visitors));
  const rows = tab === 'daily' ? [...data.daily].reverse().map((d) => [dayName(d.day), d.visitors, d.views])
    : tab === 'monthly' ? data.monthly.map((m) => [monthName(m.month), m.visitors, m.views])
    : data.yearly.map((y) => [String(y.year), y.visitors, y.views]);
  return (
    <>
      <AdminHead title="Visitors" sub="People who opened the site (one browser = one visitor), in India time. Admin pages are not counted.">
        <button className="btn btn-ghost" onClick={reload}>Refresh</button>
      </AdminHead>
      <div className="stat-grid">
        {cards.map(([label, c]) => (
          <div key={label} className="card stat-card"><span className="muted small">{label}</span><strong>{n(c.visitors)}</strong><span className="muted small">{n(c.views)} page views</span></div>
        ))}
      </div>
      <div className="card">
        <div className="section-head"><h2>Last 30 days</h2></div>
        <div className="visit-bars" role="img" aria-label="Visitors per day for the last 30 days">
          {data.daily.map((d) => <div key={d.day} className="visit-bar" title={`${dayName(d.day)}: ${d.visitors} visitors, ${d.views} views`}><span style={{ height: `${(d.visitors / max) * 100}%` }} /></div>)}
        </div>
      </div>
      <div className="card">
        <div className="seg" role="tablist">{[['daily', 'Daily'], ['monthly', 'Monthly'], ['yearly', 'Yearly']].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
        <div className="table-wrap"><table className="table">
          <thead><tr><th>{tab === 'daily' ? 'Day' : tab === 'monthly' ? 'Month' : 'Year'}</th><th>Visitors</th><th>Page views</th></tr></thead>
          <tbody>{rows.length ? rows.map((r) => <tr key={r[0]}><td>{r[0]}</td><td>{n(r[1])}</td><td>{n(r[2])}</td></tr>) : <tr><td colSpan={3} className="muted">No visits yet.</td></tr>}</tbody>
        </table></div>
      </div>
      <div className="card">
        <div className="section-head"><h2>Top pages (30 days)</h2></div>
        <div className="table-wrap"><table className="table"><thead><tr><th>Page</th><th>Views</th></tr></thead>
          <tbody>{data.top_pages.length ? data.top_pages.map((p) => <tr key={p.path}><td className="mono small">{p.path}</td><td>{n(p.views)}</td></tr>) : <tr><td colSpan={2} className="muted">No visits yet.</td></tr>}</tbody></table></div>
      </div>
    </>
  );
}
