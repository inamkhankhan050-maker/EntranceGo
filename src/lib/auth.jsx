import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { backend } from './api.js';
import { IS_DEMO } from './config.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(IS_DEMO);
  const [adminChecked, setAdminChecked] = useState(IS_DEMO);

  const checkedFor = useRef(undefined);

  // Re-check admin only when the signed-in account actually changes. Supabase fires auth events
  // (token refresh, tab focus) for the same user; re-checking then unmounted admin pages and lost open forms.
  const refreshAdmin = useCallback(async (u, force = false) => {
    if (IS_DEMO) return;
    const id = u?.id || null;
    if (!force && checkedFor.current === id) return;
    checkedFor.current = id;
    setAdminChecked(false);
    try { setIsAdmin(u ? await backend.isAdmin() : false); } catch { setIsAdmin(false); }
    setAdminChecked(true);
  }, []);

  useEffect(() => {
    let alive = true;
    backend.getUser().then((u) => { if (!alive) return; setUser(u); setReady(true); refreshAdmin(u); })
      .catch(() => { if (alive) { setUser(null); setReady(true); setAdminChecked(true); } });
    const off = backend.onAuthChange((u) => { setUser((prev) => (prev && u && prev.id === u.id ? prev : u)); refreshAdmin(u); });
    return () => { alive = false; off(); };
  }, [refreshAdmin]);

  const value = {
    user, ready, isAdmin, adminChecked, demo: IS_DEMO,
    signIn: async (e, p) => { const u = await backend.signIn(e, p); setUser(u); await refreshAdmin(u, true); return u; },
    signUp: async (e, p, n, m) => { const r = await backend.signUp(e, p, n, m); if (r?.session && r.user) setUser(r.user); return r; },
    signOut: async () => { await backend.signOut(); checkedFor.current = null; setUser(null); setIsAdmin(IS_DEMO); },
    resetPassword: (e) => backend.resetPassword?.(e),
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
export const useAuth = () => useContext(AuthCtx);
export const displayName = (u) => (u?.user_metadata?.full_name || u?.email?.split('@')[0] || 'Student').slice(0, 40);
