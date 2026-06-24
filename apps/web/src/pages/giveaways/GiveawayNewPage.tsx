import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { api } from '../../lib/api';

type ApiError = { response?: { data?: { error?: string } } };

export default function GiveawayNewPage() {
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [investmentDescription, setInvestmentDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [maxParticipants, setMaxParticipants] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const today = new Date().toISOString().slice(0, 10);
  const isValid = title.trim().length >= 5 && description.trim().length >= 20
    && investmentDescription.trim().length >= 10 && startDate && endDate && endDate > startDate;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post<{ id: string }>('/giveaways', {
        title, description, investmentDescription,
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
        maxParticipants: maxParticipants ? parseInt(maxParticipants, 10) : undefined,
      });
      navigate(`/giveaways/${data.id}`);
    } catch (err) {
      setError((err as ApiError).response?.data?.error ?? 'Eroare la creare. Încearcă din nou.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Lansează giveaway</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-2)' }}>
          Elevii vor putea participa cu ideile lor. Tu alegi câștigătorul după încheierea perioadei.
        </p>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
        <Field label="Titlu *">
          <input
            type="text" value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex: Investesc 5000 EUR în cea mai bună idee tech" maxLength={200} required
            className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
            style={{ backgroundColor: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)' }}
          />
        </Field>

        <Field label="Descriere *" hint={`${description.length}/5000`}>
          <textarea
            value={description} onChange={(e) => setDescription(e.target.value)}
            rows={5} required placeholder="Descrie ce cauți, ce criterii vei folosi la selecție, ce experiență poți oferi..."
            className="w-full px-4 py-2.5 rounded-xl text-sm outline-none resize-y"
            style={{ backgroundColor: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)' }}
          />
        </Field>

        <Field label="Ce oferă câștigătorul *" hint="Descrie investiția/mentoratul/premiul concret">
          <textarea
            value={investmentDescription} onChange={(e) => setInvestmentDescription(e.target.value)}
            rows={3} required placeholder="Ex: 5000 EUR investiție inițială + mentorat 6 luni + acces la rețeaua mea de contacte"
            className="w-full px-4 py-2.5 rounded-xl text-sm outline-none resize-y"
            style={{ backgroundColor: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)' }}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Data start *">
            <input
              type="date" value={startDate} min={today} onChange={(e) => setStartDate(e.target.value)} required
              className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
              style={{ backgroundColor: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
          </Field>
          <Field label="Data final *">
            <input
              type="date" value={endDate} min={startDate || today} onChange={(e) => setEndDate(e.target.value)} required
              className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
              style={{ backgroundColor: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
          </Field>
        </div>

        <Field label="Număr maxim participanți" hint="Opțional — lasă gol pentru nelimitat">
          <input
            type="number" value={maxParticipants} onChange={(e) => setMaxParticipants(e.target.value)}
            min={2} max={10000} placeholder="Ex: 100"
            className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
            style={{ backgroundColor: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)' }}
          />
        </Field>

        {error && (
          <div className="px-4 py-3 rounded-xl text-sm" style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
            {error}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={() => navigate(-1)}
            className="px-6 py-2.5 rounded-xl text-sm font-medium"
            style={{ backgroundColor: 'var(--bg-3)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
            Anulează
          </button>
          <button type="submit" disabled={!isValid || loading}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
            style={{ backgroundColor: 'var(--orange)', color: '#fff' }}>
            {loading && <Loader2 size={16} className="animate-spin" />}
            {loading ? 'Se creează...' : 'Lansează giveaway'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>{label}</label>
        {hint && <span className="text-xs" style={{ color: 'var(--text-2)' }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}
