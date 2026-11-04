import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { useMeta } from '../lib/hooks.js';
import { LogoMark } from '../components/Logo.jsx';
import { IS_DEMO } from '../lib/config.js';
import { peekNext, takeNext } from '../lib/mocks.js';

export function normalizeMobile(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  const m = d.length === 12 && d.startsWith('91') ? d.slice(2) : d.length === 11 && d.startsWith('0') ? d.slice(1) : d;
  return /^[6-9]\d{9}$/.test(m) ? '+91' + m : null;
}

export default function Login() {
  useMeta('Sign in', 'Sign in to EntranceGo to save your results and bookmarks.', { noindex: true });
  const auth = useAuth();
  const nav = useNavigate();
  const st = useLocation().state || {};
  // Where to go after sign-in: the page that sent us here, or the mock a guest picked before confirming their email.
  const from = st.from || peekNext() || '/progress';
  const forMock = st.reason === 'mock' || (peekNext() || '').startsWith('/mock-tests/');
  const [mode, setMode] = useState(st.reason === 'mock' ? 'signup' : 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const phone = normalizeMobile(mobile);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  if (auth.user && mode !== 'done') { takeNext(); return <Navigate to={from} replace />; }

  const submit = async (e) => {
    e.preventDefault(); if (busy) return;
    setBusy(true); setMsg(null);
    try {
      if (mode === 'signin') { await auth.signIn(email.trim(), password); takeNext(); nav(from, { replace: true }); }
      else if (mode === 'signup') {
        if (!phone) throw new Error('Enter a valid 10-digit mobile number.');
        const r = await auth.signUp(email.trim(), password, name.trim(), phone);
        setMsg({ ok: true, text: r?.session ? 'Account created. You are signed in.' : 'Account created. Open the confirmation link we emailed you, then sign in here' + (forMock ? ' and your mock test will open.' : '.') });
        setMode('signin');
      } else { await auth.resetPassword(email.trim()); setMsg({ ok: true, text: 'If that email has an account, a reset link is on its way.' }); }
    } catch (err) { setMsg({ ok: false, text: err.message }); }
    setBusy(false);
  };

  return (
    <div className="container section auth-wrap">
      <form className="card auth-card" onSubmit={submit} noValidate>
        <LogoMark size={44} />
        <h1>{mode === 'signup' ? 'Create your account' : mode === 'reset' ? 'Reset password' : 'Sign in to EntranceGo'}</h1>
        {forMock ? (
          <div className="notice login-mock" role="note"><strong>{st.mockTitle ? `Start “${st.mockTitle}”` : 'Full mock tests need a free account'}</strong><br />
            {mode === 'signup' ? 'Create your free student account to start the mock, save your result and download your report.' : 'Sign in to start the mock test. You will return to the same mock right after.'}</div>
        ) : <p className="muted small">Join the discussion, save your results and bookmark questions. Administrators sign in here too.</p>}
        {IS_DEMO && <div className="notice">Demo mode: your account is saved only in this browser on this device. Shared accounts turn on once the database is connected.</div>}
        {mode === 'signup' && (
          <label className="field"><span>Your name</span>
            <input className="input" type="text" autoComplete="name" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="Shown with your comments" /></label>
        )}
        {mode === 'signup' && (
          <label className="field"><span>Mobile number</span>
            <div className="phone-input"><span className="phone-cc">+91</span>
              <input className="input" type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={14} required value={mobile} onChange={(e) => setMobile(e.target.value.replace(/[^0-9 ]/g, ''))} placeholder="10-digit mobile number" /></div>
            {mobile && !phone ? <small className="err-text">Enter a valid 10-digit mobile number.</small> : <small className="muted">Required for your account.</small>}</label>
        )}
        <label className="field"><span>Email</span>
          <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        {mode !== 'reset' && (
          <label className="field"><span>Password</span>
            <input className="input" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
            {mode === 'signup' && <small className="muted">At least 8 characters.</small>}</label>
        )}
        {msg && <div className={msg.ok ? 'notice ok' : 'notice err'} role="alert">{msg.text}</div>}
        <button className="btn btn-primary btn-block" disabled={busy || !email || (mode === 'signup' && !phone) || (mode !== 'reset' && password.length < (mode === 'signup' ? 8 : 1))}>
          {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Send reset link' : 'Sign in'}
        </button>
        <div className="auth-links small">
          {mode !== 'signin' && <button type="button" className="linkish" onClick={() => setMode('signin')}>Back to sign in</button>}
          {mode === 'signin' && <><button type="button" className="linkish" onClick={() => setMode('signup')}>Create an account</button><button type="button" className="linkish" onClick={() => setMode('reset')}>Forgot password?</button></>}
        </div>
        <p className="small muted">New accounts are student accounts. Administrator access can only be granted from the database. <Link to="/">Back to home</Link></p>
      </form>
    </div>
  );
}
