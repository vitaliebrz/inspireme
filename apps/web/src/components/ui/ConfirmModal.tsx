import { useState, useEffect, useRef } from 'react';
import { X, AlertTriangle, Loader2 } from 'lucide-react';

interface Props {
  open: boolean;
  title: string;
  description?: string;
  danger?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  withInput?: boolean;
  inputLabel?: string;
  inputPlaceholder?: string;
  inputMinLength?: number;
  inputType?: string;
  onConfirm: (value?: string) => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  open, title, description, danger = false,
  confirmLabel = 'Confirmă', cancelLabel = 'Anulează',
  loading = false,
  withInput = false, inputLabel, inputPlaceholder, inputMinLength = 0, inputType = 'text',
  onConfirm, onCancel,
}: Props) {
  const [val, setVal] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setVal('');
    if (withInput) {
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open, withInput]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [open, onCancel]);

  if (!open) return null;

  const canConfirm = !loading && (!withInput || val.trim().length >= inputMinLength);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop-anim"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        className="w-full max-w-sm rounded-2xl shadow-2xl modal-content-anim"
        style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-start justify-between p-5 pb-3">
          <div className="flex items-center gap-3">
            {danger && (
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' }}
              >
                <AlertTriangle size={18} />
              </div>
            )}
            <h3 className="font-semibold text-base" style={{ color: 'var(--text)' }}>
              {title}
            </h3>
          </div>
          <button
            onClick={onCancel}
            className="p-1.5 rounded-lg shrink-0 cursor-pointer"
            style={{ color: 'var(--text-2)' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-3)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <X size={18} />
          </button>
        </div>

        {(description || withInput) && (
          <div className="px-5 pb-3">
            {description && (
              <p className="text-sm" style={{ color: 'var(--text-2)' }}>{description}</p>
            )}
            {withInput && (
              <div className={description ? 'mt-3' : ''}>
                {inputLabel && (
                  <label
                    className="block text-sm font-medium mb-1.5"
                    style={{ color: 'var(--text)' }}
                  >
                    {inputLabel}
                  </label>
                )}
                <input
                  ref={inputRef}
                  type={inputType}
                  value={val}
                  onChange={(e) => setVal(e.target.value)}
                  placeholder={inputPlaceholder}
                  className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                  style={{
                    backgroundColor: 'var(--bg-3)',
                    border: '1px solid var(--border)',
                    color: 'var(--text)',
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--orange)')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
                />
                {inputMinLength > 0 && val.length > 0 && val.trim().length < inputMinLength && (
                  <p className="text-xs mt-1" style={{ color: 'var(--text-2)' }}>
                    Minim {inputMinLength} caractere
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2 p-5 pt-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium cursor-pointer"
            style={{
              backgroundColor: 'var(--bg-3)',
              color: 'var(--text-2)',
              border: '1px solid var(--border)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-4)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-3)')}
          >
            {cancelLabel}
          </button>
          <button
            onClick={() => onConfirm(withInput ? val.trim() : undefined)}
            disabled={!canConfirm}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: danger ? '#ef4444' : 'var(--orange)', color: '#fff' }}
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
