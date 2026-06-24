import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Trophy, Users, Calendar, Crown, ArrowLeft, Loader2, CheckCircle } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

interface MyIdea {
  id: string;
  title: string;
  wordCount: number;
  images: { id: string }[];
  pdfs: { id: string }[];
}

interface GiveawayDetail {
  id: string;
  title: string;
  description: string;
  investmentDescription: string;
  startDate: string;
  endDate: string;
  maxParticipants: number | null;
  status: 'ACTIVE' | 'FINISHED' | 'CANCELLED';
  antreprenor: {
    id: string;
    profileAntreprenor: {
      firstName: string; lastName: string; company: string | null; avatarUrl: string | null;
    } | null;
  };
  winner: {
    id: string;
    profileElev: { firstName: string; lastName: string; avatarUrl: string | null } | null;
  } | null;
  _count: { participants: number };
  myParticipation: { id: string; joinedAt: string; idea: { id: string; title: string } | null } | null;
}

type ApiError = { response?: { data?: { error?: string } } };

function formatDate(dt: string) {
  return new Date(dt).toLocaleDateString('ro-RO', { day: '2-digit', month: 'long', year: 'numeric' });
}

function initials(name: string) {
  return name.split(' ').map((w) => w[0] ?? '').join('').toUpperCase().slice(0, 2);
}

