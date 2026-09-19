import { createContext, useContext, type ReactNode } from 'react';

type ToastType = 'success' | 'error' | 'info';
interface ToastContextType { toast: (message: string, type?: ToastType) => void; }
const ToastContext = createContext<ToastContextType | null>(null);

// Fundal = tentă transparentă a culorii semantice peste --bg-2 (theme-aware,
// spre deosebire de hex-urile opace de dinainte care ignorau light mode complet).
const COLORS = {
  success: { bg: 'rgba(34,197,94,0.12)', border: '#22c55e', icon: '#22c55e' },
  error:   { bg: 'rgba(239,68,68,0.12)', border: '#ef4444', icon: '#ef4444' },
  info:    { bg: 'rgba(246,166,35,0.12)', border: '#f6a623', icon: '#f6a623' },
};

const ICONS = {
  success: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
  error:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
  info:    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
};

let _container: HTMLDivElement | null = null;

function getContainer(): HTMLDivElement {
  if (!_container || !document.body.contains(_container)) {
    _container = document.createElement('div');
    Object.assign(_container.style, {
      position: 'fixed',
      top: '72px',
      right: '16px',
      zIndex: '999999',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      width: '320px',
      maxWidth: 'calc(100vw - 32px)',
      pointerEvents: 'none',
    });
    document.body.appendChild(_container);
  }
  return _container;
}

function showToast(message: string, type: ToastType = 'info') {
  const c = COLORS[type];

  const el = document.createElement('div');
  el.setAttribute('role', 'alert');
  el.className = 'toast-in';
  Object.assign(el.style, {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    padding: '12px 14px',
    borderRadius: '14px',
    backgroundColor: c.bg,
    border: `1.5px solid ${c.border}`,
    boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
    pointerEvents: 'all',
  });

  const icon = document.createElement('span');
  icon.innerHTML = ICONS[type];
  icon.style.color = c.icon;
  icon.style.flexShrink = '0';
  icon.style.marginTop = '1px';
  el.appendChild(icon);

  const text = document.createElement('p');
  text.textContent = message;
  Object.assign(text.style, {
    margin: '0',
    flex: '1',
    fontSize: '14px',
    fontWeight: '500',
    lineHeight: '1.4',
    color: 'var(--text)',
    wordBreak: 'break-word',
    fontFamily: 'inherit',
  });
  el.appendChild(text);

  const closeBtn = document.createElement('button');
  closeBtn.setAttribute('aria-label', 'Închide');
  closeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  Object.assign(closeBtn.style, {
    background: 'none',
    border: 'none',
    padding: '2px',
    cursor: 'pointer',
    color: 'var(--text-2)',
    flexShrink: '0',
    display: 'flex',
    marginTop: '1px',
  });

  // Ieșire animată — schimbăm clasa și lăsăm keyframe-ul „toast-out" să ruleze
  // înainte de a scoate elementul din DOM efectiv (altfel dispare instant).
  // Plasă de siguranță cu setTimeout: sub prefers-reduced-motion, regula globală
  // dezactivează animația explicit (animation:none) — fără ea, „animationend"
  // nu s-ar mai declanșa niciodată și toast-ul ar rămâne blocat, invizibil, în DOM.
  let dismissed = false;
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    clearTimeout(autoTimeout);
    el.classList.remove('toast-in');
    el.classList.add('toast-out');
    let removed = false;
    const finish = () => { if (!removed) { removed = true; el.remove(); } };
    el.addEventListener('animationend', finish, { once: true });
    setTimeout(finish, 250);
  };

  closeBtn.addEventListener('click', dismiss);
  el.appendChild(closeBtn);

  getContainer().appendChild(el);
  const autoTimeout = setTimeout(dismiss, 4500);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <ToastContext.Provider value={{ toast: showToast }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextType {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
