import { useState, FormEvent } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { api } from '../../lib/api';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const navigate = useNavigate();

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [message, setMessage]   = useState('');
  const [error, setError]       = useState('');

  const handleForgot = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      await api.post('/auth/forgot-password', { email });
      setMessage('Dacă emailul există, vei primi un link în câteva minute.');
    } catch {
      setError('A apărut o eroare. Încearcă din nou.');
    } finally { setLoading(false); }
  };

  const handleReset = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      await api.post('/auth/reset-password', { token, password });
      setMessage('Parola a fost schimbată! Redirecționare...');
      setTimeout(() => navigate('/login'), 2000);
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { error?: string } } };
      setError(apiErr.response?.data?.error ?? 'Link expirat sau invalid.');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: 'var(--bg)' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link to="/" className="text-2xl font-extrabold" style={{ color: 'var(--orange)' }}>InspireMe</Link>
          <h1 className="text-xl font-bold mt-4" style={{ color: 'var(--text)' }}>
            {token ? 'Setează parola nouă' : 'Resetează parola'}
          </h1>
        </div>

        {message ? (
          <div className="text-center px-4 py-6 rounded-2xl" style={{ backgroundColor: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>
            {message}
          </div>
        ) : token ? (
          <form onSubmit={handleReset} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>Parolă nouă</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="Minim 8 caractere, literă mare, număr" required
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                style={{ backgroundColor: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            </div>
            {error && <p className="text-sm px-4 py-2.5 rounded-xl" style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-70"
              style={{ backgroundColor: 'var(--orange)', color: '#fff' }}>
              {loading && <Loader2 size={16} className="animate-spin" />}
              Schimbă parola
            </button>
          </form>
        ) : (
          <form onSubmit={handleForgot} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="adresa@email.ro" required
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                style={{ backgroundColor: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            </div>
            {error && <p className="text-sm px-4 py-2.5 rounded-xl" style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-70"
              style={{ backgroundColor: 'var(--orange)', color: '#fff' }}>
              {loading && <Loader2 size={16} className="animate-spin" />}
              Trimite link de resetare
            </button>
          </form>
        )}

        <p className="text-center text-sm mt-6" style={{ color: 'var(--text-2)' }}>
          <Link to="/login" className="font-semibold hover:underline" style={{ color: 'var(--orange)' }}>
            ← Înapoi la login
          </Link>
        </p>
      </div>
    </div>
  );
}
