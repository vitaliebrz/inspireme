import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import Logo from '../../components/Logo';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setError('');
    setLoading(true);
    try {
      const user = await login(email, password);
      // firstLogin → product tour (implementat la AUTH-06)
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
        {/* Logo + tagline centrate vertical în panou */}
        <div className="flex-1 flex flex-col justify-center">
          <Logo height={36} className="mb-6" />
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
          {/* Logo centrat — vizibil doar pe mobile (pe desktop e în panoul stâng) */}
          <div className="lg:hidden flex justify-center mb-8">
            <Logo height={40} />
          </div>

          <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text)' }}>
            Bun revenit!
          </h1>
          <p className="mb-8 text-sm" style={{ color: 'var(--text-2)' }}>
            Intră în contul tău InspireMe.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
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
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all"
                style={{
                  backgroundColor: 'var(--bg-3)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--orange)')}
                onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
              />
            </div>

            {/* Parolă */}
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
                  className="w-full pl-4 pr-10 py-2.5 rounded-xl text-sm outline-none transition-all"
                  style={{
                    backgroundColor: 'var(--bg-3)',
                    border: '1px solid var(--border)',
                    color: 'var(--text)',
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--orange)')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--text-2)' }}
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Eroare */}
            {error && (
              <p className="text-sm px-4 py-2.5 rounded-xl" style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                {error}
              </p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl font-semibold text-sm transition-opacity disabled:opacity-70 flex items-center justify-center gap-2"
              style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              {loading ? 'Se încarcă...' : 'Intră în cont'}
            </button>
          </form>

          {/* Links */}
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
        </div>
      </div>
    </div>
  );
}
