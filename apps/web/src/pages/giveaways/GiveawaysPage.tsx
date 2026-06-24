import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Trophy, Calendar, Users, Crown, Loader2, Plus } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

interface GiveawayItem {
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
  _count: { participants: number };
}

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Activ', FINISHED: 'Finalizat', CANCELLED: 'Anulat',
};
const STATUS_COLOR: Record<string, string> = {
  ACTIVE: '#22c55e', FINISHED: '#8892a4', CANCELLED: '#ef4444',
};

function formatDate(dt: string) {
  return new Date(dt).toLocaleDateString('ro-RO', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function GiveawaysPage() {
  const { user } = useAuth();
  const [giveaways, setGiveaways] = useState<GiveawayItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'FINISHED'>('ACTIVE');

  const isAntreprenorPro = user?.role === 'ANTREPRENOR' && user.plan === 'PRO';

  useEffect(() => {
    setLoading(true);
    const status = filter === 'ALL' ? '' : `?status=${filter}`;
    api.get<{ giveaways: GiveawayItem[] }>(`/giveaways${status}`)
      .then(({ data }) => setGiveaways(data.giveaways))
      .finally(() => setLoading(false));
  }, [filter]);

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Giveaway-uri</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-2)' }}>
            Antreprenorii investesc în idei. Participă cu ideea ta!
          </p>
        </div>
        {isAntreprenorPro && (
          <Link to="/giveaways/new"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
            style={{ backgroundColor: 'var(--orange)', color: '#fff' }}>
            <Plus size={16} /> Lansează giveaway
          </Link>
        )}
      </div>

      {/* Filtre status */}
      <div className="flex gap-2 mb-6">
        {(['ACTIVE', 'FINISHED', 'ALL'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
            style={{
              backgroundColor: filter === f ? 'rgba(246,166,35,0.12)' : 'var(--bg-2)',
              border: `1.5px solid ${filter === f ? 'var(--orange)' : 'var(--border)'}`,
              color: filter === f ? 'var(--orange)' : 'var(--text-2)',
            }}>
            {f === 'ALL' ? 'Toate' : STATUS_LABEL[f]}
          </button>
        ))}
      </div>

      {/* Lista */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-52 rounded-2xl" />)}
        </div>
      ) : giveaways.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Trophy size={40} style={{ color: 'var(--text-2)', opacity: 0.3 }} />
          <p style={{ color: 'var(--text-2)' }}>Niciun giveaway {filter === 'ACTIVE' ? 'activ' : ''} momentan.</p>
          {isAntreprenorPro && (
            <Link to="/giveaways/new" className="text-sm font-semibold" style={{ color: 'var(--orange)' }}>
              Lansează primul giveaway
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {giveaways.map((g) => {
            const p = g.antreprenor.profileAntreprenor;
            const name = p ? `${p.firstName} ${p.lastName}` : 'Antreprenor';
            const now = new Date();
            const isActive = g.status === 'ACTIVE' && now >= new Date(g.startDate) && now <= new Date(g.endDate);
            const daysLeft = Math.max(0, Math.ceil((new Date(g.endDate).getTime() - now.getTime()) / 86400000));

            return (
              <Link key={g.id} to={`/giveaways/${g.id}`}
                className="block rounded-2xl p-5 transition-all hover:scale-[1.01]"
                style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}>

                {/* Status + zile rămase */}
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                    style={{ backgroundColor: `${STATUS_COLOR[g.status] ?? '#8892a4'}1a`, color: STATUS_COLOR[g.status] }}>
                    {STATUS_LABEL[g.status] ?? g.status}
                  </span>
                  {isActive && (
                    <span className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>
                      {daysLeft} {daysLeft === 1 ? 'zi' : 'zile'} rămase
                    </span>
                  )}
                </div>

                <h2 className="font-bold text-base mb-1 line-clamp-2" style={{ color: 'var(--text)' }}>{g.title}</h2>
                <p className="text-sm line-clamp-2 mb-4" style={{ color: 'var(--text-2)' }}>{g.description}</p>

                {/* Premiu */}
                <div className="rounded-xl px-3 py-2 mb-4 text-xs"
                  style={{ backgroundColor: 'rgba(246,166,35,0.08)', color: 'var(--orange)' }}>
                  <span className="font-semibold">Premiu: </span>{g.investmentDescription}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between text-xs" style={{ color: 'var(--text-2)' }}>
                  <div className="flex items-center gap-2">
                    {p?.avatarUrl
                      ? <img src={p.avatarUrl} alt={name} className="w-6 h-6 rounded-full object-cover" loading="lazy" />
                      : <div className="w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs shrink-0"
                          style={{ backgroundColor: 'var(--bg-4)', color: 'var(--text-2)' }}>
                          {name[0]?.toUpperCase() ?? 'A'}
                        </div>
                    }
                    <span className="truncate max-w-25">{p?.company ?? name}</span>
                    <Crown size={10} style={{ color: 'var(--orange)' }} />
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1"><Users size={11} /> {g._count.participants}</span>
                    <span className="flex items-center gap-1"><Calendar size={11} /> {formatDate(g.endDate)}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
