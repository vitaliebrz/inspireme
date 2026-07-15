import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Check, Trophy, Users, Eye } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

type ApiError = { response?: { data?: { error?: string } } };

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function getTimeLeft(endDate: string, now: Date) {
  const ms = Math.max(0, new Date(endDate).getTime() - now.getTime());
  return {
    days: Math.floor(ms / 86400000),
    hours: Math.floor((ms % 86400000) / 3600000),
    mins: Math.floor((ms % 3600000) / 60000),
    secs: Math.floor((ms % 60000) / 1000),
  };
}

function CharHint({ current, min, max }: { current: number; min: number; max?: number }) {
  const met = current >= min;
  return (
    <span className="text-xs" style={{ color: met ? '#22c55e' : current > 0 ? '#f59e0b' : 'var(--text-2)' }}>
      {met
        ? <span className="inline-flex items-center gap-0.5"><Check size={10} /> {current}{max ? `/${max}` : ''}</span>
        : `${current}/${min} min`}
    </span>
  );
}

function Req({ done, children }: { done: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2" style={{ color: done ? '#22c55e' : 'var(--text-2)' }}>
      <Check size={11} style={{ opacity: done ? 1 : 0.3, flexShrink: 0 }} />
      <span style={{ textDecoration: done ? 'line-through' : 'none', opacity: done ? 0.6 : 1 }}>
        {children}
      </span>
    </div>
  );
}

function Field({
  label, required, hint, children,
}: {
  label: string; required?: boolean; hint?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>
          {label}{required && <span style={{ color: '#ef4444' }}> *</span>}
        </label>
        {hint}
      </div>
      {children}
    </div>
  );
}

// ─── Preview card ────────────────────────────────────────────────────────────

interface PreviewProps {
  title: string;
  description: string;
  investmentDescription: string;
  startDate: string;
  endDate: string;
  maxParticipants: string;
  company: string;
}

