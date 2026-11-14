import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, NavLink } from 'react-router-dom';
import { X, Moon, Sun, UserRound, ShieldCheck, ChevronRight, ChevronDown, LogOut, Search } from 'lucide-react';
import Logo from './Logo.jsx';
import { useAuth } from '../lib/auth.jsx';
import { getCatalog } from '../lib/api.js';
import { useTheme } from '../lib/theme.js';
import { IS_DEMO } from '../lib/config.js';

// Menu groups mapped to catalog categories.
const GROUPS = [
  ['competitive-exams', 'University Entrance Exams MCQs'],
  ['engineering-gate', 'CUET ENTRANCE EXAM MCQs'],
  ['graduation-postgraduate', 'JMI ENTRANCE EXAM MCQs'],
  ['interview-preparation', 'AMU ENTRANCE EXAM MCQs'],
];

function Group({ id, label, open, onToggle, children }) {
  return (
    <div className={'dr-group' + (open ? ' open' : '')}>
      <button className="dr-row dr-acc" aria-expanded={open} aria-controls={`dr-${id}`} onClick={onToggle}>
        <span>{label}</span><ChevronDown size={20} className="dr-caret" aria-hidden="true" />
      </button>
      {open && <div id={`dr-${id}`} className="dr-sub">{children}</div>}
    </div>
  );
}

export default function Drawer({ open, onClose }) {
  const { user, isAdmin, signOut } = useAuth();
  const [theme, toggleTheme] = useTheme();
  const [cat, setCat] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const panel = useRef(null);

  useEffect(() => { if (open && !cat) getCatalog().then(setCat).catch(() => {}); }, [open, cat]);
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [open, onClose]);

  const toggle = (id) => setExpanded((x) => (x === id ? null : id));
  const subjectsOf = (slug) => {
    if (!cat) return [];
    const c = cat.categories.find((k) => k.slug === slug);
    return c ? cat.subjects.filter((s) => s.category_ids.includes(c.id)) : [];
  };
  const coursesOf = (slug) => {
    const c = cat?.categories.find((k) => k.slug === slug);
    return c ? cat.courses.filter((k) => k.category_id === c.id) : [];
  };

  // Render into <body>: the sticky header's backdrop-filter would otherwise trap position: fixed.
  return createPortal(
    <div className={'drawer-root' + (open ? ' is-open' : '')} aria-hidden={!open} {...(open ? {} : { inert: '' })}>
      <div className="drawer-overlay" onClick={onClose} />
      <aside id="mobile-nav" className="drawer" role="dialog" aria-modal="true" aria-label="Menu" ref={panel} tabIndex={-1}>
        <div className="drawer-head">
          <Logo />
          <button className="drawer-close" aria-label="Close menu" onClick={onClose}><X size={26} /></button>
        </div>

        <div className="dr-block">
          <button className="dr-row dr-icon" role="switch" aria-checked={theme === 'dark'} onClick={toggleTheme}>
            {theme === 'dark' ? <Sun size={22} /> : <Moon size={22} />}
            <span>Dark Mode</span>
            <span className={'dr-switch' + (theme === 'dark' ? ' on' : '')} aria-hidden="true"><i /></span>
          </button>
          {user ? (
            <>
              <Link to="/progress" className="dr-row dr-icon"><UserRound size={22} /><span className="dr-ellipsis">My Account<small>{user.email}</small></span><ChevronRight size={20} className="dr-caret" /></Link>
              <button className="dr-row dr-icon" onClick={() => { signOut(); onClose(); }}><LogOut size={22} /><span>Logout</span></button>
            </>
          ) : (
            <Link to="/login" className="dr-row dr-icon"><UserRound size={22} /><span>Login</span><ChevronRight size={20} className="dr-caret" /></Link>
          )}
          {(isAdmin || !user) && (
            <Link to="/admin" className="dr-row dr-icon"><ShieldCheck size={22} /><span>Admin Panel</span><ChevronRight size={20} className="dr-caret" /></Link>
          )}
        </div>

        <nav aria-label="Mobile">
          <NavLink to="/" end className="dr-row dr-main">Home</NavLink>
          {GROUPS.map(([slug, label]) => {
            const list = subjectsOf(slug);
            const courses = coursesOf(slug);
            if (cat && !list.length && !courses.length) return null;
            return (
              <Group key={slug} id={slug} label={label} open={expanded === slug} onToggle={() => toggle(slug)}>
                {!cat && <span className="dr-link muted">Loading…</span>}
                {courses.map((k) => <NavLink key={k.id} to={`/courses/${k.slug}`} className="dr-link">{k.name}</NavLink>)}
                {list.map((s) => <NavLink key={s.id} to={`/subjects/${s.slug}`} className="dr-link">{s.name}</NavLink>)}
                {cat && <Link to={`/subjects#${slug}`} className="dr-link dr-all">View all →</Link>}
              </Group>
            );
          })}
          <Group id="exams" label="Exams" open={expanded === 'exams'} onToggle={() => toggle('exams')}>
            {!cat && <span className="dr-link muted">Loading…</span>}
            {cat?.exams.map((e) => <NavLink key={e.id} to={`/exams/${e.slug}`} className="dr-link">{e.name}</NavLink>)}
            {cat && <Link to="/exams" className="dr-link dr-all">All exams →</Link>}
          </Group>
          <NavLink to="/mock-tests" className="dr-row dr-main">Full Mock Tests</NavLink>
          <NavLink to="/pyq" className="dr-row dr-main">PYQ Papers</NavLink>
          <NavLink to="/practice" className="dr-row dr-main">Practice Sets</NavLink>
          <NavLink to="/my/mock-tests" className="dr-row dr-main">My Mock Tests</NavLink>
          <NavLink to="/my/performance" className="dr-row dr-main">My Performance</NavLink>
          <NavLink to="/progress" className="dr-row dr-main">My Progress</NavLink>
          <NavLink to="/search" className="dr-row dr-main"><span className="dr-inline"><Search size={18} /> Search</span></NavLink>
        </nav>
        {IS_DEMO && <p className="dr-note">Demo mode: accounts and comments are saved only on this device until the database is connected.</p>}
      </aside>
    </div>,
    document.body,
  );
}
