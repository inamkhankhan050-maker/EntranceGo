import { useEffect, useState, useCallback, useRef } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { backend } from '../lib/api.js';
import { Menu, Search, UserRound } from 'lucide-react';
import Logo from './Logo.jsx';
import Drawer from './Drawer.jsx';
import { useAuth } from '../lib/auth.jsx';
import { ToastContext } from '../lib/hooks.js';
import { IS_DEMO } from '../lib/config.js';

const NAV = [['/subjects', 'Subjects'], ['/exams', 'Exams'], ['/mock-tests', 'Mock Tests'], ['/practice', 'Practice Sets'], ['/my/mock-tests', 'My Mock Tests']];

export function SearchBox({ big, autoFocus, initial = '' }) {
  const [q, setQ] = useState(initial);
  const nav = useNavigate();
  useEffect(() => setQ(initial), [initial]);
  return (
    <form role="search" className={'searchbox' + (big ? ' big' : '')} onSubmit={(e) => { e.preventDefault(); if (q.trim()) nav(`/search?q=${encodeURIComponent(q.trim())}`); }}>
      <label htmlFor={big ? 'search-big' : 'search-nav'} className="sr-only">Search subjects, topics, exams and questions</label>
      <input id={big ? 'search-big' : 'search-nav'} type="search" value={q} onChange={(e) => setQ(e.target.value)} autoFocus={autoFocus}
        placeholder={big ? 'Search subjects, topics, exams or any question…' : 'Search…'} minLength={2} />
      <button type="submit" aria-label="Search"><Search size={big ? 20 : 17} /></button>
    </form>
  );
}

function Header() {
  const [open, setOpen] = useState(false);
  const { user, isAdmin } = useAuth();
  const loc = useLocation();
  const closeMenu = useCallback(() => setOpen(false), []);
  useEffect(() => setOpen(false), [loc.pathname, loc.hash]);
  return (
    <header className="site-header">
      <div className="container header-row">
        <Logo />
        <nav className="main-nav" aria-label="Main">
          {NAV.map(([to, label]) => <NavLink key={to} to={to}>{label}</NavLink>)}
        </nav>
        <div className="header-tools">
          <div className="hide-sm header-search"><SearchBox /></div>
          {user
            ? <Link to="/progress" className="btn btn-ghost btn-sm hide-sm" title={user.email}><UserRound size={16} /> Account</Link>
            : <Link to="/login" className="btn btn-primary btn-sm hide-sm"><UserRound size={16} /> Login</Link>}
          <button className="menu-btn" aria-expanded={open} aria-controls="mobile-nav" aria-label="Open menu" onClick={() => setOpen(true)}>
            <Menu size={22} />
          </button>
        </div>
      </div>
      <Drawer open={open} onClose={closeMenu} />
    </header>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div>
          <Logo />
          <p className="muted small footer-about">Free MCQ practice with clear explanations. EntranceGo is an independent learning platform and is not affiliated with SSC, RRB or any exam-conducting body.</p>
        </div>
        <div>
          <h2 className="footer-h">Practice</h2>
          <Link to="/subjects">All subjects</Link><Link to="/exams">Exams</Link><Link to="/practice">Practice sets</Link><Link to="/search">Search</Link>
        </div>
        <div>
          <h2 className="footer-h">Popular</h2>
          <Link to="/subjects/aptitude">Aptitude</Link><Link to="/subjects/english">English</Link><Link to="/subjects/python">Python</Link><Link to="/exams/ssc-cgl">SSC CGL</Link>
        </div>
        <div>
          <h2 className="footer-h">EntranceGo</h2>
          <Link to="/about">About</Link><Link to="/contact">Contact</Link><Link to="/privacy">Privacy Policy</Link><Link to="/terms">Terms</Link><Link to="/disclaimer">Disclaimer</Link>
        </div>
      </div>
      <div className="container footer-bottom muted small">© {new Date().getFullYear()} EntranceGo. Learn Smarter. Practice Better.</div>
    </footer>
  );
}

export function DemoBanner({ admin }) {
  if (!IS_DEMO) return null;
  return (
    <div className="demo-banner" role="note">
      <strong>Demo mode.</strong> {admin
        ? 'No database is connected, so the admin panel is open and edits are saved only in this browser. Connect Supabase to turn on secure admin login and shared storage.'
        : 'Progress is saved only in this browser until the database is connected.'}
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const id = useRef(0);
  const toast = useCallback((message, type = 'success') => {
    const t = { id: ++id.current, message, type };
    setToasts((x) => [...x, t]);
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== t.id)), type === 'error' ? 6000 : 3500);
  }, []);
  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={`toast toast-${t.type}`} role={t.type === 'error' ? 'alert' : 'status'}>{t.message}</div>)}
      </div>
    </ToastContext.Provider>
  );
}

// Anonymous page-view counter: a random per-browser id, no personal data. Admin pages are skipped.
function visitorId() {
  try { let v = localStorage.getItem('eg-visitor'); if (!v) { v = (crypto.randomUUID?.() || String(Math.random()).slice(2) + Date.now()); localStorage.setItem('eg-visitor', v); } return v; } catch { return null; }
}
export function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  useEffect(() => { if (pathname.startsWith('/admin') || navigator.webdriver) return; const v = visitorId(); if (v) backend.trackVisit(v, pathname).catch(() => {}); }, [pathname]);
  return null;
}

export default function Layout() {
  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <Header />
      <DemoBanner />
      <main id="main" tabIndex={-1}><Outlet /></main>
      <Footer />
    </>
  );
}
