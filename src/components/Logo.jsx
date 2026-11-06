import { Link, useLocation } from 'react-router-dom';

const BASE = import.meta.env.BASE_URL;

// The EG mark on its own (login card, small spots).
export function LogoMark({ size = 36 }) {
  return <img src={`${BASE}logo-mark.png`} width={size} height={size} alt="" aria-hidden="true" className="logo-mark" />;
}

// Full EntranceGo logo: EG mark + wordmark + "Your Gateway to Success".
export default function Logo({ to = '/' }) {
  const { pathname } = useLocation();
  // Already on that page: the router won't navigate, so jump back to the top instead of doing nothing.
  const onClick = () => { if (pathname === to) window.scrollTo({ top: 0, behavior: 'smooth' }); };
  return (
    <Link to={to} className="logo" aria-label="EntranceGo home" onClick={onClick}>
      <img className="logo-img" src={`${BASE}logo.png`} alt="EntranceGo – Your Gateway to Success" width="232" height="45" />
    </Link>
  );
}
