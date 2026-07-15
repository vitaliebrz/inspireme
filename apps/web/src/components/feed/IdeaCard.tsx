import { Eye, MessageSquare, Star, MapPin, Crown, Trophy, User, MessageCirclePlus } from 'lucide-react';
import { getIconForCategoryName } from '../../lib/useCategories';

const canHover = typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

const STATUS_COLORS: Record<string, string> = {
  PUBLICAT: '#8892a4',
  CONTACTAT: '#f6a623',
  IN_COLABORARE: '#22c55e',
  REALIZAT: '#a855f7',
};

export interface IdeaCardData {
  id: string;
  title: string;
  categories: string[];
  problem: string;
  viewCount: number;
  status: string;
  planAtPost: string;
  createdAt: string;
  tags: string[];
  user: {
    id: string;
    plan: string;
    profileElev: {
      firstName: string;
      lastName: string;
      avatarUrl: string | null;
      city: string | null;
    } | null;
  };
  images: { url: string }[];
  _count: { feedbackList: number; connectionRequests: number };
}

interface Props {
  idea: IdeaCardData;
  onClick?: () => void;
  onViewProfile?: () => void;
  onContact?: () => void;
  isConnected?: boolean;
}

export default function IdeaCard({ idea, onClick, onViewProfile, onContact, isConnected }: Props) {
  const profile = idea.user.profileElev;
  const initials = profile
    ? `${profile.firstName[0] ?? ''}${profile.lastName[0] ?? ''}`.toUpperCase()
    : '?';
  const isPro = idea.planAtPost === 'PRO';
  const isRealizat = idea.status === 'REALIZAT';

  const primaryLabel = idea.categories[0] ?? '';
  const CategoryIcon = getIconForCategoryName(primaryLabel);

  return (
    <article
      onClick={onClick}
      className="idea-card flex flex-col rounded-2xl overflow-hidden cursor-pointer"
      style={{
        backgroundColor: 'var(--bg-2)',
        border: '1px solid var(--border)',
        boxShadow: isPro ? '0 0 0 1.5px rgba(246,166,35,0.3)' : undefined,
        transition: 'transform 150ms var(--ease-out)',
        opacity: isRealizat ? 0.62 : 1,
        filter: isRealizat ? 'grayscale(0.45)' : undefined,
      }}
      onMouseEnter={canHover ? (e) => {
        (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
      } : undefined}
      onMouseLeave={canHover ? (e) => {
        (e.currentTarget as HTMLElement).style.transform = '';
      } : undefined}
    >
      {/* Imagine cover */}
      {idea.images[0] ? (
        <div className="h-36 overflow-hidden">
          <img
            src={idea.images[0].url}
            alt={idea.title}
            className="idea-card-cover w-full h-full object-cover"
            style={{ transition: 'transform 200ms var(--ease-out)' }}
            loading="lazy"
          />
        </div>
      ) : (
        <div
          className="h-36 flex flex-col items-center justify-center gap-2"
          style={{ backgroundColor: 'var(--bg-3)' }}
        >
          {CategoryIcon && (
            <CategoryIcon size={28} style={{ color: 'var(--orange)', opacity: 0.7 }} />
          )}
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-2)' }}>
            {primaryLabel}
          </span>
        </div>
      )}

      <div className="flex flex-col flex-1 p-4 gap-3">
        {/* Header: categorii + plan badge */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 flex-wrap">
            {idea.categories.map((cat) => (
              <span
                key={cat}
                className="text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{ backgroundColor: 'rgba(246,166,35,0.12)', color: 'var(--orange)' }}
              >
                {cat}
              </span>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            {isPro && (
              <span
                className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{ backgroundColor: 'rgba(246,166,35,0.18)', color: 'var(--orange)' }}
              >
                <Crown size={10} /> Pro
              </span>
            )}
            {idea.status === 'REALIZAT' && (
              <span className="text-yellow-400" title="Idee realizată">
                <Trophy size={14} />
              </span>
            )}
            <span
              className="text-xs font-medium"
              style={{ color: STATUS_COLORS[idea.status] ?? 'var(--text-2)' }}
            >
              {idea.status === 'IN_COLABORARE' ? 'Colaborare' : idea.status.charAt(0) + idea.status.slice(1).toLowerCase()}
            </span>
          </div>
        </div>

        {/* Titlu */}
        <h3 className="font-bold text-sm leading-snug line-clamp-2" style={{ color: 'var(--text)' }}>
          {idea.title}
        </h3>

        {/* Problemă scurtă */}
        <p className="text-xs leading-relaxed line-clamp-2 flex-1" style={{ color: 'var(--text-2)' }}>
          {idea.problem}
        </p>

        {/* Footer: autor + stats */}
        <div className="flex items-center justify-between pt-2" style={{ borderTop: '1px solid var(--border)' }}>
          {/* Avatar autor */}
          <div className="flex items-center gap-2">
            {profile?.avatarUrl ? (
              <img src={profile.avatarUrl} alt={initials} className="w-6 h-6 rounded-full object-cover" loading="lazy" />
            ) : (
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
              >
                {initials}
              </div>
            )}
            <span className="text-xs font-medium truncate max-w-20" style={{ color: 'var(--text-2)' }}>
              {profile ? `${profile.firstName} ${profile.lastName[0]}.` : 'Anonim'}
            </span>
            {profile?.city && (
              <span className="hidden sm:flex items-center gap-0.5 text-xs" style={{ color: 'var(--text-2)' }}>
                <MapPin size={10} /> {profile.city}
              </span>
            )}
          </div>

          {/* Stats */}
          <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-2)' }}>
            <span className="flex items-center gap-1">
              <Eye size={12} /> {idea.viewCount}
            </span>
            <span className="flex items-center gap-1">
              <Star size={12} /> {idea._count.feedbackList}
            </span>
            <span className="flex items-center gap-1">
              <MessageSquare size={12} /> {idea._count.connectionRequests}
            </span>
          </div>
        </div>

        {/* Butoane acțiuni */}
        <div className="grid grid-cols-2 gap-2">
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
      </div>
    </article>
  );
}
