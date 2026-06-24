import { Eye, MessageSquare, Star, MapPin, Crown, Trophy } from 'lucide-react';

const CATEGORY_LABELS: Record<string, string> = {
  ECO: 'Eco', TECH: 'Tech', ARTA: 'Artă', EDUCATIE: 'Educație',
  SANATATE: 'Sănătate', SOCIAL: 'Social', FOOD: 'Food', FINANTE: 'Finanțe',
};

const STATUS_COLORS: Record<string, string> = {
  PUBLICAT: '#8892a4',
  CONTACTAT: '#f6a623',
  IN_COLABORARE: '#22c55e',
  REALIZAT: '#a855f7',
};

export interface IdeaCardData {
  id: string;
  title: string;
  category: string;
  problem: string;
  viewCount: number;
  status: string;
  planAtPost: string;
  createdAt: string;
  tags: string[];
  user: {
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
}

export default function IdeaCard({ idea, onClick }: Props) {
  const profile = idea.user.profileElev;
  const initials = profile
    ? `${profile.firstName[0] ?? ''}${profile.lastName[0] ?? ''}`.toUpperCase()
    : '?';
  const isPro = idea.planAtPost === 'PRO';

  return (
    <article
      onClick={onClick}
      className="flex flex-col rounded-2xl overflow-hidden cursor-pointer group transition-transform hover:-translate-y-0.5"
      style={{
        backgroundColor: 'var(--bg-2)',
        border: '1px solid var(--border)',
        boxShadow: isPro ? '0 0 0 1.5px rgba(246,166,35,0.3)' : undefined,
      }}
    >
      {/* Imagine cover */}
      {idea.images[0] ? (
        <div className="h-36 overflow-hidden">
          <img
            src={idea.images[0].url}
            alt={idea.title}
            className="w-full h-full object-cover transition-transform group-hover:scale-105"
            loading="lazy"
          />
        </div>
      ) : (
        <div
          className="h-36 flex items-center justify-center text-3xl font-bold"
          style={{ backgroundColor: 'var(--bg-3)', color: 'var(--border)' }}
        >
          {CATEGORY_LABELS[idea.category] ?? idea.category}
        </div>
      )}

      <div className="flex flex-col flex-1 p-4 gap-3">
        {/* Header: categorie + plan badge */}
        <div className="flex items-center justify-between gap-2">
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded-full"
            style={{ backgroundColor: 'rgba(246,166,35,0.12)', color: 'var(--orange)' }}
          >
            {CATEGORY_LABELS[idea.category] ?? idea.category}
          </span>

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
            <span className="text-xs font-medium truncate max-w-[80px]" style={{ color: 'var(--text-2)' }}>
              {profile ? `${profile.firstName} ${profile.lastName[0]}.` : 'Anonim'}
            </span>
            {profile?.city && (
              <span className="flex items-center gap-0.5 text-xs hidden sm:flex" style={{ color: 'var(--text-2)' }}>
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
      </div>
    </article>
  );
}
