import { useState, FormEvent } from 'react';
import { X, MessageCircleQuestion, Loader2, CheckCircle } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function SupportModal({ open, onClose }: Props) {
  const { user } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (message.trim().length < 10) {
      setError('Mesajul trebuie să aibă minim 10 caractere.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await api.post('/support', {
        name: name.trim() || (user ? (user.firstName ?? user.email) : 'Anonim'),
        email: email.trim() || (user ? user.email : ''),
        message: message.trim(),
      });
      setSent(true);
    } catch {
      setError('A apărut o eroare. Încearcă din nou.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    onClose();
    // Reset după animație
    setTimeout(() => { setSent(false); setMessage(''); setError(''); }, 300);
  };

  const inputStyle = {
    backgroundColor: 'var(--bg-3)',
    border: '1px solid var(--border)',
    color: 'var(--text)',
  } as const;

  return (
    <>
      <div
        className="fixed inset-0 modal-backdrop-anim"
        style={{ zIndex: 200, backgroundColor: 'rgba(0,0,0,0.55)' }}
        onClick={handleClose}
      />
      <div
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-2xl p-6 modal-content-centered-anim"
        style={{ zIndex: 201, backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)', boxShadow: '0 24px 48px rgba(0,0,0,0.3)' }}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <MessageCircleQuestion size={18} style={{ color: 'var(--orange)' }} />
            <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>Contactează suportul</h2>
          </div>
          <button
            onClick={handleClose}
            className="rounded-xl p-1.5 hover:opacity-70 cursor-pointer"
            style={{ color: 'var(--text-2)' }}
          >
            <X size={16} />
          </button>
        </div>

        {sent ? (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <CheckCircle size={40} style={{ color: '#22c55e' }} />
            <div>
              <p className="font-semibold mb-1" style={{ color: 'var(--text)' }}>Mesaj trimis!</p>
              <p className="text-sm" style={{ color: 'var(--text-2)' }}>
                Adminul va reveni la tine cât mai curând posibil.
              </p>
            </div>
            <button
              onClick={handleClose}
              className="px-5 py-2 rounded-xl text-sm font-semibold cursor-pointer hover:opacity-90"
              style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
            >
              Închide
            </button>
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <p className="text-sm" style={{ color: 'var(--text-2)' }}>
              Ai o problemă cu contul tău sau ai nevoie de ajutor? Scrie-ne mai jos.
            </p>

            {!user && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>
                    Nume <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Numele tău"
                    required
                    className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                    style={inputStyle}
                    onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--orange)')}
                    onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>
                    Email <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="adresa@email.ro"
                    required
                    className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                    style={inputStyle}
                    onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--orange)')}
                    onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>
                Mesaj <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Descrie problema sau întrebarea ta..."
                rows={4}
                required
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none resize-none"
                style={inputStyle}
                onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--orange)')}
                onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
              />
              <p className="text-xs mt-1" style={{ color: 'var(--text-2)' }}>
                {message.length}/2000
              </p>
            </div>

            {error && (
              <p className="text-sm px-4 py-2.5 rounded-xl"
                style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                {error}
              </p>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium cursor-pointer hover:opacity-80"
                style={{ backgroundColor: 'var(--bg-3)', color: 'var(--text-2)' }}
              >
                Anulează
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold cursor-pointer hover:opacity-90 disabled:opacity-70 flex items-center justify-center gap-2"
                style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
              >
                {loading && <Loader2 size={14} className="animate-spin" />}
                {loading ? 'Se trimite...' : 'Trimite'}
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
