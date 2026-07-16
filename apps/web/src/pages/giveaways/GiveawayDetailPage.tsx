import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Trophy, Users, Calendar, Crown, ArrowLeft, Loader2, CheckCircle, MessageSquare } from 'lucide-react';
import { useToast } from '../../context/ToastContext';

function pad(n: number) { return String(n).padStart(2, '0'); }

function getTimeLeft(endDate: string, now: Date) {
  const ms = Math.max(0, new Date(endDate).getTime() - now.getTime());
  return {
    days: Math.floor(ms / 86400000),
    hours: Math.floor((ms % 86400000) / 3600000),
    mins: Math.floor((ms % 3600000) / 60000),
    secs: Math.floor((ms % 60000) / 1000),
  };
}
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import ConfirmModal from '../../components/ui/ConfirmModal';

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
  winnerIdea: { id: string; title: string } | null;
  investmentConfirmedByAntreprenor: boolean;
  investmentConfirmedByElev: boolean;
  investmentConfirmedAt: string | null;
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
  const { toast } = useToast();

  const [giveaway, setGiveaway] = useState<GiveawayDetail | null>(null);
  const [myIdeas, setMyIdeas] = useState<MyIdea[]>([]);
  const [loading, setLoading] = useState(true);
  const [joiningIdeaId, setJoiningIdeaId] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [confirmingInvestment, setConfirmingInvestment] = useState(false);
  const [contactingWinner, setContactingWinner] = useState(false);
  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const isElev = user?.role === 'ELEV';
  const isOwner = user?.role === 'ADMIN' || user?.id === giveaway?.antreprenor.id;

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

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

  const handleJoin = async (ideaId: string) => {
    if (!ideaId || !id) return;
    setJoiningIdeaId(ideaId);
    try {
      await api.post(`/giveaways/${id}/join`, { ideaId });
      const { data } = await api.get<GiveawayDetail>(`/giveaways/${id}`);
      setGiveaway(data);
    } catch (err) {
      toast((err as ApiError).response?.data?.error ?? 'Eroare la participare.', 'error');
    } finally {
      setJoiningIdeaId(null);
    }
  };

  const handleLeave = async () => {
    if (!id) return;
    setLeaving(true);
    try {
      await api.delete(`/giveaways/${id}/join`);
      const { data } = await api.get<GiveawayDetail>(`/giveaways/${id}`);
      setGiveaway(data);
    } catch {
      toast('Eroare la retragere. Încearcă din nou.', 'error');
    } finally {
      setLeaving(false);
      setLeaveModalOpen(false);
    }
  };

  const handleContactWinner = async () => {
    if (!giveaway) return;
    setContactingWinner(true);
    try {
      // Backend: deschide conversația existentă (cu badge-ul ideii câștigătoare)
      // sau trimite o cerere de conectare cu ideea câștigătoare.
      const { data } = await api.post<{ conversationId: string | null; requestSent: boolean }>(
        `/giveaways/${giveaway.id}/contact-winner`,
      );
      if (data.conversationId) {
        navigate(`/chat/${data.conversationId}`);
      } else {
        toast('Cerere de conectare trimisă câștigătorului.', 'success');
      }
    } catch (err) {
      toast((err as ApiError).response?.data?.error ?? 'Nu am putut contacta câștigătorul.', 'error');
    } finally {
      setContactingWinner(false);
    }
  };

  const handleConfirmInvestment = async () => {
    if (!giveaway) return;
    setConfirmingInvestment(true);
    try {
      await api.post(`/giveaways/${giveaway.id}/confirm`);
      const { data } = await api.get<GiveawayDetail>(`/giveaways/${giveaway.id}`);
      setGiveaway(data);
    } catch (err) {
      toast((err as ApiError).response?.data?.error ?? 'Eroare la confirmarea investiției.', 'error');
    } finally {
      setConfirmingInvestment(false);
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

  const isActive = giveaway.status === 'ACTIVE' && now >= new Date(giveaway.startDate) && now <= new Date(giveaway.endDate);
  const isFinished = giveaway.status === 'FINISHED';
  const hasEnded = now > new Date(giveaway.endDate);
  const tl = isActive ? getTimeLeft(giveaway.endDate, now) : null;
  const p = giveaway.antreprenor.profileAntreprenor;
  const antreprenorName = p ? `${p.firstName} ${p.lastName}` : 'Antreprenor';

  const isWinner = user?.role === 'ELEV' && giveaway.winner?.id === user.id;
  const fullyConfirmed = !!giveaway.investmentConfirmedAt;
  const iAlreadyConfirmed = isOwner
    ? giveaway.investmentConfirmedByAntreprenor
    : isWinner
      ? giveaway.investmentConfirmedByElev
      : false;

  return (
    <div className="max-w-2xl mx-auto">
      <ConfirmModal
        open={leaveModalOpen}
        title="Retrage participarea"
        description="Ești sigur că vrei să te retragi din acest giveaway? Poți participa din nou înainte de închidere."
        danger
        confirmLabel="Retrage-mă"
        loading={leaving}
        onConfirm={() => void handleLeave()}
        onCancel={() => setLeaveModalOpen(false)}
      />

      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm mb-5 cursor-pointer hover:underline"
        style={{ color: 'var(--text-2)' }}
      >
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
            {isActive ? (
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: '#22c55e' }} />
                LIVE
              </span>
            ) : isFinished ? 'Finalizat' : 'Anulat'}
          </span>
        </div>

        {/* Countdown */}
        {isActive && tl && (
          <div className="grid grid-cols-4 gap-2 mb-5">
            {([
              { v: pad(tl.days), l: 'Zile' },
              { v: pad(tl.hours), l: 'Ore' },
              { v: pad(tl.mins), l: 'Min' },
              { v: pad(tl.secs), l: 'Sec' },
            ]).map(({ v, l }) => (
              <div key={l} className="py-3 rounded-2xl flex flex-col items-center"
                style={{ backgroundColor: 'var(--bg-3)' }}>
                <span className="text-2xl font-extrabold leading-none font-mono" style={{ color: 'var(--text)' }}>{v}</span>
                <span className="text-[11px] mt-1" style={{ color: 'var(--text-2)' }}>{l}</span>
              </div>
            ))}
          </div>
        )}

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
            {giveaway.maxParticipants && <span>/ {giveaway.maxParticipants} max</span>}
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

        {/* Câștigător */}
        {isFinished && giveaway.winner && (() => {
          const w = giveaway.winner!.profileElev;
          const winnerName = w ? `${w.firstName} ${w.lastName}` : 'Câștigător';
          return (
            <div
              className="rounded-2xl p-5 mb-5"
              style={{ backgroundColor: 'rgba(246,166,35,0.07)', border: '1px solid rgba(246,166,35,0.25)' }}
            >
              {/* Trophy + label */}
              <div className="flex items-center gap-2 mb-4">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: 'rgba(246,166,35,0.15)' }}
                >
                  <Trophy size={18} style={{ color: 'var(--orange)' }} />
                </div>
                <div>
                  <p
                    className="text-[10px] font-bold uppercase tracking-widest"
                    style={{ color: 'var(--orange)' }}
                  >
                    Câștigătorul giveaway-ului
                  </p>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-2)' }}>
                    Selectat aleatoriu din {giveaway._count.participants} participanți
                  </p>
                </div>
              </div>

              {/* Avatar + name */}
              <div
                className="flex items-center gap-3 p-3 rounded-xl"
                style={{ backgroundColor: 'rgba(246,166,35,0.1)' }}
              >
                {w?.avatarUrl ? (
                  <img
                    src={w.avatarUrl}
                    alt={winnerName}
                    className="w-11 h-11 rounded-full object-cover shrink-0"
                    loading="lazy"
                  />
                ) : (
                  <div
                    className="w-11 h-11 rounded-full flex items-center justify-center font-bold shrink-0"
                    style={{ backgroundColor: 'var(--orange)', color: '#fff', fontSize: '15px' }}
                  >
                    {initials(winnerName)}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-bold text-base leading-tight truncate" style={{ color: 'var(--text)' }}>
                    {winnerName}
                  </p>
                  {giveaway.winnerIdea ? (
                    <Link
                      to={`/idea/${giveaway.winnerIdea.id}`}
                      className="text-xs mt-0.5 block truncate hover:underline"
                      style={{ color: 'var(--orange)' }}
                    >
                      Idee: {giveaway.winnerIdea.title}
                    </Link>
                  ) : (
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-2)' }}>Elev câștigător</p>
                  )}
                </div>
              </div>

              {/* Antreprenorul creator poate contacta câștigătorul */}
              {user?.id === giveaway.antreprenor.id && (
                <button
                  onClick={() => void handleContactWinner()}
                  disabled={contactingWinner}
                  className="w-full mt-3 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60 hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
                >
                  {contactingWinner ? <Loader2 size={14} className="animate-spin" /> : <MessageSquare size={14} />}
                  Contactează elevul
                </button>
              )}
            </div>
          );
        })()}

        {/* Acțiuni elev */}
        {isElev && isActive && (
          <div className="mt-1 space-y-3">
            {/* Banner participare activă */}
            {giveaway.myParticipation && (
              <div className="flex items-center gap-2 p-4 rounded-xl"
                style={{ backgroundColor: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
                <CheckCircle size={18} style={{ color: '#22c55e' }} />
                <p className="text-sm font-semibold" style={{ color: '#22c55e' }}>Participi la acest giveaway!</p>
              </div>
            )}

            {/* Fără idei — cerințe + buton creare */}
            {myIdeas.length === 0 && (
              <div className="space-y-3">
                <div className="p-4 rounded-xl text-sm" style={{ backgroundColor: 'var(--bg-3)' }}>
                  <p className="font-semibold mb-1.5" style={{ color: 'var(--text)' }}>Cerințe pentru participare:</p>
                  <ul className="space-y-1 text-xs" style={{ color: 'var(--text-2)' }}>
                    <li className="flex items-center gap-1.5">
                      <span className="shrink-0 w-4 h-4 rounded-full flex items-center justify-center font-bold text-[10px]"
                        style={{ backgroundColor: 'rgba(246,166,35,0.15)', color: 'var(--orange)' }}>1</span>
                      Titlu completat (minim 5 caractere)
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="shrink-0 w-4 h-4 rounded-full flex items-center justify-center font-bold text-[10px]"
                        style={{ backgroundColor: 'rgba(246,166,35,0.15)', color: 'var(--orange)' }}>2</span>
                      Minim 100 de cuvinte în descriere
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="shrink-0 w-4 h-4 rounded-full flex items-center justify-center font-bold text-[10px]"
                        style={{ backgroundColor: 'rgba(246,166,35,0.15)', color: 'var(--orange)' }}>3</span>
                      Cel puțin o imagine sau un PDF atașat
                    </li>
                  </ul>
                </div>
                <Link to="/idea/new"
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold"
                  style={{ backgroundColor: 'var(--orange)', color: '#fff' }}>
                  <Trophy size={14} />
                  Postează o idee nouă
                </Link>
              </div>
            )}

            {/* Lista idei — toate dacă nu e înscris, doar ideea înscrisă dacă e */}
            {myIdeas.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-2)' }}>
                  {giveaway.myParticipation ? 'Ideea înscrisă' : 'Ideile tale'}
                </p>
                {(giveaway.myParticipation
                  ? myIdeas.filter((idea) => idea.id === giveaway.myParticipation!.idea?.id)
                  : myIdeas
                ).map((idea) => {
                  const isEligible = idea.wordCount >= 100 && (idea.images.length > 0 || idea.pdfs.length > 0);
                  const isParticipatingWithThis = giveaway.myParticipation?.idea?.id === idea.id;
                  const alreadyJoinedWithOther = !!giveaway.myParticipation && !isParticipatingWithThis;
                  const qualified = isEligible && !alreadyJoinedWithOther;

                  const reasons: string[] = [];
                  if (idea.wordCount < 100) reasons.push(`Descriere sub 100 cuvinte (${idea.wordCount}/100)`);
                  if (idea.images.length === 0 && idea.pdfs.length === 0) reasons.push('Lipsă imagine sau PDF');
                  if (alreadyJoinedWithOther) reasons.push('Ai deja o idee calificată în acest giveaway');

                  return (
                    <div key={idea.id} className="p-4 rounded-xl"
                      style={{
                        backgroundColor: 'var(--bg-3)',
                        border: `1px solid ${qualified ? 'rgba(34,197,94,0.25)' : 'var(--border)'}`,
                      }}>
                      {/* Titlu + badge */}
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <p className="text-sm font-semibold leading-snug" style={{ color: 'var(--text)' }}>
                          {idea.title}
                        </p>
                        <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
                          style={{
                            backgroundColor: qualified ? 'rgba(34,197,94,0.12)' : 'rgba(246,166,35,0.12)',
                            color: qualified ? '#22c55e' : 'var(--orange)',
                          }}>
                          {qualified ? 'Calificată' : 'Nu corespunde'}
                        </span>
                      </div>

                      {/* Motive neeligibilitate */}
                      {!qualified && reasons.length > 0 && (
                        <div className="mb-3">
                          <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5"
                            style={{ color: 'var(--text-2)' }}>
                            Motiv
                          </p>
                          <div className="space-y-1">
                            {reasons.map((reason) => (
                              <div key={reason} className="flex items-start gap-2 text-xs">
                                <span className="shrink-0 w-4 h-4 rounded-full flex items-center justify-center font-bold text-[10px] mt-px"
                                  style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>
                                  ✗
                                </span>
                                <span style={{ color: '#ef4444' }}>{reason}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Participi cu aceasta */}
                      {isParticipatingWithThis && (
                        <p className="text-xs font-semibold mt-1" style={{ color: '#22c55e' }}>
                          ✓ Participi cu această idee
                        </p>
                      )}

                      {/* Buton participare */}
                      {qualified && !giveaway.myParticipation && (
                        <button
                          onClick={() => void handleJoin(idea.id)}
                          disabled={joiningIdeaId === idea.id}
                          className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          style={{ backgroundColor: 'var(--orange)', color: '#fff' }}>
                          {joiningIdeaId === idea.id
                            ? <Loader2 size={12} className="animate-spin" />
                            : <Trophy size={12} />}
                          Participă cu această idee
                        </button>
                      )}

                      {/* Buton editare (doar dacă nu e blocată de altă idee calificată) */}
                      {!qualified && !alreadyJoinedWithOther && (
                        <Link to={`/idea/${idea.id}/edit`}
                          className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                          style={{ backgroundColor: 'var(--bg-4)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
                          Editează ideea
                        </Link>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Buton retragere */}
            {giveaway.myParticipation && (
              <button
                onClick={() => setLeaveModalOpen(true)}
                disabled={leaving}
                className="w-full py-2.5 rounded-xl text-sm font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: 'var(--bg-3)', color: 'var(--text-2)', border: '1px solid var(--border)' }}
                onMouseEnter={(e) => { if (!leaving) e.currentTarget.style.backgroundColor = 'var(--bg-4)'; }}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-3)')}>
                Retrage participarea
              </button>
            )}
          </div>
        )}

        {/* Spinner auto-selecție (doar pentru owner, între expirare și selecția serverului) */}
        {isOwner && hasEnded && giveaway.status === 'ACTIVE' && (
          <div className="mt-5 flex items-center gap-2 px-4 py-3 rounded-xl"
            style={{ backgroundColor: 'rgba(246,166,35,0.08)', border: '1px solid rgba(246,166,35,0.2)' }}>
            <Loader2 size={15} className="animate-spin" style={{ color: 'var(--orange)' }} />
            <p className="text-sm font-medium" style={{ color: 'var(--orange)' }}>
              Giveaway-ul s-a încheiat — câștigătorul se alege automat...
            </p>
          </div>
        )}

        {/* Bloc confirmare investiție — vizibil pentru owner și câștigător */}
        {isFinished && (isOwner || isWinner) && (
          <div className="mt-5 space-y-3">
            {/* Explicație */}
            {!fullyConfirmed && (
              <div className="rounded-xl px-4 py-3 text-sm"
                style={{ backgroundColor: 'rgba(246,166,35,0.08)', border: '1px solid rgba(246,166,35,0.2)' }}>
                <p className="font-semibold mb-1" style={{ color: 'var(--orange)' }}>
                  Confirmarea investiției necesită acordul ambelor părți
                </p>
                <p style={{ color: 'var(--text-2)' }}>
                  Atât antreprenorul cât și câștigătorul trebuie să confirme pentru a oficializa colaborarea.
                </p>
              </div>
            )}

            {/* Status per parte */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl px-3 py-2.5 flex items-center gap-2"
                style={{
                  backgroundColor: giveaway.investmentConfirmedByAntreprenor ? 'rgba(34,197,94,0.08)' : 'var(--bg-3)',
                  border: `1px solid ${giveaway.investmentConfirmedByAntreprenor ? 'rgba(34,197,94,0.2)' : 'var(--border)'}`,
                }}>
                <CheckCircle size={14} style={{ color: giveaway.investmentConfirmedByAntreprenor ? '#22c55e' : 'var(--text-2)', flexShrink: 0 }} />
                <div>
                  <p className="text-xs font-semibold" style={{ color: giveaway.investmentConfirmedByAntreprenor ? '#22c55e' : 'var(--text-2)' }}>
                    Antreprenor
                  </p>
                  <p className="text-[11px]" style={{ color: 'var(--text-2)' }}>
                    {giveaway.investmentConfirmedByAntreprenor ? 'Confirmat' : 'Neconfirmat'}
                  </p>
                </div>
              </div>
              <div className="rounded-xl px-3 py-2.5 flex items-center gap-2"
                style={{
                  backgroundColor: giveaway.investmentConfirmedByElev ? 'rgba(34,197,94,0.08)' : 'var(--bg-3)',
                  border: `1px solid ${giveaway.investmentConfirmedByElev ? 'rgba(34,197,94,0.2)' : 'var(--border)'}`,
                }}>
                <CheckCircle size={14} style={{ color: giveaway.investmentConfirmedByElev ? '#22c55e' : 'var(--text-2)', flexShrink: 0 }} />
                <div>
                  <p className="text-xs font-semibold" style={{ color: giveaway.investmentConfirmedByElev ? '#22c55e' : 'var(--text-2)' }}>
                    Câștigător
                  </p>
                  <p className="text-[11px]" style={{ color: 'var(--text-2)' }}>
                    {giveaway.investmentConfirmedByElev ? 'Confirmat' : 'Neconfirmat'}
                  </p>
                </div>
              </div>
            </div>

            {/* Confirmat complet */}
            {fullyConfirmed ? (
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl"
                style={{ backgroundColor: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
                <CheckCircle size={16} style={{ color: '#22c55e' }} />
                <p className="text-sm font-semibold" style={{ color: '#22c55e' }}>
                  Investiție confirmată de ambele părți — colaborare oficializată!
                </p>
              </div>
            ) : iAlreadyConfirmed ? (
              <div className="px-4 py-3 rounded-xl text-sm"
                style={{ backgroundColor: 'var(--bg-3)', border: '1px solid var(--border)' }}>
                <p className="font-medium" style={{ color: 'var(--text-2)' }}>
                  Ai confirmat. Așteptăm confirmarea celeilalte părți.
                </p>
              </div>
            ) : (
              <button
                onClick={() => void handleConfirmInvestment()}
                disabled={confirmingInvestment}
                className="w-full py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: 'var(--bg-3)', color: 'var(--text)', border: '1px solid var(--border)' }}
                onMouseEnter={(e) => { if (!confirmingInvestment) e.currentTarget.style.backgroundColor = 'var(--bg-4)'; }}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-3)')}>
                {confirmingInvestment && <Loader2 size={14} className="animate-spin" />}
                Confirmă investiția
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
