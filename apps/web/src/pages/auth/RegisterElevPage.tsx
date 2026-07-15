import { useState, useEffect, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2, Check, ChevronRight, PenLine, Lightbulb, Star } from 'lucide-react';
import { api } from '../../lib/api';
import Logo from '../../components/Logo';
import { ICON_MAP } from '../../lib/categories';

const INTERESTS = ['Tech', 'Eco', 'Artă', 'Educație', 'Social', 'Sănătate', 'Food', 'Finanțe'];
type Step = 1 | 2;

function formatNum(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

export default function RegisterElevPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [userCount, setUserCount] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ users: number }>('/feed/stats')
      .then(({ data }) => setUserCount(formatNum(data.users)))
      .catch(() => null);
  }, []);

  // Pasul 1 — Date personale
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [isUnder16, setIsUnder16] = useState(false);
  const [parentEmail, setParentEmail] = useState('');

  // Pasul 2 — Profil elev
  const [school, setSchool] = useState('');
  const [classVal, setClassVal] = useState('');
  const [city, setCity] = useState('');
  const [bio, setBio] = useState('');
  const [interests, setInterests] = useState<string[]>([]);

  const passRules = {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
  };
  const passValid = Object.values(passRules).every(Boolean);
  const step1Valid =
    firstName && lastName && email && passValid &&
    password === confirmPass && acceptTerms &&
    (!isUnder16 || parentEmail);

  const toggleInterest = (i: string) =>
    setInterests((prev) =>
      prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]
    );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/register/elev', {
        firstName, lastName, email, password, confirmPassword: confirmPass,
        isUnder16, parentEmail: isUnder16 ? parentEmail : undefined,
        acceptTerms: true, school, class: classVal, city, bio,
        interests: interests.map((i) => i.toUpperCase()),
      });
      navigate('/login', { state: { registered: true } });
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
        className="hidden lg:flex flex-col items-center justify-center w-1/2 p-12"
        style={{ backgroundColor: 'var(--bg-2)' }}
      >
        <div className="flex flex-col items-center text-center max-w-xs">
          <Logo height={80} className="mb-6" />
          <h2 className="text-3xl font-bold mb-3" style={{ color: 'var(--text)' }}>
            Ești elev?
          </h2>
          <p className="mb-10 text-base" style={{ color: 'var(--text-2)' }}>
            Locul unde ideile tale capătă viață.
          </p>

          <div className="flex gap-4 mb-10">
            {[PenLine, Lightbulb, Star].map((Icon, i) => (
              <div
                key={i}
                className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{ backgroundColor: 'var(--bg-4)' }}
              >
                <Icon size={20} style={{ color: 'var(--orange)' }} />
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <div className="flex -space-x-2">
              {['AC', 'MI', 'VP', 'ER'].map((init) => (
                <div
                  key={init}
                  className="w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold shrink-0"
                  style={{ backgroundColor: 'var(--bg-3)', borderColor: 'var(--bg-2)', color: 'var(--text)' }}
                >
                  {init}
                </div>
              ))}
            </div>
            <span className="text-sm" style={{ color: 'var(--text-2)' }}>
              {userCount ? `${userCount} utilizatori activi` : '1.200+ elevi activi'}
            </span>
          </div>
        </div>
      </div>

      {/* Formular dreapta */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
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
            <StepItem num={2} label="Profil elev" active={step === 2} done={false} />
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
                  <Field label="Prenume" value={firstName} onChange={setFirstName} placeholder="Ion" required />
                  <Field label="Nume" value={lastName} onChange={setLastName} placeholder="Popescu" required />
                </div>

                <Field
                  label="Email"
                  type="email"
                  value={email}
                  onChange={setEmail}
                  placeholder="ion@gmail.com"
                  required
                />

                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>
                    Parolă<span className="ml-0.5" style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPass ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Minim 8 caractere"
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
                    checked={acceptTerms}
                    onChange={(e) => setAcceptTerms(e.target.checked)}
                    className="accent-orange-400 mt-0.5 shrink-0"
                    required
                  />
                  <span>
                    Accept{' '}
                    <Link to="/termeni" className="underline" style={{ color: 'var(--orange)' }} target="_blank">
                      Termenii și Condițiile
                    </Link>
                  </span>
                </label>

                <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text-2)' }}>
                  <input
                    type="checkbox"
                    checked={isUnder16}
                    onChange={(e) => setIsUnder16(e.target.checked)}
                    className="accent-orange-400 shrink-0"
                  />
                  Am sub 16 ani (necesită confirmarea părintelui)
                </label>

                {isUnder16 && (
                  <Field
                    label="Email părinte / tutore legal"
                    type="email"
                    value={parentEmail}
                    onChange={setParentEmail}
                    placeholder="parinte@email.ro"
                  />
                )}

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
                  Profil elev
                </h2>

                <Field
                  label="Școala / Liceul"
                  value={school}
                  onChange={setSchool}
                  placeholder="Colegiul Național..."
                />

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>
                      Clasa
                    </label>
                    <select
                      value={classVal}
                      onChange={(e) => setClassVal(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                      style={{ backgroundColor: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)' }}
                    >
                      <option value="">Selectează</option>
                      {['9', '10', '11', '12', 'Absolvent'].map((c) => (
                        <option key={c} value={c}>Clasa {c}</option>
                      ))}
                    </select>
                  </div>
                  <Field label="Orașul" value={city} onChange={setCity} placeholder="Cluj-Napoca" />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>
                    Bio scurt <span style={{ color: 'var(--text-2)' }}>(opțional)</span>
                  </label>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    rows={3}
                    placeholder="Câteva cuvinte despre tine..."
                    className="w-full px-4 py-2.5 rounded-xl text-sm outline-none resize-none"
                    style={{ backgroundColor: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)' }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--orange)')}
                    onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text)' }}>
                    Domenii de interes
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {INTERESTS.map((i) => {
                      const Icon = ICON_MAP[i];
                      const active = interests.includes(i);
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => toggleInterest(i)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
                          style={{
                            backgroundColor: active ? 'var(--orange)' : 'var(--bg-4)',
                            color: active ? '#fff' : 'var(--text-2)',
                            border: '1px solid ' + (active ? 'var(--orange)' : 'var(--border)'),
                          }}
                        >
                          {Icon && <Icon size={13} />}
                          {i}
                        </button>
                      );
                    })}
                  </div>
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
                    disabled={loading}
                    className="flex-1 py-2.5 rounded-xl font-semibold text-sm transition-opacity disabled:opacity-70 flex items-center justify-center gap-2"
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
