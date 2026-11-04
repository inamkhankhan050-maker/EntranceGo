import { useMemo, useState } from 'react';
import { Phone, MessageCircle, Download, Search } from 'lucide-react';
import { backend } from '../lib/api.js';
import { downloadText } from '../lib/csv.js';
import { useAsync } from '../lib/hooks.js';
import { AdminHead } from './common.jsx';
import { Loading, ErrorState, Empty } from '../components/States.jsx';

const fmtDate = (s) => (s ? new Date(s).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');
const csvCell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };

export default function StudentsAdmin() {
  const { data, loading, error, reload } = useAsync(() => backend.adminSelect('student_profiles'), []);
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    const list = [...(data || [])].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    const t = q.trim().toLowerCase(); const d = t.replace(/\D/g, '');
    if (!t) return list;
    return list.filter((r) => (r.full_name || '').toLowerCase().includes(t) || (r.email || '').toLowerCase().includes(t) || (d && (r.phone || '').includes(d)));
  }, [data, q]);

  const exportCsv = () => {
    const lines = [['Name', 'Mobile', 'Email', 'Joined'], ...rows.map((r) => [r.full_name || '', r.phone, r.email || '', fmtDate(r.created_at)])];
    downloadText(`entrancego-students-${new Date().toISOString().slice(0, 10)}.csv`, '\ufeff' + lines.map((l) => l.map(csvCell).join(',')).join('\n'));
  };

  return (
    <>
      <AdminHead title="Students" sub="Everyone who created an account with a mobile number. Visible only to administrators.">
        <button className="btn btn-outline" onClick={exportCsv} disabled={!rows.length}><Download size={17} /> Download CSV</button>
      </AdminHead>
      {loading ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : !data.length ? (
        <Empty title="No students yet">New sign-ups will appear here with their name, mobile number and email.</Empty>
      ) : (
        <>
          <div className="students-tools">
            <label className="search-inline"><Search size={17} aria-hidden="true" />
              <input className="input" type="search" placeholder="Search name, mobile or email" aria-label="Search students" value={q} onChange={(e) => setQ(e.target.value)} /></label>
            <span className="muted small">{rows.length} of {data.length} student{data.length === 1 ? '' : 's'}</span>
          </div>
          {rows.length === 0 ? <Empty title="No students match this search" /> : (
            <div className="table-wrap">
              <table className="table students-table">
                <thead><tr><th>Name</th><th>Mobile</th><th>Email</th><th>Joined</th><th><span className="sr-only">Contact</span></th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.user_id}>
                      <td data-label="Name"><strong>{r.full_name || '—'}</strong></td>
                      <td data-label="Mobile" className="mono">{r.phone}</td>
                      <td data-label="Email" className="small">{r.email || '—'}</td>
                      <td data-label="Joined" className="small muted">{fmtDate(r.created_at)}</td>
                      <td className="row-actions">
                        <a className="icon-btn" href={`tel:${r.phone}`} aria-label={`Call ${r.full_name || r.phone}`} title="Call"><Phone size={16} /></a>
                        <a className="icon-btn" href={`https://wa.me/${String(r.phone).replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp ${r.full_name || r.phone}`} title="WhatsApp"><MessageCircle size={16} /></a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
