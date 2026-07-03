import { createContext, useContext, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

const CONFIG: Record<ToastType, { bg: string; border: string; iconColor: string; icon: React.ReactNode }> = {
  success: { bg: '#1a2e1a', border: '#22c55e', iconColor: '#22c55e', icon: <CheckCircle size={16} /> },
  error:   { bg: '#2e1a1a', border: '#ef4444', iconColor: '#ef4444', icon: <AlertCircle size={16} /> },
  info:    { bg: '#2a2310', border: '#f6a623', iconColor: '#f6a623', icon: <Info size={16} /> },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const t = timers.current.get(id);
    if (t) { clearTimeout(t); timers.current.delete(id); }
  }, []);

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, type }]);
    timers.current.set(id, setTimeout(() => remove(id), 4500));
  }, [remove]);

  const toastRoot = document.getElementById('toast-root') ?? document.body;
  const portal = createPortal(
    <div style={{
      position: 'fixed',
      top: 0,
      right: 0,
      // env() pentru notch/Dynamic Island pe iOS (viewport-fit=cover în index.html)
      paddingTop: 'max(16px, env(safe-area-inset-top, 16px))',
      paddingRight: 'max(16px, env(safe-area-inset-right, 16px))',
      // 2147483647 = max CSS z-index; depășim orice modal/backdrop
      zIndex: 2147483647,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      width: 'min(340px, calc(100vw - 32px))',
      pointerEvents: 'none',
      // translateZ(0) forțează GPU compositing layer —
      // fix pentru iOS Safari care clipă position:fixed când body are overflow:hidden
      transform: 'translateZ(0)',
    }}>
      {toasts.map((t) => {
        const c = CONFIG[t.type];
        return (
          <div key={t.id} role="alert" style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            padding: '12px 14px',
            borderRadius: 14,
            backgroundColor: c.bg,
            border: `1.5px solid ${c.border}`,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            pointerEvents: 'all',
          }}>
            <span style={{ color: c.iconColor, flexShrink: 0, marginTop: 1 }}>{c.icon}</span>
            <p style={{ margin: 0, flex: 1, fontSize: 14, fontWeight: 500, lineHeight: 1.4, color: '#f0f2f8' }}>
              {t.message}
            </p>
            <button onClick={() => remove(t.id)} style={{
              background: 'none', border: 'none', padding: 2, cursor: 'pointer',
              color: '#8892a4', flexShrink: 0, display: 'flex', marginTop: 1,
            }} aria-label="Închide">
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>,
    toastRoot,
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {portal}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextType {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