export default function GiveawayDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [giveaway, setGiveaway] = useState<GiveawayDetail | null>(null);
  const [myIdeas, setMyIdeas] = useState<MyIdea[]>([]);
  const [selectedIdeaId, setSelectedIdeaId] = useState('');
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [selectingWinner, setSelectingWinner] = useState(false);
  const [error, setError] = useState('');

  const isElev = user?.role === 'ELEV';
  const isOwner = user?.id === giveaway?.antreprenor.id;

  useEffect(() => {
    if (!id) return;
    Promise.all([
      api.get<GiveawayDetail>(`/giveaways/${id}`),
      isElev ? api.get<{ ideas: MyIdea[] }>('/ideas/me') : Promise.resolve(null),
    ]).then(([gRes, iRes]) => {
      setGiveaway(gRes.data);
      if (iRes) setMyIdeas(iRes.data.ideas);
    }).finally(() => setLoading(false));
  }, [id, isElev]);

  const eligibleIdeas = myIdeas.filter(
    (idea) => idea.wordCount >= 100 && (idea.images.length > 0 || idea.pdfs.length > 0),
  );

  const handleJoin = async () => {
    if (!selectedIdeaId || !id) return;
    setJoining(true);
    setError('');
    try {
      await api.post(`/giveaways/${id}/join`, { ideaId: selectedIdeaId });
      const { data } = await api.get<GiveawayDetail>(`/giveaways/${id}`);
      setGiveaway(data);
    } catch (err) {
      setError((err as ApiError).response?.data?.error ?? 'Eroare la participare.');
    } finally {
      setJoining(false);
    }
  };

  const handleLeave = async () => {
    if (!id || !window.confirm('Ești sigur că vrei să te retragi din acest giveaway?')) return;
    setLeaving(true);
    try {
      await api.delete(`/giveaways/${id}/join`);
      const { data } = await api.get<GiveawayDetail>(`/giveaways/${id}`);
      setGiveaway(data);
    } catch {
      alert('Eroare la retragere.');
    } finally {
      setLeaving(false);
    }
  };

  const handleSelectWinner = async () => {
    if (!id || !window.confirm('Alege câștigătorul? Această acțiune este ireversibilă.')) return;
    setSelectingWinner(true);
    try {
      const { data } = await api.post<GiveawayDetail>(`/giveaways/${id}/winner`);
      setGiveaway((prev) => prev ? { ...prev, ...data } : prev);
    } catch (err) {
      alert((err as ApiError).response?.data?.error ?? 'Eroare la selectarea câștigătorului.');
    } finally {
      setSelectingWinner(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="skeleton h-8 w-2/3 rounded-xl" />
        <div className="skeleton h-48 rounded-2xl" />
        <div className="skeleton h-32 rounded-2xl" />
      </div>
    );
  }

  if (!giveaway) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <p className="text-base font-medium mb-4" style={{ color: '#ef4444' }}>Giveaway-ul nu a fost găsit.</p>
        <Link to="/giveaways" className="text-sm font-medium" style={{ color: 'var(--orange)' }}>← Înapoi la giveaway-uri</Link>
      </div>
    );
  }

  const now = new Date();
  const isActive = giveaway.status === 'ACTIVE' && now >= new Date(giveaway.startDate) && now <= new Date(giveaway.endDate);
  const isFinished = giveaway.status === 'FINISHED';
  const hasEnded = now > new Date(giveaway.endDate);
  const daysLeft = Math.max(0, Math.ceil((new Date(giveaway.endDate).getTime() - now.getTime()) / 86400000));
  const p = giveaway.antreprenor.profileAntreprenor;
  const antreprenorName = p ? `${p.firstName} ${p.lastName}` : 'Antreprenor';

  return (
    <div className="max-w-2xl mx-auto">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm mb-5 hover:underline" style={{ color: 'var(--text-2)' }}>
        <ArrowLeft size={14} /> Înapoi
      </button>

      {/* Card principal */}
      <div className="rounded-2xl p-6 mb-4" style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}>
        {/* Status + timer */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
            style={{
              backgroundColor: isActive ? 'rgba(34,197,94,0.12)' : 'var(--bg-3)',
              color: isActive ? '#22c55e' : 'var(--text-2)',
            }}>
            {isActive ? 'Activ' : isFinished ? 'Finalizat' : 'Anulat'}
          </span>
          {isActive && (
            <span className="text-sm font-semibold" style={{ color: 'var(--orange)' }}>
              {daysLeft} {daysLeft === 1 ? 'zi rămasă' : 'zile rămase'}
            </span>
          )}
        </div>

        <h1 className="text-xl font-bold mb-3" style={{ color: 'var(--text)' }}>{giveaway.title}</h1>
        <p className="text-sm leading-relaxed mb-5" style={{ color: 'var(--text-2)' }}>{giveaway.description}</p>

        {/* Premiu */}
        <div className="rounded-xl p-4 mb-5"
          style={{ backgroundColor: 'rgba(246,166,35,0.08)', border: '1px solid rgba(246,166,35,0.2)' }}>
          <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--orange)' }}>
            Ce câștigă câștigătorul
          </p>
          <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{giveaway.investmentDescription}</p>
        </div>

        {/* Antreprenor + stats */}
        <div className="flex items-center gap-3 pb-5 mb-5" style={{ borderBottom: '1px solid var(--border)' }}>
          {p?.avatarUrl
            ? <img src={p.avatarUrl} alt={antreprenorName} className="w-10 h-10 rounded-xl object-cover" loading="lazy" />
            : <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0"
                style={{ backgroundColor: 'var(--orange)', color: '#fff' }}>{initials(antreprenorName)}</div>
          }
          <div className="flex-1">
            <div className="flex items-center gap-1.5">
              <p className="font-semibold text-sm" style={{ color: 'var(--text)' }}>{antreprenorName}</p>
              <Crown size={12} style={{ color: 'var(--orange)' }} />
            </div>
            {p?.company && <p className="text-xs" style={{ color: 'var(--text-2)' }}>{p.company}</p>}
          </div>
          <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--text-2)' }}>
            <span className="flex items-center gap-1"><Users size={12} /> {giveaway._count.participants} participanți</span>
            {giveaway.maxParticipants && (
              <span>/ {giveaway.maxParticipants} max</span>
            )}
          </div>
        </div>

        {/* Date */}
        <div className="grid grid-cols-2 gap-3 mb-5 text-xs">
          <div className="rounded-xl p-3" style={{ backgroundColor: 'var(--bg-3)' }}>
            <p className="font-medium mb-0.5" style={{ color: 'var(--text-2)' }}>Start</p>
            <p className="font-semibold flex items-center gap-1" style={{ color: 'var(--text)' }}>
              <Calendar size={11} /> {formatDate(giveaway.startDate)}
            </p>
          </div>
          <div className="rounded-xl p-3" style={{ backgroundColor: 'var(--bg-3)' }}>
            <p className="font-medium mb-0.5" style={{ color: 'var(--text-2)' }}>Final</p>
            <p className="font-semibold flex items-center gap-1" style={{ color: 'var(--text)' }}>
              <Calendar size={11} /> {formatDate(giveaway.endDate)}
            </p>
          </div>
        </div>

        {/* Câștigător (dacă există) */}
        {isFinished && giveaway.winner && (() => {
          const w = giveaway.winner!.profileElev;
          const winnerName = w ? `${w.firstName} ${w.lastName}` : 'Câștigător';
          return (
            <div className="rounded-xl p-4 flex items-center gap-3"
              style={{ backgroundColor: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)' }}>
              <Trophy size={24} style={{ color: '#a855f7' }} />
              <div>
                <p className="text-xs font-semibold" style={{ color: '#a855f7' }}>Câștigătorul giveaway-ului</p>
                <div className="flex items-center gap-2 mt-1">
                  {w?.avatarUrl
                    ? <img src={w.avatarUrl} alt={winnerName} className="w-7 h-7 rounded-full object-cover" loading="lazy" />
                    : <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                        style={{ backgroundColor: '#a855f7', color: '#fff' }}>{initials(winnerName)}</div>
                  }
                  <p className="font-semibold text-sm" style={{ color: 'var(--text)' }}>{winnerName}</p>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Acțiuni elev */}
        {isElev && isActive && (
          <div className="mt-5">
            {giveaway.myParticipation ? (
              <div>
                <div className="flex items-center gap-2 p-4 rounded-xl mb-3"
                  style={{ backgroundColor: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
                  <CheckCircle size={18} style={{ color: '#22c55e' }} />
                  <div>
                    <p className="text-sm font-semibold" style={{ color: '#22c55e' }}>Participi la acest giveaway!</p>
                    {giveaway.myParticipation.idea && (
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-2)' }}>
                        Idee: {giveaway.myParticipation.idea.title}
                      </p>
                    )}
                  </div>
                </div>
                <button onClick={() => void handleLeave()} disabled={leaving}
                  className="w-full py-2.5 rounded-xl text-sm font-medium disabled:opacity-50"
                  style={{ backgroundColor: 'var(--bg-3)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
                  {leaving ? <Loader2 size={14} className="animate-spin inline mr-2" /> : null}
                  Retrage participarea
                </button>
              </div>
            ) : eligibleIdeas.length === 0 ? (
              <div className="p-4 rounded-xl text-sm" style={{ backgroundColor: 'var(--bg-3)', color: 'var(--text-2)' }}>
                Nu ai idei eligibile. O idee trebuie să aibă cel puțin 100 de cuvinte și o imagine sau PDF.
                <Link to="/idea/new" className="block mt-2 font-semibold" style={{ color: 'var(--orange)' }}>
                  Postează o idee
                </Link>
              </div>
            ) : (
              <div>
                <p className="text-sm font-medium mb-2" style={{ color: 'var(--text)' }}>Alege ideea cu care participi:</p>
                <select
                  value={selectedIdeaId} onChange={(e) => setSelectedIdeaId(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl text-sm outline-none mb-3"
                  style={{ backgroundColor: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                  <option value="">Selectează o idee</option>
                  {eligibleIdeas.map((idea) => (
                    <option key={idea.id} value={idea.id}>{idea.title}</option>
                  ))}
                </select>
                {error && <p className="text-xs mb-2" style={{ color: '#ef4444' }}>{error}</p>}
                <button onClick={() => void handleJoin()} disabled={!selectedIdeaId || joining}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
                  style={{ backgroundColor: 'var(--orange)', color: '#fff' }}>
                  {joining ? <Loader2 size={15} className="animate-spin" /> : <Trophy size={15} />}
                  Participă la giveaway
                </button>
              </div>
            )}
          </div>
        )}

        {/* Acțiuni antreprenor owner */}
        {isOwner && (
          <div className="mt-5 space-y-2">
            {hasEnded && giveaway.status === 'ACTIVE' && (
              <button onClick={() => void handleSelectWinner()} disabled={selectingWinner}
                className="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
                style={{ backgroundColor: '#a855f7', color: '#fff' }}>
                {selectingWinner ? <Loader2 size={15} className="animate-spin" /> : <Trophy size={15} />}
                Alege câștigătorul
              </button>
            )}
            {isFinished && (
              <button onClick={() => void api.post(`/giveaways/${giveaway.id}/confirm`).then(() => alert('Investiție confirmată!'))}
                className="w-full py-2.5 rounded-xl text-sm font-medium"
                style={{ backgroundColor: 'var(--bg-3)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
                Confirmă investiția
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
