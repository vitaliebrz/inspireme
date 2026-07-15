import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Trophy, Users, Plus, CheckCircle, Clock, ArrowRight, Gift } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

const canHover = typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

interface WinnerInfo {
  name: string;
  ideaTitle: string | null;
}

interface GiveawayItem {
  id: string;
  title: string;
  description: string;
  investmentDescription: string;
  startDate: string;
  endDate: string;
  maxParticipants: number | null;
  status: 'ACTIVE' | 'FINISHED' | 'CANCELLED';
  winnerId: string | null;
  winner: WinnerInfo | null;
  antreprenor: {
    id: string;
    profileAntreprenor: {
      firstName: string; lastName: string; company: string | null; avatarUrl: string | null;
    } | null;
  };
  _count: { participants: number };
  isParticipating: boolean;
}

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

export default function GiveawaysPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [giveaways, setGiveaways] = useState<GiveawayItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'FINISHED'>('ALL');
  const [now, setNow] = useState(() => new Date());

  const isElev = user?.role === 'ELEV';
  const isAntreprenorPro = user?.role === 'ADMIN' || (user?.role === 'ANTREPRENOR' && user.plan === 'PRO');

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    setLoading(true);
    const status = filter === 'ALL' ? '' : `?status=${filter}`;
    api.get<{ giveaways: GiveawayItem[] }>(`/giveaways${status}`)
      .then(({ data }) => setGiveaways(data.giveaways))
      .finally(() => setLoading(false));
  }, [filter]);

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Giveaway-uri</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-2)' }}>
            Antreprenorii investesc în idei. Participă cu ideea ta!
          </p>
        </div>
        {isAntreprenorPro && (
          <Link
            to="/giveaways/new"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold shrink-0"
            style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
          >
            <Plus size={16} /> Lansează
          </Link>
        )}
      </div>

      {/* Filtre */}
      <div className="flex gap-2 mb-6">
        {(['ALL', 'ACTIVE', 'FINISHED'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="px-4 py-2 rounded-xl text-sm font-medium cursor-pointer"
            style={{
              backgroundColor: filter === f ? 'rgba(246,166,35,0.12)' : 'var(--bg-2)',
              border: `1.5px solid ${filter === f ? 'var(--orange)' : 'var(--border)'}`,
              color: filter === f ? 'var(--orange)' : 'var(--text-2)',
              transition: 'background-color 150ms, border-color 150ms, color 150ms',
            }}
          >
            {f === 'ALL' ? 'Toate' : f === 'ACTIVE' ? 'Active' : 'Încheiate'}
          </button>
        ))}
      </div>

      {/* Lista */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="skeleton rounded-2xl" style={{ height: '264px' }} />
          ))}
        </div>
      ) : giveaways.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}
          >
            <Gift size={28} style={{ color: 'var(--text-2)', opacity: 0.4 }} />
          </div>
          <div className="text-center">
            <p className="font-semibold" style={{ color: 'var(--text)' }}>
              Niciun giveaway{filter === 'ACTIVE' ? ' activ' : filter === 'FINISHED' ? ' încheiat' : ''} momentan
            </p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-2)' }}>
              {isAntreprenorPro
                ? 'Fii primul care lansează o oportunitate pentru elevi!'
                : 'Revino mai târziu pentru oportunități noi.'}
            </p>
          </div>
          {isAntreprenorPro && (
            <Link
              to="/giveaways/new"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
              style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
            >
              <Plus size={15} /> Lansează primul giveaway
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {giveaways.map((g) => {
            const p = g.antreprenor.profileAntreprenor;
            const firstName = p?.firstName ?? '';
            const lastName = p?.lastName ?? '';
            const company = p?.company ?? (p ? `${firstName} ${lastName}`.trim() : 'Antreprenor');
            const initials = `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase() || '?';
            const nowMs = now.getTime();
            const isLive = g.status === 'ACTIVE'
              && nowMs >= new Date(g.startDate).getTime()
              && nowMs <= new Date(g.endDate).getTime();
            const isFinished = g.status === 'FINISHED';
            const hasExpired = g.status === 'ACTIVE' && nowMs > new Date(g.endDate).getTime();
            const { days, hours, mins, secs } = getTimeLeft(g.endDate, now);
            const participants = g._count.participants;
            const maxP = g.maxParticipants;
            const progressPct = maxP ? Math.min(100, (participants / maxP) * 100) : 0;

            return (
              <div
                key={g.id}
                className="rounded-2xl p-4 flex flex-col gap-3"
                style={{
                  backgroundColor: 'var(--bg-2)',
                  border: '1px solid var(--border)',
                  transition: 'transform 150ms ease-out, box-shadow 150ms ease-out',
                  opacity: (isFinished || hasExpired || g.status === 'CANCELLED') ? 0.82 : 1,
                }}
                onMouseEnter={canHover ? (e) => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.transform = 'translateY(-2px)';
                  el.style.boxShadow = '0 8px 24px rgba(0,0,0,0.1)';
                } : undefined}
                onMouseLeave={canHover ? (e) => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.transform = '';
                  el.style.boxShadow = '';
                } : undefined}
              >
                {/* Company + status */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 font-bold"
                      style={{
                        backgroundColor: 'rgba(246,166,35,0.15)',
                        color: 'var(--orange)',
                        fontSize: '10px',
                      }}
                    >
                      {initials}
                    </div>
                    <span className="text-xs truncate" style={{ color: 'var(--text-2)' }}>{company}</span>
                  </div>

                  {isLive ? (
                    <div
                      className="flex items-center gap-1.5 px-2 py-1 rounded-full shrink-0"
                      style={{ backgroundColor: 'rgba(34,197,94,0.12)' }}
                    >
                      <span className="relative flex h-1.5 w-1.5">
                        <span
                          className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                          style={{ backgroundColor: '#22c55e' }}
                        />
                        <span
                          className="relative inline-flex rounded-full h-1.5 w-1.5"
                          style={{ backgroundColor: '#22c55e' }}
                        />
                      </span>
                      <span className="text-[11px] font-bold" style={{ color: '#22c55e' }}>LIVE</span>
                    </div>
                  ) : isFinished ? (
                    <span
                      className="text-[11px] font-bold px-2 py-1 rounded-full shrink-0"
                      style={{ backgroundColor: 'var(--bg-4)', color: 'var(--text-2)' }}
                    >
                      ÎNCHEIAT
                    </span>
                  ) : hasExpired ? (
                    <span
                      className="text-[11px] font-bold px-2 py-1 rounded-full shrink-0"
                      style={{ backgroundColor: 'rgba(249,115,22,0.12)', color: '#f97316' }}
                    >
                      EXPIRAT
                    </span>
                  ) : (
                    <span
                      className="text-[11px] font-bold px-2 py-1 rounded-full shrink-0"
                      style={{ backgroundColor: 'var(--bg-4)', color: 'var(--text-2)' }}
                    >
                      ANULAT
                    </span>
                  )}
                </div>

                {/* Title */}
                <h2
                  className="font-bold italic leading-snug line-clamp-2"
                  style={{ color: 'var(--text)', fontSize: '15px' }}
                >
                  {g.title}
                </h2>

                {/* Prize */}
                <div
                  className="flex items-center gap-2 px-3 py-2 rounded-xl"
                  style={{
                    backgroundColor: isLive ? 'rgba(246,166,35,0.1)' : 'var(--bg-3)',
                    border: `1px solid ${isLive ? 'rgba(246,166,35,0.25)' : 'var(--border)'}`,
                  }}
                >
                  <Trophy size={13} style={{ color: isLive ? 'var(--orange)' : 'var(--text-2)', flexShrink: 0 }} />
                  <span
                    className="text-xs font-semibold line-clamp-1"
                    style={{ color: isLive ? 'var(--orange)' : 'var(--text-2)' }}
                  >
                    {g.investmentDescription}
                  </span>
                </div>

                {/* Description (active only) */}
                {isLive && g.description && (
                  <p
                    className="text-xs line-clamp-2"
                    style={{ color: 'var(--text-2)', lineHeight: '1.55' }}
                  >
                    {g.description}
                  </p>
                )}

                {/* Countdown (active only) */}
                {isLive && (
                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      { v: days, l: 'Zile' },
                      { v: hours, l: 'Ore' },
                      { v: mins, l: 'Min' },
                      { v: secs, l: 'Sec' },
                    ].map(({ v, l }) => (
                      <div
                        key={l}
                        className="py-2 rounded-xl flex flex-col items-center gap-0.5"
                        style={{ backgroundColor: 'var(--bg-4)' }}
                      >
                        <span
                          className="font-extrabold tabular-nums"
                          style={{ color: 'var(--text)', fontSize: '18px', lineHeight: '1.1' }}
                        >
                          {pad(v)}
                        </span>
                        <span
                          className="font-medium uppercase tracking-wide"
                          style={{ color: 'var(--text-2)', fontSize: '9px' }}
                        >
                          {l}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Participants + progress (active only) */}
                {isLive && (
                  <div className="space-y-1.5">
                    <div
                      className="flex items-center justify-between text-xs"
                      style={{ color: 'var(--text-2)' }}
                    >
                      <div className="flex items-center gap-1">
                        <Users size={11} />
                        <span>{participants} participanți</span>
                      </div>
                      {maxP && <span>{maxP - participants} locuri libere</span>}
                    </div>
                    {maxP && (
                      <div
                        className="h-1.5 rounded-full overflow-hidden"
                        style={{ backgroundColor: 'var(--bg-4)' }}
                      >
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${progressPct}%`,
                            background: progressPct >= 80
                              ? 'linear-gradient(to right, #f97316, #ef4444)'
                              : 'linear-gradient(to right, var(--orange), #22c55e)',
                            transition: 'width 500ms ease-out',
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Winner box (finished with winner) */}
                {(isFinished || hasExpired) && g.winner && (
                  <div
                    className="rounded-xl p-3"
                    style={{ backgroundColor: 'rgba(246,166,35,0.08)', border: '1px solid rgba(246,166,35,0.25)' }}
                  >
                    <div className="flex items-center gap-1.5 mb-2">
                      <Trophy size={11} style={{ color: 'var(--orange)' }} />
                      <span
                        className="text-[10px] font-bold uppercase tracking-wide"
                        style={{ color: 'var(--orange)' }}
                      >
                        Câștigător
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 font-bold"
                        style={{ backgroundColor: 'var(--orange)', color: '#fff', fontSize: '10px' }}
                      >
                        {g.winner.name.split(' ').map((w) => w[0] ?? '').join('').toUpperCase().slice(0, 2) || '?'}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold leading-tight truncate" style={{ color: 'var(--text)' }}>
                          {g.winner.name}
                        </p>
                        {g.winner.ideaTitle && (
                          <p className="text-[11px] mt-0.5 line-clamp-1" style={{ color: 'var(--text-2)' }}>
                            {g.winner.ideaTitle}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Finished without winner */}
                {(isFinished || hasExpired) && !g.winner && (
                  <div
                    className="flex items-center gap-2 px-3 py-2 rounded-xl"
                    style={{ backgroundColor: 'var(--bg-3)', border: '1px solid var(--border)' }}
                  >
                    <Users size={12} style={{ color: 'var(--text-2)' }} />
                    <span className="text-xs" style={{ color: 'var(--text-2)' }}>
                      {participants} participanți înscriși
                    </span>
                  </div>
                )}

                {/* CTA */}
                <div className="flex gap-2 mt-auto">
                  {isLive && isElev && (
                    g.isParticipating ? (
                      <button
                        onClick={() => navigate(`/giveaways/${g.id}`)}
                        className="flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                        style={{ backgroundColor: 'rgba(34,197,94,0.15)', color: '#22c55e' }}
                      >
                        <CheckCircle size={13} /> Participi deja
                      </button>
                    ) : (
                      <button
                        onClick={() => navigate(`/giveaways/${g.id}`)}
                        className="flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                        style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
                      >
                        <Trophy size={13} /> Participă
                      </button>
                    )
                  )}
                  {(isFinished || hasExpired) && (
                    <div
                      className="flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"
                      style={{ backgroundColor: 'var(--bg-4)', color: 'var(--text-2)' }}
                    >
                      <Clock size={13} /> Încheiat
                    </div>
                  )}
                  <Link
                    to={`/giveaways/${g.id}`}
                    className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold shrink-0"
                    style={{
                      backgroundColor: 'var(--bg-3)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-2)',
                    }}
                    onMouseEnter={canHover ? (e) => { e.currentTarget.style.color = 'var(--text)'; } : undefined}
                    onMouseLeave={canHover ? (e) => { e.currentTarget.style.color = 'var(--text-2)'; } : undefined}
                  >
                    Detalii <ArrowRight size={12} />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
