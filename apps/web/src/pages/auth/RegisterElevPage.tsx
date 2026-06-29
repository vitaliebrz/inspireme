import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2, Check, X } from 'lucide-react';
import { api } from '../../lib/api';
import Logo from '../../components/Logo';

const INTERESTS = ['Tech', 'Eco', 'Artă', 'Educație', 'Social', 'Sănătate', 'Food', 'Finanțe'];

type Step = 1 | 2;

export default function RegisterElevPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Pasul 1
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName]   = useState('');
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showPass, setShowPass]   = useState(false);
  const [isUnder16, setIsUnder16] = useState(false);
  const [parentEmail, setParentEmail] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);

  // Pasul 2
  const [school, setSchool]         = useState('');
  const [classVal, setClassVal]     = useState('');
  const [city, setCity]             = useState('');
  const [bio, setBio]               = useState('');
  const [interests, setInterests]   = useState<string[]>([]);

  const passRules = {
    length: password.length >= 8,
    upper:  /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
  };
  const passValid = Object.values(passRules).every(Boolean);
  const step1Valid = firstName && lastName && email && passValid && password === confirmPass && acceptTerms && (!isUnder16 || parentEmail);

  const toggleInterest = (i: string) =>
    setInterests((prev) => prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]);

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
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: 'var(--bg)' }}>
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-block mb-4"><Logo height={40} /></Link>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Creează cont de elev</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-2)' }}>Pasul {step} din 2</p>
        </div>

        {/* Progress */}
        <div className="flex gap-2 mb-8">
          {[1, 2].map((s) => (
            <div
              key={s}
              className="flex-1 h-1 rounded-full transition-colors"
              style={{ backgroundColor: s <= step ? 'var(--orange)' : 'var(--bg-4)' }}
            />
          ))}
        </div>

        <form onSubmit={step === 1 ? (e) => { e.preventDefault(); if (step1Valid) setStep(2); } : handleSubmit}
              className="space-y-4">

          {step === 1 && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Prenume" value={firstName} onChange={setFirstName} placeholder="Ion" />
                <Field label="Nume" value={lastName} onChange={setLastName} placeholder="Popescu" />
              </div>
              <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="ion@gmail.com" />

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>Parolă</label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minim 8 caractere"
                    className="w-full pl-4 pr-10 py-2.5 rounded-xl text-sm outline-none"
                    style={{ backgroundColor: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  />
                  <button type="button" onClick={() => setShowPass((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-2)' }}>
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {password && (
                  <ul className="mt-2 space-y-1">
                    {[
                      [passRules.length, 'Minim 8 caractere'],
                      [passRules.upper,  'Cel puțin o literă mare'],
                      [passRules.number, 'Cel puțin un număr'],
                    ].map(([ok, text]) => (
                      <li key={String(text)} className="flex items-center gap-1.5 text-xs">
                        {ok ? <Check size={12} color="#22c55e" /> : <X size={12} color="#ef4444" />}
                        <span style={{ color: ok ? '#22c55e' : '#ef4444' }}>{String(text)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <Field label="Confirmă parola" type="password" value={confirmPass} onChange={setConfirmPass}
                placeholder="Repetă parola"
                error={confirmPass && confirmPass !== password ? 'Parolele nu coincid' : ''} />

              <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text-2)' }}>
                <input type="checkbox" checked={isUnder16} onChange={(e) => setIsUnder16(e.target.checked)}
                  className="accent-orange-400" />
                Am sub 16 ani (necesită confirmarea părintelui)
              </label>

              {isUnder16 && (
                <Field label="Email părinte/tutore" type="email" value={parentEmail} onChange={setParentEmail}
                  placeholder="parinte@email.ro" />
              )}

              <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text-2)' }}>
                <input type="checkbox" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)}
                  className="accent-orange-400" required />
                Accept{' '}
                <Link to="/termeni" className="underline" style={{ color: 'var(--orange)' }} target="_blank">
                  Termenii și condițiile
                </Link>
              </label>

              <button
                type="submit"
                disabled={!step1Valid}
                className="w-full py-2.5 rounded-xl font-semibold text-sm transition-opacity disabled:opacity-40"
                style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
              >
                Continuă
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <Field label="Școala/Liceul" value={school} onChange={setSchool} placeholder="Colegiul Național..." />

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>Clasa</label>
                <select
                  value={classVal} onChange={(e) => setClassVal(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                  style={{ backgroundColor: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)' }}
                >
                  <option value="">Selectează clasa</option>
                  {['9', '10', '11', '12', 'Absolvent'].map((c) => (
                    <option key={c} value={c}>Clasa {c}</option>
                  ))}
                </select>
              </div>

              <Field label="Orașul" value={city} onChange={setCity} placeholder="Cluj-Napoca" />

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>
                  Bio scurt <span style={{ color: 'var(--text-2)' }}>(opțional)</span>
                </label>
                <textarea
                  value={bio} onChange={(e) => setBio(e.target.value)} rows={3}
                  placeholder="Câteva cuvinte despre tine..."
                  className="w-full px-4 py-2.5 rounded-xl text-sm outline-none resize-none"
                  style={{ backgroundColor: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)' }}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text)' }}>
                  Domenii de interes
                </label>
                <div className="flex flex-wrap gap-2">
                  {INTERESTS.map((i) => (
                    <button
                      key={i} type="button" onClick={() => toggleInterest(i)}
                      className="px-3 py-1 rounded-full text-sm font-medium transition-all"
                      style={{
                        backgroundColor: interests.includes(i) ? 'var(--orange)' : 'var(--bg-4)',
                        color: interests.includes(i) ? '#fff' : 'var(--text-2)',
                        border: '1px solid ' + (interests.includes(i) ? 'var(--orange)' : 'var(--border)'),
                      }}
                    >
                      {i}
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <p className="text-sm px-4 py-2.5 rounded-xl" style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                  {error}
                </p>
              )}

              <div className="flex gap-3">
                <button type="button" onClick={() => setStep(1)}
                  className="flex-1 py-2.5 rounded-xl font-semibold text-sm border transition-colors"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}>
                  Înapoi
                </button>
                <button type="submit" disabled={loading}
                  className="flex-1 py-2.5 rounded-xl font-semibold text-sm transition-opacity disabled:opacity-70 flex items-center justify-center gap-2"
                  style={{ backgroundColor: 'var(--orange)', color: '#fff' }}>
                  {loading && <Loader2 size={16} className="animate-spin" />}
                  {loading ? 'Se creează...' : 'Creează cont'}
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
  );
}

function Field({
  label, value, onChange, placeholder, type = 'text', error = '',
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; error?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>{label}</label>
      <input
        type={type} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all"
        style={{
          backgroundColor: 'var(--bg-3)',
          border: `1px solid ${error ? '#ef4444' : 'var(--border)'}`,
          color: 'var(--text)',
        }}
        onFocus={(e) => (e.currentTarget.style.borderColor = error ? '#ef4444' : 'var(--orange)')}
        onBlur={(e) => (e.currentTarget.style.borderColor = error ? '#ef4444' : 'var(--border)')}
      />
      {error && <p className="text-xs mt-1" style={{ color: '#ef4444' }}>{error}</p>}
    </div>
  );
}
