import { Handshake, Gift, Crown, AlertCircle, User, MessageCirclePlus, MessageSquare } from 'lucide-react';

const canHover = typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

const STATUS_CONFIG = {
  ACTIV:   { label: 'Activ',   color: '#22c55e' },
  INACTIV: { label: 'Inactiv', color: '#f59e0b' },
  RETRAS:  { label: 'Retras',  color: '#6b7280' },
} as const;

export interface AntreprenorCardData {
  id: string;
  plan: string;
  status: keyof typeof STATUS_CONFIG;
  lastActivity: string | null;
  profileAntreprenor: {
    firstName: string;
    lastName: string;
    company: string | null;
    domain: string | null;
    position: string | null;
    bioMentor: string | null;
    avatarUrl: string | null;
    experienceYears: number | null;
  } | null;
  _count: {
    collaborationsAsAntreprenor: number;
    giveawaysCreated: number;
  };
}

interface Props {
  antreprenor: AntreprenorCardData;
  onClick?: () => void;
  onViewProfile?: () => void;
  onContact?: () => void;
  isConnected?: boolean;
}

export default function AntreprenorCard({ antreprenor, onClick, onViewProfile, onContact, isConnected }: Props) {
  const p = antreprenor.profileAntreprenor;
  if (!p) return null;

  const initials = `${p.firstName[0] ?? ''}${p.lastName[0] ?? ''}`.toUpperCase();
  const statusCfg = STATUS_CONFIG[antreprenor.status] ?? STATUS_CONFIG.RETRAS;
  const isPro = antreprenor.plan === 'PRO';
  const isRetras = antreprenor.status === 'RETRAS';

  return (
    <article
      onClick={onClick}
      className="flex flex-col rounded-2xl p-4 cursor-pointer"
      style={{
        transition: 'transform 150ms var(--ease-out)',
        backgroundColor: 'var(--bg-2)',
        border: '1px solid var(--border)',
        boxShadow: isPro ? '0 0 0 1.5px rgba(246,166,35,0.3)' : undefined,
        opacity: isRetras ? 0.65 : 1,
      }}
      onMouseEnter={canHover ? (e) => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; } : undefined}
      onMouseLeave={canHover ? (e) => { (e.currentTarget as HTMLElement).style.transform = ''; } : undefined}
    >
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        {/* Avatar */}
        {p.avatarUrl ? (
          <img src={p.avatarUrl} alt={initials} className="w-12 h-12 rounded-2xl object-cover shrink-0" loading="lazy" />
        ) : (
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center text-sm font-bold shrink-0"
            style={{ backgroundColor: 'var(--bg-3)', color: 'var(--orange)' }}
          >
            {initials}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-sm" style={{ color: 'var(--text)' }}>
              {p.firstName} {p.lastName}
            </span>
            {isPro && (
              <span
                className="flex items-center gap-1 text-xs font-semibold px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: 'rgba(246,166,35,0.18)', color: 'var(--orange)' }}
              >
                <Crown size={10} /> Pro
              </span>
            )}
            <span
              className="text-xs font-medium ml-auto"
              style={{ color: statusCfg.color }}
            >
              ● {statusCfg.label}
            </span>
          </div>
          {p.position && (
            <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-2)' }}>
              {p.position}{p.company ? ` · ${p.company}` : ''}
            </p>
          )}
          {p.domain && (
            <span
              className="inline-block text-xs font-medium mt-1 px-2 py-0.5 rounded-full"
              style={{ backgroundColor: 'var(--bg-3)', color: 'var(--text-2)' }}
            >
              {p.domain}
            </span>
          )}
        </div>
      </div>

      {/* Bio mentor */}
      {p.bioMentor && (
        <p className="text-xs leading-relaxed line-clamp-2 mb-3" style={{ color: 'var(--text-2)' }}>
          {p.bioMentor}
        </p>
      )}

      {/* Avertisment retras */}
      {isRetras && (
        <div
          className="flex items-center gap-1.5 text-xs rounded-xl px-3 py-2 mb-3"
          style={{ backgroundColor: 'rgba(107,114,128,0.12)', color: '#6b7280' }}
        >
          <AlertCircle size={12} />
          Antreprenor inactiv de mai mult de 60 de zile
        </div>
      )}

      {/* Stats */}
      <div className="flex items-center gap-4 pt-3 mt-auto text-xs" style={{ borderTop: '1px solid var(--border)', color: 'var(--text-2)' }}>
        <span className="flex items-center gap-1.5">
          <Handshake size={12} style={{ color: 'var(--orange)' }} />
          {antreprenor._count.collaborationsAsAntreprenor} colaborări
        </span>
        <span className="flex items-center gap-1.5">
          <Gift size={12} style={{ color: 'var(--orange)' }} />
          {antreprenor._count.giveawaysCreated} giveaway-uri
        </span>
        {p.experienceYears && (
          <span className="ml-auto">{p.experienceYears} ani exp.</span>
        )}
      </div>

      {/* Butoane acțiuni */}
      <div className="grid grid-cols-2 gap-2 mt-3">
        <button
          onClick={(e) => { e.stopPropagation(); onViewProfile?.(); }}
          className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium cursor-pointer"
          style={{ backgroundColor: 'var(--bg-3)', color: 'var(--text-2)', border: '1px solid var(--border)' }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-4)')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-3)')}
        >
          <User size={12} /> Vizualizează profil
        </button>
        {onContact && (
          isConnected ? (
            <button
              onClick={(e) => { e.stopPropagation(); onContact(); }}
              className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold cursor-pointer"
              style={{ backgroundColor: 'rgba(34,197,94,0.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.25)' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(34,197,94,0.2)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(34,197,94,0.12)')}
            >
              <MessageSquare size={12} /> Deschide chat
            </button>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); onContact(); }}
              className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold cursor-pointer"
              style={{ backgroundColor: 'rgba(246,166,35,0.12)', color: 'var(--orange)', border: '1px solid rgba(246,166,35,0.25)' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(246,166,35,0.2)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(246,166,35,0.12)')}
            >
              <MessageCirclePlus size={12} /> Trimite cerere
            </button>
          )
        )}
      </div>
    </article>
  );
}