function GiveawayPreviewCard({
  title, description, investmentDescription, startDate, endDate, maxParticipants, company,
}: PreviewProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const nowMs = now.getTime();
  const hasStart = !!startDate;
  const hasEnd = !!endDate;
  const isStarted = hasStart && nowMs >= new Date(startDate).getTime();
  const isLive = isStarted && hasEnd && nowMs <= new Date(endDate).getTime();
  const hasExpired = hasEnd && nowMs > new Date(endDate).getTime();

  const tl = hasEnd ? getTimeLeft(endDate, now) : null;
  const maxP = maxParticipants ? parseInt(maxParticipants, 10) : null;

  const titleDisplay = title.trim() || 'Titlul giveaway-ului';
  const investDisplay = investmentDescription.trim() || 'Ce primește câștigătorul';
  const descDisplay = description.trim() || 'Descrierea giveaway-ului va apărea aici...';
  const companyDisplay = company || 'Compania ta';

  const badgeLabel = hasExpired ? 'EXPIRAT' : isLive ? 'LIVE' : 'PREVIEW';

  return (
    <div className="rounded-2xl p-5 relative"
      style={{
        backgroundColor: 'var(--bg-2)',
        border: '1px solid var(--border)',
      }}>

      {/* Status + company */}
      <div className="flex items-center justify-between mb-3">
        {isLive ? (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full"
            style={{ backgroundColor: 'rgba(34,197,94,0.15)' }}>
            <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: '#00c950' }} />
            <span className="text-[11px] font-bold" style={{ color: '#22c55e' }}>LIVE</span>
          </div>
        ) : hasExpired ? (
          <div className="px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--bg-4)' }}>
            <span className="text-[11px] font-bold" style={{ color: '#f97316' }}>EXPIRAT</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full"
            style={{ backgroundColor: 'rgba(148,163,184,0.12)' }}>
            <Eye size={10} style={{ color: 'var(--text-2)' }} />
            <span className="text-[11px] font-bold" style={{ color: 'var(--text-2)' }}>PREVIEW</span>
          </div>
        )}
        <span className="text-xs truncate ml-2" style={{ color: 'var(--text-2)' }}>{companyDisplay}</span>
      </div>

      {/* Title */}
      <h2 className="font-bold italic text-lg mb-2 line-clamp-1"
        style={{ color: title.trim() ? 'var(--text)' : 'var(--text-2)', opacity: title.trim() ? 1 : 0.4 }}>
        {titleDisplay}
      </h2>

      {/* Prize */}
      <div className="flex items-center gap-2 mb-2">
        <Trophy size={14} style={{ color: 'var(--orange)', flexShrink: 0 }} />
        <span className="text-sm font-semibold truncate"
          style={{ color: investmentDescription.trim() ? 'var(--orange)' : 'var(--text-2)', opacity: investmentDescription.trim() ? 1 : 0.4 }}>
          {investDisplay}
        </span>
      </div>

      {/* Description */}
      <p className="text-xs mb-4 line-clamp-2"
        style={{ color: 'var(--text-2)', opacity: description.trim() ? 1 : 0.4 }}>
        {descDisplay}
      </p>

      {/* Countdown */}
      <div className="grid grid-cols-4 gap-1.5 mb-4">
        {([
          { v: tl ? pad(tl.days) : '--', l: 'Zile' },
          { v: tl ? pad(tl.hours) : '--', l: 'Ore' },
          { v: tl ? pad(tl.mins) : '--', l: 'Min' },
          { v: tl ? pad(tl.secs) : '--', l: 'Sec' },
        ]).map(({ v, l }) => (
          <div key={l} className="py-2 rounded-[14px] flex flex-col items-center"
            style={{ backgroundColor: 'var(--bg-4)' }}>
            <span className="text-xl font-extrabold leading-7 font-mono" style={{ color: 'var(--text)' }}>{v}</span>
            <span className="text-[10px] mt-0.5" style={{ color: 'var(--text-2)' }}>{l}</span>
          </div>
        ))}
      </div>

      {/* Participanți + progress */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-2)' }}>
            <Users size={11} /> 0 participanți
          </div>
          {maxP && (
            <span className="text-xs" style={{ color: 'var(--text-2)' }}>{maxP} max</span>
          )}
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-4)' }}>
          <div className="h-full rounded-full w-0"
            style={{ background: 'linear-gradient(to right, var(--orange), #22c55e)' }} />
        </div>
      </div>

      {/* CTA */}
      <div className="w-full py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
        style={{ backgroundColor: 'var(--orange)', color: '#fff' }}>
        <Trophy size={15} /> Participă la giveaway
      </div>

      {/* Overlay hint când nu e completat */}
      {(!title.trim() && !description.trim() && !investmentDescription.trim()) && (
        <div className="absolute inset-0 rounded-2xl flex items-center justify-center pointer-events-none"
          style={{ backgroundColor: 'rgba(0,0,0,0.03)' }}>
        </div>
      )}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function GiveawayNewPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [investmentDescription, setInvestmentDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [maxParticipants, setMaxParticipants] = useState('');
  const [loading, setLoading] = useState(false);

  const [company, setCompany] = useState('');

  const today = new Date().toISOString().slice(0, 10);

  // Fetch company name pentru preview
  useEffect(() => {
    api.get<{ profileAntreprenor?: { company?: string; firstName?: string; lastName?: string } }>('/profiles/me')
      .then(({ data }) => {
        const p = data.profileAntreprenor;
        if (!p) return;
        setCompany(p.company ?? (p.firstName ? `${p.firstName} ${p.lastName ?? ''}`.trim() : ''));
      })
      .catch(() => {});
  }, []);

  const maxParsed = maxParticipants.trim() ? parseInt(maxParticipants.trim(), 10) : null;
  const maxParticipantsValid = maxParsed === null || (!isNaN(maxParsed) && maxParsed >= 2 && maxParsed <= 10000);

  const checks = {
    title: title.trim().length >= 5,
    description: description.trim().length >= 20,
    investment: investmentDescription.trim().length >= 3,
    startDate: !!startDate,
    endDate: !!endDate && endDate >= startDate,
    maxParticipants: maxParticipantsValid,
  };
  const isValid = Object.values(checks).every(Boolean);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post<{ id: string }>('/giveaways', {
        title, description, investmentDescription,
        startDate,
        endDate,
        maxParticipants: maxParsed !== null && !isNaN(maxParsed) ? maxParsed : undefined,
      });
      navigate(`/giveaways/${data.id}`);
    } catch (err) {
      const errData = (err as ApiError).response?.data;
      toast(errData?.error ?? 'Eroare la creare. Încearcă din nou.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto">

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Lansează giveaway</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-2)' }}>
          Elevii vor putea participa cu ideile lor. Tu alegi câștigătorul după încheierea perioadei.
        </p>
      </div>

      {/* Layout: 1 coloană pe mobile, 2 coloane pe desktop */}
      <div className="flex flex-col lg:grid lg:gap-8" style={{ gridTemplateColumns: '1fr 360px' }}>

        {/* Coloana stângă — formular */}
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5 min-w-0">

          <Field
            label="Titlu"
            required
            hint={<CharHint current={title.trim().length} min={5} max={200} />}
          >
            <input
              type="text" value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Investesc 5000 EUR în cea mai bună idee tech" maxLength={200}
              className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
              style={{ backgroundColor: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)' }}
              onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--orange)')}
              onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
            />
          </Field>

          <Field
            label="Descriere"
            required
            hint={<CharHint current={description.trim().length} min={20} max={5000} />}
          >
            <textarea
              value={description} onChange={(e) => setDescription(e.target.value)}
              rows={5} placeholder="Descrie ce cauți, ce criterii vei folosi la selecție, ce experiență poți oferi..."
              maxLength={5000}
              className="w-full px-4 py-2.5 rounded-xl text-sm outline-none resize-y"
              style={{ backgroundColor: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)' }}
              onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--orange)')}
              onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
            />
          </Field>

          <Field
            label="Ce primește câștigătorul"
            required
            hint={<CharHint current={investmentDescription.trim().length} min={3} max={1000} />}
          >
            <textarea
              value={investmentDescription} onChange={(e) => setInvestmentDescription(e.target.value)}
              rows={3} placeholder="Ex: 5000 EUR investiție inițială + mentorat 6 luni + acces la rețeaua mea de contacte"
              maxLength={1000}
              className="w-full px-4 py-2.5 rounded-xl text-sm outline-none resize-y"
              style={{ backgroundColor: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)' }}
              onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--orange)')}
              onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Data start" required>
              <input
                type="date" value={startDate} min={today} onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                style={{ backgroundColor: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)' }}
              />
            </Field>
            <Field
              label="Data final"
              required
              hint={endDate && startDate && endDate < startDate
                ? <span className="text-xs" style={{ color: '#ef4444' }}>Trebuie după start</span>
                : undefined}
            >
              <input
                type="date" value={endDate} min={startDate || today} onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                style={{ backgroundColor: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)' }}
              />
            </Field>
          </div>

          <Field
            label="Număr maxim participanți"
            hint={
              maxParticipants.trim() && !maxParticipantsValid
                ? <span className="text-xs" style={{ color: '#ef4444' }}>Minim 2, maxim 10.000</span>
                : <span className="text-xs" style={{ color: 'var(--text-2)' }}>Opțional — lasă gol pentru nelimitat</span>
            }
          >
            <input
              type="number" value={maxParticipants} onChange={(e) => setMaxParticipants(e.target.value)}
              min={2} max={10000} placeholder="Ex: 100"
              className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
              style={{
                backgroundColor: 'var(--bg-3)',
                border: `1px solid ${maxParticipants.trim() && !maxParticipantsValid ? '#ef4444' : 'var(--border)'}`,
                color: 'var(--text)',
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--orange)')}
              onBlur={(e) => (e.currentTarget.style.borderColor = maxParticipants.trim() && !maxParticipantsValid ? '#ef4444' : 'var(--border)')}
            />
          </Field>


          {!isValid && (
            <div className="rounded-xl px-4 py-3 space-y-1.5 text-xs" style={{ backgroundColor: 'var(--bg-3)' }}>
              <p className="font-semibold mb-2" style={{ color: 'var(--text-2)' }}>Cerințe pentru publicare:</p>
              <Req done={checks.title}>Titlu — minim 5 caractere</Req>
              <Req done={checks.description}>Descriere — minim 20 caractere</Req>
              <Req done={checks.investment}>Ce primește câștigătorul — minim 3 caractere</Req>
              <Req done={checks.startDate}>Dată start selectată</Req>
              <Req done={checks.endDate}>Dată final selectată (≥ data start)</Req>
              {!checks.maxParticipants && <Req done={false}>Nr. maxim participanți — între 2 și 10.000</Req>}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => navigate(-1)}
              className="px-6 py-2.5 rounded-xl text-sm font-medium cursor-pointer"
              style={{ backgroundColor: 'var(--bg-3)', color: 'var(--text-2)', border: '1px solid var(--border)' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-4)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-3)')}>
              Anulează
            </button>
            <button type="submit" disabled={!isValid || loading}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              style={{ backgroundColor: 'var(--orange)', color: '#fff' }}>
              {loading && <Loader2 size={16} className="animate-spin" />}
              {loading ? 'Se creează...' : 'Lansează giveaway'}
            </button>
          </div>
        </form>

        {/* Coloana dreaptă — preview (sticky pe desktop, dedesubt pe mobile) */}
        <div className="mt-8 lg:mt-0">
          <div className="lg:sticky lg:top-6">
            <div className="flex items-center gap-2 mb-3">
              <Eye size={14} style={{ color: 'var(--text-2)' }} />
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-2)' }}>
                Previzualizare card
              </span>
            </div>
            <GiveawayPreviewCard
              title={title}
              description={description}
              investmentDescription={investmentDescription}
              startDate={startDate}
              endDate={endDate}
              maxParticipants={maxParticipants}
              company={company}
            />
            <p className="text-xs mt-3 text-center" style={{ color: 'var(--text-2)', opacity: 0.6 }}>
              Cardul se actualizează în timp real pe măsură ce completezi formularul.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
