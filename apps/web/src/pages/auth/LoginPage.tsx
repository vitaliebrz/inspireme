import { useState, FormEvent } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Eye, EyeOff, Loader2, CheckCircle, MessageCircleQuestion } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import Logo from '../../components/Logo';
import SupportModal from '../../components/ui/SupportModal';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const registered = (location.state as { registered?: boolean } | null)?.registered ?? false;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [supportOpen, setSupportOpen] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setError('');
    setLoading(true);
    try {
      const user = await login(email, password);
      navigate('/feed');
      void user;
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })
        .response?.data?.error ?? 'A apărut o eroare. Încearcă din nou.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: 'var(--bg)' }}>
      {/* Panou decorativ stânga — desktop only */}
      <div
        className="hidden lg:flex flex-col w-1/2 p-12"
        style={{ backgroundColor: 'var(--bg-2)' }}
      >
        <div className="flex-1 flex flex-col justify-center">
          <Logo height={90} className="mb-8" />
          <h2 className="text-4xl font-bold leading-tight mb-4" style={{ color: 'var(--text)' }}>
            Conectează-te cu antreprenorii care îți pot transforma ideea în realitate.
          </h2>
          <p style={{ color: 'var(--text-2)' }}>
            Platforma pentru elevi și antreprenori din România.
          </p>
        </div>
        <p className="text-sm" style={{ color: 'var(--text-2)' }}>
          © 2026 InspireMe · Toate drepturile rezervate
        </p>
      </div>

      {/* Formular dreapta */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex justify-center mb-8">
            <Logo height={40} />
          </div>

          {registered && (
            <div
              className="flex items-center gap-3 px-4 py-3 rounded-xl mb-6"
              style={{ backgroundColor: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }}
            >
              <CheckCircle size={18} style={{ color: '#22c55e', shrink: 0 }} />
              <p className="text-sm font-medium" style={{ color: '#22c55e' }}>
                Cont creat cu succes! Intră cu datele tale.
              </p>
            </div>
          )}

          <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text)' }}>
            Bun revenit!
          </h1>
          <p className="mb-8 text-sm" style={{ color: 'var(--text-2)' }}>
            Intră în contul tău InspireMe.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="adresa@email.ro"
                required
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                style={{
                  backgroundColor: 'var(--bg-3)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  transition: 'border-color 150ms ease-out',
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--orange)')}
                onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                  Parolă
                </label>
                <Link
                  to="/reset-password"
                  className="text-xs font-medium hover:underline"
                  style={{ color: 'var(--orange)' }}
                >
                  Ai uitat parola?
                </Link>
              </div>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full pl-4 pr-10 py-2.5 rounded-xl text-sm outline-none"
                  style={{
                    backgroundColor: 'var(--bg-3)',
                    border: '1px solid var(--border)',
                    color: 'var(--text)',
                    transition: 'border-color 150ms ease-out',
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--orange)')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer hover:opacity-70"
                  style={{ color: 'var(--text-2)' }}
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <p
                className="text-sm px-4 py-2.5 rounded-xl"
                style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' }}
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl font-semibold text-sm cursor-pointer transition-opacity hover:opacity-90 disabled:opacity-70 flex items-center justify-center gap-2"
              style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              {loading ? 'Se încarcă...' : 'Intră în cont'}
            </button>
          </form>

          <div className="mt-6 space-y-2 text-center">
            <p className="text-sm" style={{ color: 'var(--text-2)' }}>
              Ești elev?{' '}
              <Link to="/register/elev" className="font-semibold hover:underline" style={{ color: 'var(--orange)' }}>
                Creează cont de elev
              </Link>
            </p>
            <p className="text-sm" style={{ color: 'var(--text-2)' }}>
              Ești antreprenor?{' '}
              <Link to="/register/antreprenor" className="font-semibold hover:underline" style={{ color: 'var(--orange)' }}>
                Creează cont de antreprenor
              </Link>
            </p>
          </div>

          <div className="mt-8 pt-6" style={{ borderTop: '1px solid var(--border)' }}>
            <button
              type="button"
              onClick={() => setSupportOpen(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium cursor-pointer hover:opacity-80 transition-opacity"
              style={{ backgroundColor: 'var(--bg-3)', color: 'var(--text-2)', border: '1px solid var(--border)' }}
            >
              <MessageCircleQuestion size={15} />
              Problemă cu contul? Contactează suportul
            </button>
          </div>
        </div>
      </div>

      <SupportModal open={supportOpen} onClose={() => setSupportOpen(false)} />
    </div>
  );
}
