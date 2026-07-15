import { useState, useEffect, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2, Check, ChevronRight } from 'lucide-react';
import { api } from '../../lib/api';
import Logo from '../../components/Logo';

const DOMAINS = ['Tech', 'Eco', 'Retail', 'Educație', 'Finanțe', 'Sănătate', 'Social', 'Food', 'Alt domeniu'];

type Step = 1 | 2;

interface PanelStats {
  ideas: number;
  collabs: number;
  users: number;
}

function formatNum(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

export default function RegisterAntreprenorPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [panelStats, setPanelStats] = useState<PanelStats | null>(null);

  // Pasul 1 — Date personale
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [confirmAdult, setConfirmAdult] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);

  // Pasul 2 — Profil profesional
  const [company, setCompany] = useState('');
  const [position, setPosition] = useState('');
  const [domain, setDomain] = useState('');
  const [customDomain, setCustomDomain] = useState('');
  const [website, setWebsite] = useState('');
  const [bioMentor, setBioMentor] = useState('');

  useEffect(() => {
    api.get<{ ideas: number; users: number; collabs: number }>('/feed/stats')
      .then(({ data }) => setPanelStats({ ideas: data.ideas, collabs: data.collabs, users: data.users }))
      .catch(() => null);
  }, []);

  const isAltDomain = domain === 'Alt domeniu';
  const finalDomain = isAltDomain ? customDomain : domain;

  const passRules = {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
  };
  const passValid = Object.values(passRules).every(Boolean);

  const step1Valid =
    firstName && lastName && email && passValid &&
    password === confirmPass && confirmAdult && acceptTerms;

  const step2Valid = company && position && finalDomain;

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

  const statsCards = panelStats
    ? [
        { value: formatNum(panelStats.ideas), label: 'Idei active' },
        { value: formatNum(panelStats.collabs), label: 'Colaborări' },
        { value: formatNum(panelStats.users), label: 'Utilizatori' },
      ]
    : [
        { value: '—', label: 'Idei active' },
        { value: '—', label: 'Colaborări' },
        { value: '—', label: 'Utilizatori' },
      ];

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: 'var(--bg)' }}>
      {/* Panou decorativ stânga — desktop only */}
      <div
        className="hidden lg:flex flex-col items-center justify-center w-1/2 p-12"
        style={{ backgroundColor: 'var(--bg-2)' }}
      >
        <div className="flex flex-col items-center text-center max-w-xs">
          <Logo height={80} className="mb-6" />
          <h2 className="text-3xl font-bold mb-3" style={{ color: 'var(--text)' }}>
            Ești antreprenor?
          </h2>
          <p className="mb-10 text-base" style={{ color: 'var(--text-2)' }}>
            Descoperă talentele de mâine.
          </p>

          <div className="flex gap-3 w-full">
            {statsCards.map(({ value, label }) => (
              <div
                key={label}
                className="flex flex-col items-center justify-center rounded-2xl px-4 py-4 flex-1"
                style={{ backgroundColor: 'var(--bg-4)' }}
              >
                <span className="text-2xl font-bold" style={{ color: 'var(--orange)' }}>{value}</span>
                <span className="text-xs mt-1" style={{ color: 'var(--text-2)' }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Formular dreapta */}
      <div className="flex-1 flex items-center justify-center p-6 overflow-y-auto">
        <div className="w-full max-w-md py-8">
          {/* Logo mobile */}
          <div className="lg:hidden flex justify-center mb-8">
            <Logo height={40} />
          </div>

          {/* Step indicators */}
          <div className="flex items-center mb-8">
            <StepItem num={1} label="Date personale" active={step === 1} done={step > 1} />
            <div
              className="flex-1 h-px mx-3"
              style={{ backgroundColor: step > 1 ? 'var(--orange)' : 'var(--bg-4)' }}
            />
            <StepItem num={2} label="Profil profesional" active={step === 2} done={false} />
          </div>

          <form
            onSubmit={
              step === 1
                ? (e) => { e.preventDefault(); if (step1Valid) setStep(2); }
                : handleSubmit
            }
            className="space-y-4"
          >
            {step === 1 && (
              <>
                <h2 className="text-2xl font-bold mb-1" style={{ color: 'var(--text)' }}>
                  Date personale
                </h2>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Prenume" value={firstName} onChange={setFirstName} placeholder="Mihai" required />
                  <Field label="Nume" value={lastName} onChange={setLastName} placeholder="Ionescu" required />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>
                    Email business<span className="ml-0.5" style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="mihai@compania-ta.ro"
                    required
                    className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                    style={{ backgroundColor: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)', transition: 'border-color 150ms ease-out' }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--orange)')}
                    onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
                  />
                  <p className="text-xs mt-1" style={{ color: 'var(--text-2)' }}>
                    Nu sunt acceptate adrese de gmail, yahoo sau hotmail.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>
                    Parolă<span className="ml-0.5" style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPass ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Minim 8 caractere, literă mare, număr"
                      required
                      className="w-full pl-4 pr-10 py-2.5 rounded-xl text-sm outline-none"
                      style={{ backgroundColor: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)', transition: 'border-color 150ms ease-out' }}
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
                  {password && (
                    <div className="mt-2 flex gap-4 flex-wrap">
                      {([
                        [passRules.length, 'Min. 8 car.'],
                        [passRules.upper, 'Literă mare'],
                        [passRules.number, 'Număr'],
                      ] as [boolean, string][]).map(([ok, text]) => (
                        <span key={text} className="flex items-center gap-1 text-xs">
                          <Check size={10} style={{ color: ok ? '#22c55e' : 'var(--text-2)' }} />
                          <span style={{ color: ok ? '#22c55e' : 'var(--text-2)' }}>{text}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <Field
                  label="Confirmă parola"
                  type="password"
                  value={confirmPass}
                  onChange={setConfirmPass}
                  placeholder="Repetă parola"
                  error={confirmPass && confirmPass !== password ? 'Parolele nu coincid' : ''}
                  required
                />

                <label className="flex items-start gap-2 text-sm cursor-pointer" style={{ color: 'var(--text-2)' }}>
                  <input
                    type="checkbox"
                    checked={confirmAdult}
                    onChange={(e) => setConfirmAdult(e.target.checked)}
                    className="accent-orange-400 mt-0.5 shrink-0"
                    required
                  />
                  Confirm că am minim 18 ani și activez ca profesionist sau antreprenor.
                </label>

                <label className="flex items-start gap-2 text-sm cursor-pointer" style={{ color: 'var(--text-2)' }}>
                  <input
                    type="checkbox"
                    checked={acceptTerms}
                    onChange={(e) => setAcceptTerms(e.target.checked)}
                    className="accent-orange-400 mt-0.5 shrink-0"
                    required
                  />
                  <span>
                    Accept{' '}
                    <Link to="/termeni" className="underline" style={{ color: 'var(--orange)' }} target="_blank">
                      Termenii și condițiile
                    </Link>
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={!step1Valid}
                  className="w-full py-2.5 rounded-xl font-semibold text-sm transition-opacity disabled:opacity-40 flex items-center justify-center gap-2"
                  style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
                >
                  Continuă <ChevronRight size={16} />
                </button>
              </>
            )}

            {step === 2 && (
              <>
                <h2 className="text-2xl font-bold mb-1" style={{ color: 'var(--text)' }}>
                  Profil profesional
                </h2>

                <Field
                  label="Numele companiei"
                  value={company}
                  onChange={setCompany}
                  placeholder="TechStartup SRL"
                  required
                />

                <Field
                  label="Poziție / Rol"
                  value={position}
                  onChange={setPosition}
                  placeholder="CEO, Fondator, Manager, Investor..."
                  required
                />

                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>
                    Domeniu activitate <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <select
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    required
                    className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                    style={{ backgroundColor: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  >
                    <option value="">Selectează domeniu</option>
                    {DOMAINS.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>

                {isAltDomain && (
                  <Field
                    label="Specificați domeniul"
                    value={customDomain}
                    onChange={setCustomDomain}
                    placeholder="Ex: Imobiliare"
                  />
                )}

                <Field
                  label="Website companie"
                  value={website}
                  onChange={setWebsite}
                  placeholder="https://compania-ta.ro (opțional)"
                />

                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>
                    Ce poți oferi tinerilor? <span style={{ color: 'var(--text-2)' }}>(opțional)</span>
                  </label>
                  <textarea
                    value={bioMentor}
                    onChange={(e) => setBioMentor(e.target.value)}
                    rows={3}
                    placeholder="Experiență, mentorat, investiții, rețea de contacte..."
                    className="w-full px-4 py-2.5 rounded-xl text-sm outline-none resize-none"
                    style={{ backgroundColor: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)' }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--orange)')}
                    onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
                  />
                </div>

                {error && (
                  <p className="text-sm px-4 py-2.5 rounded-xl" style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                    {error}
                  </p>
                )}

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="flex-1 py-2.5 rounded-xl font-semibold text-sm border transition-colors"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
                  >
                    Înapoi
                  </button>
                  <button
                    type="submit"
                    disabled={!step2Valid || loading}
                    className="flex-1 py-2.5 rounded-xl font-semibold text-sm transition-opacity disabled:opacity-40 flex items-center justify-center gap-2"
                    style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
                  >
                    {loading && <Loader2 size={16} className="animate-spin" />}
                    {loading ? 'Se creează...' : 'Creează contul'}
                  </button>
                </div>
              </>
            )}
          </form>

          <p className="text-center text-sm mt-6" style={{ color: 'var(--text-2)' }}>
            Ai deja cont?{' '}
            <Link to="/login" className="font-semibold hover:underline" style={{ color: 'var(--orange)' }}>
              Intră în cont
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function StepItem({ num, label, active, done }: { num: number; label: string; active: boolean; done: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
        style={{
          backgroundColor: (active || done) ? 'var(--orange)' : 'var(--bg-4)',
          color: (active || done) ? '#fff' : 'var(--text-2)',
        }}
      >
        {done ? <Check size={11} /> : num}
      </div>
      <span
        className="text-sm font-medium whitespace-nowrap"
        style={{ color: active ? 'var(--text)' : 'var(--text-2)' }}
      >
        {label}
      </span>
    </div>
  );
}

function Field({
  label, value, onChange, placeholder, type = 'text', error = '', required = false,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; error?: string; required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>
        {label}{required && <span className="ml-0.5" style={{ color: '#ef4444' }}>*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
        style={{
          backgroundColor: 'var(--bg-3)',
          border: `1px solid ${error ? '#ef4444' : 'var(--border)'}`,
          color: 'var(--text)',
          transition: 'border-color 150ms ease-out',
        }}
        onFocus={(e) => (e.currentTarget.style.borderColor = error ? '#ef4444' : 'var(--orange)')}
        onBlur={(e) => (e.currentTarget.style.borderColor = error ? '#ef4444' : 'var(--border)')}
      />
      {error && <p className="text-xs mt-1" style={{ color: '#ef4444' }}>{error}</p>}
    </div>
  );
}
