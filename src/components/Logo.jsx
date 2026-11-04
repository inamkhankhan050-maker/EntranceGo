import { Link, useLocation } from 'react-router-dom';

export function LogoMark({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs><linearGradient id="svg-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#312e81" /><stop offset="1" stopColor="#2563eb" /></linearGradient></defs>
      <rect width="64" height="64" rx="16" fill="url(#svg-g)" />
      <path d="M16 22c6-4 12-4 16 0v24c-4-4-10-4-16 0z" fill="#fff" opacity=".95" />
      <path d="M48 22c-6-4-12-4-16 0v24c4-4 10-4 16 0z" fill="#fff" opacity=".72" />
      <path d="M27 33l4 4 8-9" stroke="#2dd4bf" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Logo({ to = '/', sub = true }) {
  const { pathname } = useLocation();
  // Already on that page: the router won't navigate, so jump back to the top instead of doing nothing.
  const onClick = () => { if (pathname === to) window.scrollTo({ top: 0, behavior: 'smooth' }); };
  return (
    <Link to={to} className="logo" aria-label="EntranceGo home" onClick={onClick}>
      <LogoMark />
      <span className="logo-text">
        <span className="logo-name">Entrance<span>Go</span></span>
        {sub && <span className="logo-tag">Learn Smarter. Practice Better.</span>}
      </span>
    </Link>
  );
}
