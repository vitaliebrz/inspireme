import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { api } from '../../lib/api';

const DOMAINS = ['Tech', 'Eco', 'Retail', 'Educație', 'Finanțe', 'Sănătate', 'Social', 'Food', 'Alt domeniu'];

export default function RegisterAntreprenorPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [showPass, setShowPass] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName]   = useState('');
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [company, setCompany]     = useState('');
  const [position, setPosition]   = useState('');
  const [domain, setDomain]       = useState('');
  const [customDomain, setCustomDomain] = useState('');
  const [website, setWebsite]     = useState('');
  const [bioMentor, setBioMentor] = useState('');
  const [confirmAdult, setConfirmAdult] = useState(false);
  const [acceptTerms, setAcceptTerms]   = useState(false);

  const isAltDomain = domain === 'Alt domeniu';
  const finalDomain = isAltDomain ? customDomain : domain;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/register/antreprenor', {
        firstName, lastName, email, password, confirmPassword: confirmPass,
        company, position, domain: finalDomain, website, bioMentor,
        confirmAdult: true, acceptTerms: true,
      });
      navigate('/login', { state: { registered: true } });
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { error?: string } } };
      setError(apiErr.response?.data?.error ?? 'A apărut o eroare. Încearcă din nou.');
    } finally {
      setLoading(false);
    }
  };

  const formValid =
    firstName && lastName && email && password && password === confirmPass &&
    finalDomain && confirmAdult && acceptTerms;

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: 'var(--bg)' }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="text-2xl font-extrabold" style={{ color: 'var(--orange)' }}>InspireMe</Link>
          <h1 className="text-xl font-bold mt-4" style={{ color: 'var(--text)' }}>Cont de antreprenor</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-2)' }}>
            Evaluează idei și investește în viitorul României.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Prenume" value={firstName} onChange={setFirstName} placeholder="Mihai" />
            <Field label="Nume" value={lastName} onChange={setLastName} placeholder="Ionescu" />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>
              Email de business
            </label>
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="mihai@compania-ta.ro" required
              className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
              style={{ backgroundColor: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
            <p className="text-xs mt-1" style={{ color: 'var(--text-2)' }}>
              Nu sunt acceptate adrese de gmail, yahoo sau hotmail.
            </p>
          </div>

          <div className="relative">
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>Parolă</label>
            <input
              type={showPass ? 'text' : 'password'} value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minim 8 caractere, literă mare, număr" required
              className="w-full pl-4 pr-10 py-2.5 rounded-xl text-sm outline-none"
              style={{ backgroundColor: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
            <button type="button" onClick={() => setShowPass((v) => !v)}
              className="absolute right-3 bottom-2.5" style={{ color: 'var(--text-2)' }}>
              {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          <Field label="Confirmă parola" type="password" value={confirmPass} onChange={setConfirmPass}
            placeholder="Repetă parola"
            error={confirmPass && confirmPass !== password ? 'Parolele nu coincid' : ''} />

          <Field label="Companie" value={company} onChange={setCompany} placeholder="TechStartup SRL" />
          <Field label="Poziție / Rol" value={position} onChange={setPosition} placeholder="CEO, Fondator, Manager..." />

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>
              Domeniu activitate <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <select value={domain} onChange={(e) => setDomain(e.target.value)} required
              className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
              style={{ backgroundColor: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)' }}>
              <option value="">Selectează domeniu</option>
              {DOMAINS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          {isAltDomain && (
            <Field label="Specificați domeniul" value={customDomain} onChange={setCustomDomain} placeholder="Ex: Imobiliare" />
          )}

          <Field label="Website companie" value={website} onChange={setWebsite} placeholder="https://compania-ta.ro" />

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>
              Ce poți oferi tinerilor? <span style={{ color: 'var(--text-2)' }}>(opțional)</span>
            </label>
            <textarea value={bioMentor} onChange={(e) => setBioMentor(e.target.value)} rows={3}
              placeholder="Experiență, mentorat, investiții, rețea de contacte..."
              className="w-full px-4 py-2.5 rounded-xl text-sm outline-none resize-none"
              style={{ backgroundColor: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          </div>

          <label className="flex items-start gap-2 text-sm cursor-pointer" style={{ color: 'var(--text-2)' }}>
            <input type="checkbox" checked={confirmAdult} onChange={(e) => setConfirmAdult(e.target.checked)}
              className="accent-orange-400 mt-0.5 shrink-0" required />
            Confirm că am minim 18 ani și activez ca profesionist sau antreprenor.
          </label>

          <label className="flex items-start gap-2 text-sm cursor-pointer" style={{ color: 'var(--text-2)' }}>
            <input type="checkbox" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)}
              className="accent-orange-400 mt-0.5 shrink-0" required />
            Accept{' '}
            <Link to="/termeni" className="underline" style={{ color: 'var(--orange)' }} target="_blank">
              Termenii și condițiile
            </Link>
          </label>

          {error && (
            <p className="text-sm px-4 py-2.5 rounded-xl" style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
              {error}
            </p>
          )}

          <button type="submit" disabled={!formValid || loading}
            className="w-full py-2.5 rounded-xl font-semibold text-sm transition-opacity disabled:opacity-40 flex items-center justify-center gap-2"
            style={{ backgroundColor: 'var(--orange)', color: '#fff' }}>
            {loading && <Loader2 size={16} className="animate-spin" />}
            {loading ? 'Se creează...' : 'Creează cont'}
          </button>
        </form>

        <p className="text-center text-sm mt-6" style={{ color: 'var(--text-2)' }}>
          Ai deja cont?{' '}
          <Link to="/login" className="font-semibold hover:underline" style={{ color: 'var(--orange)' }}>
            Intră în cont
          </Link>
        </p>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text', error = '' }:
  { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; error?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all"
        style={{ backgroundColor: 'var(--bg-3)', border: `1px solid ${error ? '#ef4444' : 'var(--border)'}`, color: 'var(--text)' }} />
      {error && <p className="text-xs mt-1" style={{ color: '#ef4444' }}>{error}</p>}
    </div>
  );
}
