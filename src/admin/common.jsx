import { useId, isValidElement, cloneElement } from 'react';
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, BookOpen, FolderTree, ListChecks, FileUp, ClipboardList, GraduationCap, Users, ExternalLink, LogOut, Library, Timer, BarChart3 } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { useMeta } from '../lib/hooks.js';
import { IS_DEMO } from '../lib/config.js';
import Logo from '../components/Logo.jsx';
import { DemoBanner } from '../components/Layout.jsx';
import { Loading } from '../components/States.jsx';

const LINKS = [
  ['/admin', 'Dashboard', LayoutDashboard, true], ['/admin/subjects', 'Subjects', BookOpen], ['/admin/topics', 'Topics', FolderTree],
  ['/admin/questions', 'Questions', ListChecks], ['/admin/import', 'Bulk import', FileUp], ['/admin/sets', 'Practice sets', ClipboardList],
  ['/admin/exams', 'Exams', GraduationCap], ['/admin/courses', 'Courses', Library], ['/admin/mocks', 'Mock tests', Timer],
  ['/admin/mock-attempts', 'Mock attempts', BarChart3], ['/admin/students', 'Students', Users],
];

export function AdminLayout() {
  useMeta('Admin', undefined, { noindex: true });
  const { user, ready, isAdmin, adminChecked, signOut } = useAuth();
  const loc = useLocation();

  let gate = null;
  if (!IS_DEMO) {
    if (!ready || (user && !adminChecked)) gate = <Loading label="Checking access…" />;
    else if (!user) gate = (
      <div className="card gate"><h1>Admin sign-in required</h1><p className="muted">Sign in with an administrator account to manage EntranceGo content.</p>
        <Link className="btn btn-primary" to="/login" state={{ from: loc.pathname }}>Sign in</Link></div>);
    else if (!isAdmin) gate = (
      <div className="card gate"><h1>Not authorised</h1><p className="muted">You're signed in as {user.email}, but this account is not an administrator. Admin access is granted only from the database (see the README, "Create the first administrator").</p>
        <div className="action-row center"><Link className="btn btn-outline" to="/">Back to site</Link><button className="btn btn-ghost" onClick={signOut}>Sign out</button></div></div>);
  }

  return (
    <div className="admin">
      <aside className="admin-side">
        <Logo to="/admin" sub={false} />
        <span className="admin-label">Admin panel</span>
        {!gate && <nav aria-label="Admin">
          {LINKS.map(([to, label, Icon, end]) => <NavLink key={to} to={to} end={end}><Icon size={18} aria-hidden="true" /> {label}</NavLink>)}
        </nav>}
        <div className="admin-side-foot">
          <Link to="/"><ExternalLink size={16} /> View site</Link>
          {!IS_DEMO && user && <button className="linkish" onClick={signOut}><LogOut size={16} /> Sign out</button>}
        </div>
      </aside>
      <div className="admin-main">
        <DemoBanner admin />
        <div className="admin-content">{gate || <Outlet />}</div>
      </div>
    </div>
  );
}

// Label is tied to the control with htmlFor/id, so the accessible name is just the label text.
export function Field({ label, error, hint, children, required, className = '' }) {
  const auto = useId();
  const direct = isValidElement(children) && ['input', 'select', 'textarea'].includes(children.type);
  const id = direct ? children.props.id || auto : undefined;
  const msgId = auto + '-msg';
  const control = direct ? cloneElement(children, { id, 'aria-invalid': error ? true : undefined, 'aria-describedby': hint || error ? msgId : undefined }) : children;
  const Wrap = direct ? 'div' : 'label';
  return (
    <Wrap className={'field ' + className + (error ? ' has-error' : '')}>
      {direct ? <label htmlFor={id}>{label}{required && <em aria-hidden="true"> *</em>}</label> : <span>{label}{required && <em aria-hidden="true"> *</em>}</span>}
      {control}
      {hint && !error && <small id={msgId} className="muted">{hint}</small>}
      {error && <small id={msgId} className="err-text" role="alert">{error}</small>}
    </Wrap>
  );
}

export const StatusBadge = ({ s }) => <span className={`badge badge-${s}`}>{s === 'published' ? 'Published' : s === 'archived' ? 'Archived' : 'Draft'}</span>;

export function AdminHead({ title, children, sub }) {
  return (
    <div className="admin-head">
      <div><h1>{title}</h1>{sub && <p className="muted small">{sub}</p>}</div>
      <div className="admin-head-actions">{children}</div>
    </div>
  );
}
