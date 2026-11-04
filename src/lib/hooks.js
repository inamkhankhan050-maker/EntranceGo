import { useEffect, useState, useCallback, useRef, createContext, useContext } from 'react';
import { useLocation } from 'react-router-dom';
import { SITE_URL } from './config.js';

// Async loader with loading / error / reload
export function useAsync(fn, deps = []) {
  const [state, set] = useState({ loading: true, error: null, data: null });
  // First load (or a change of deps) shows the loading state; reload() refreshes quietly and keeps the current data on screen.
  const silent = useRef(false);
  const run = useCallback(() => {
    let alive = true;
    const quiet = silent.current; silent.current = false;
    set((s) => (quiet && s.data ? { ...s, error: null } : { loading: true, error: null, data: null }));
    Promise.resolve().then(fn).then((data) => alive && set({ loading: false, error: null, data }))
      .catch((error) => alive && set({ loading: false, error, data: null }));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(run, [run]);
  const reload = useCallback(() => { silent.current = true; return run(); }, [run]);
  return { ...state, reload };
}

function setMeta(attr, key, content) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el); }
  el.setAttribute('content', content);
}

// Unique title / description / canonical / Open Graph per page
export function useMeta(title, description, { noindex = false } = {}) {
  const { pathname } = useLocation();
  useEffect(() => {
    const full = title ? `${title} | EntranceGo` : 'EntranceGo — Learn Smarter. Practice Better.';
    document.title = full;
    const desc = description || 'Practise MCQs for competitive exams, programming, engineering and university subjects with answers and explanations.';
    setMeta('name', 'description', desc);
    setMeta('property', 'og:title', full);
    setMeta('property', 'og:description', desc);
    setMeta('name', 'robots', noindex ? 'noindex,nofollow' : 'index,follow');
    const base = import.meta.env.BASE_URL.replace(/\/$/, '');
    const url = (SITE_URL || window.location.origin + base) + (pathname === '/' ? '/' : pathname);
    setMeta('property', 'og:url', url);
    let link = document.head.querySelector('link[rel="canonical"]');
    if (!link) { link = document.createElement('link'); link.rel = 'canonical'; document.head.appendChild(link); }
    link.href = url;
  }, [title, description, pathname, noindex]);
}

// ---------- toasts ----------
export const ToastContext = createContext({ toast: () => {} });
export const useToast = () => useContext(ToastContext).toast;
