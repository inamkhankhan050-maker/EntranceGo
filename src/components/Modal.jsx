import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export function Modal({ title, onClose, children, wide }) {
  const ref = useRef();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // Runs once per open. Depending on onClose (a new function each render) re-ran this on every
  // keystroke and pulled focus off the input being typed in.
  useEffect(() => {
    const prev = document.activeElement;
    const first = ref.current?.querySelector('input:not([type=hidden]):not([disabled]), textarea, select');
    (first || ref.current)?.focus();
    const onKey = (e) => e.key === 'Escape' && closeRef.current();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus?.(); };
  }, []);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-labelledby="modal-title" tabIndex={-1} ref={ref}>
        <div className="modal-head">
          <h2 id="modal-title">{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Confirm({ title, children, confirmLabel = 'Delete', danger = true, busy, onConfirm, onClose }) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="confirm-text">{children}</div>
      <div className="form-actions">
        <button className="btn btn-outline" onClick={onClose} disabled={busy}>Cancel</button>
        <button className={'btn ' + (danger ? 'btn-danger' : 'btn-primary')} onClick={onConfirm} disabled={busy}>{busy ? 'Working…' : confirmLabel}</button>
      </div>
    </Modal>
  );
}
