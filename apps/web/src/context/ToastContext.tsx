import { createContext, useContext, type ReactNode } from 'react';

type ToastType = 'success' | 'error' | 'info';
interface ToastContextType { toast: (message: string, type?: ToastType) => void; }
const ToastContext = createContext<ToastContextType | null>(null);

const COLORS = {
  success: { bg: '#1a2e1a', border: '#22c55e', icon: '#22c55e' },
  error:   { bg: '#2e1a1a', border: '#ef4444', icon: '#ef4444' },
  info:    { bg: '#1a1e2e', border: '#f6a623', icon: '#f6a623' },
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
  Object.assign(el.style, {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    padding: '12px 14px',
    borderRadius: '14px',
    backgroundColor: c.bg,
    border: `1.5px solid ${c.border}`,
    boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
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
    color: '#f0f2f8',
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
    color: '#8892a4',
    flexShrink: '0',
    display: 'flex',
    marginTop: '1px',
  });
  closeBtn.addEventListener('click', () => el.remove());
  el.appendChild(closeBtn);

  getContainer().appendChild(el);
  setTimeout(() => el.remove(), 4500);
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
