import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Plus, Users, Lightbulb, Handshake, Gift } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import IdeaCard, { type IdeaCardData } from '../../components/feed/IdeaCard';
import AntreprenorCard, { type AntreprenorCardData } from '../../components/feed/AntreprenorCard';

interface FeedPageProps {
  tab?: 'antreprenori';
}

const CATEGORIES = [
  { value: '', label: 'Toate' },
  { value: 'ECO', label: 'Eco' },
  { value: 'TECH', label: 'Tech' },
  { value: 'ARTA', label: 'Artă' },
  { value: 'EDUCATIE', label: 'Educație' },
  { value: 'SANATATE', label: 'Sănătate' },
  { value: 'SOCIAL', label: 'Social' },
  { value: 'FOOD', label: 'Food' },
  { value: 'FINANTE', label: 'Finanțe' },
];

interface Stats {
  ideas: number;
  users: number;
  collabs: number;
  giveaways: number;
}

interface FeedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasNextPage: boolean;
}

function formatNum(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

export default function FeedPage({ tab }: FeedPageProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const activeTab = tab ?? (location.pathname === '/feed/antreprenori' ? 'antreprenori' : 'idei');

  const [category, setCategory] = useState('');
  const [stats, setStats] = useState<Stats | null>(null);

  // Feed Idei state
  const [ideas, setIdeas] = useState<IdeaCardData[]>([]);
  const [ideiCursor, setIdeiCursor] = useState<string | null>(null);
  const [ideiHasNext, setIdeiHasNext] = useState(false);
  const [ideiLoading, setIdeiLoading] = useState(false);
  const [ideiError, setIdeiError] = useState(false);

  // Feed Antreprenori state
  const [antreprenori, setAntreprenori] = useState<AntreprenorCardData[]>([]);
  const [antrCursor, setAntrCursor] = useState<string | null>(null);
  const [antrHasNext, setAntrHasNext] = useState(false);
  const [antrLoading, setAntrLoading] = useState(false);
  const [antrError, setAntrError] = useState(false);

  const loadingRef = useRef(false);

  // Statistici
  useEffect(() => {
    api.get<Stats>('/feed/stats').then(({ data }) => setStats(data)).catch(() => null);
  }, []);

  // Loader idei
  const loadIdeas = useCallback(async (reset = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setIdeiLoading(true);
    try {
      const cursor = reset ? undefined : ideiCursor ?? undefined;
      const params: Record<string, string> = {};
      if (category) params['category'] = category;
      if (cursor) params['cursor'] = cursor;

      const { data } = await api.get<FeedResult<IdeaCardData>>('/feed/ideas', { params });
      setIdeiError(false);
      setIdeas((prev) => reset ? data.items : [...prev, ...data.items]);
      setIdeiCursor(data.nextCursor);
      setIdeiHasNext(data.hasNextPage);
    } catch {
      setIdeiError(true);
    } finally {
      setIdeiLoading(false);
      loadingRef.current = false;
    }
  }, [category, ideiCursor]);

  // Loader antreprenori
  const loadAntreprenori = useCallback(async (reset = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setAntrLoading(true);
    try {
      const cursor = reset ? undefined : antrCursor ?? undefined;
      const params: Record<string, string> = {};
      if (cursor) params['cursor'] = cursor;

      const { data } = await api.get<FeedResult<AntreprenorCardData>>('/feed/antreprenori', { params });
      setAntrError(false);
      setAntreprenori((prev) => reset ? data.items : [...prev, ...data.items]);
      setAntrCursor(data.nextCursor);
      setAntrHasNext(data.hasNextPage);
    } catch {
      setAntrError(true);
    } finally {
      setAntrLoading(false);
      loadingRef.current = false;
    }
  }, [antrCursor]);

  // Reset + reload când se schimbă tab-ul sau categoria
  // Nu ștergem lista imediat — loadXxx(true) o va înlocui când datele sosesc
  useEffect(() => {
    loadingRef.current = false;
    if (activeTab === 'idei') {
      setIdeiCursor(null);
      setIdeiError(false);
      void loadIdeas(true);
    } else {
      setAntrCursor(null);
      setAntrError(false);
      void loadAntreprenori(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, category]);

  // Infinite scroll cu Intersection Observer
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        if (activeTab === 'idei' && ideiHasNext && !ideiLoading) void loadIdeas();
        if (activeTab === 'antreprenori' && antrHasNext && !antrLoading) void loadAntreprenori();
      },
      { threshold: 0.1 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [activeTab, ideiHasNext, antrHasNext, ideiLoading, antrLoading, loadIdeas, loadAntreprenori]);

  const statsCards = [
    { label: 'Idei publicate', value: stats ? formatNum(stats.ideas) : '—', icon: <Lightbulb size={20} /> },
    { label: 'Utilizatori', value: stats ? formatNum(stats.users) : '—', icon: <Users size={20} /> },
    { label: 'Colaborări', value: stats ? formatNum(stats.collabs) : '—', icon: <Handshake size={20} /> },
    { label: 'Giveaway-uri active', value: stats ? formatNum(stats.giveaways) : '—', icon: <Gift size={20} /> },
  ];

  const isLoading = activeTab === 'idei' ? ideiLoading : antrLoading;

  return (
    <div>
      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {statsCards.map((s) => (
          <div
            key={s.label}
            className="flex items-center gap-3 p-4 rounded-2xl"
            style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}
          >
            <div className="p-2 rounded-xl" style={{ backgroundColor: 'rgba(246,166,35,0.12)', color: 'var(--orange)' }}>
              {s.icon}
            </div>
            <div>
              <p className="text-xl font-bold" style={{ color: 'var(--text)' }}>{s.value}</p>
              <p className="text-xs" style={{ color: 'var(--text-2)' }}>{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs + buton postare */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex gap-1 p-1 rounded-xl" style={{ backgroundColor: 'var(--bg-3)' }}>
          {(['idei', 'antreprenori'] as const).map((t) => (
            <button
              key={t}
              onClick={() => navigate(t === 'idei' ? '/feed' : '/feed/antreprenori')}
              className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all capitalize"
              style={{
                backgroundColor: activeTab === t ? 'var(--orange)' : 'transparent',
                color: activeTab === t ? '#fff' : 'var(--text-2)',
              }}
            >
              Feed {t === 'idei' ? 'Idei' : 'Antreprenori'}
            </button>
          ))}
        </div>

        {user?.role === 'ELEV' && (
          <button
            onClick={() => navigate('/idea/new')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
          >
            <Plus size={16} />
            Postează idee
          </button>
        )}
      </div>

      {/* Filtre categorii — doar pe tab-ul idei */}
      {activeTab === 'idei' && (
        <div className="flex flex-wrap gap-2 mb-6">
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              onClick={() => setCategory(c.value)}
              className="px-3 py-1.5 rounded-full text-sm font-medium transition-all"
              style={{
                backgroundColor: category === c.value ? 'var(--orange)' : 'var(--bg-3)',
                color: category === c.value ? '#fff' : 'var(--text-2)',
                border: '1px solid ' + (category === c.value ? 'var(--orange)' : 'var(--border)'),
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      {/* Grid conținut */}
      {activeTab === 'idei' ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {ideas.map((idea) => (
              <IdeaCard
                key={idea.id}
                idea={idea}
                onClick={() => navigate(`/idea/${idea.id}`)}
              />
            ))}
            {isLoading && Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton h-64 rounded-2xl" />
            ))}
          </div>
          {!ideiLoading && ideas.length === 0 && !ideiError && (
            <EmptyState
              message={category ? 'Nicio idee în această categorie.' : 'Nicio idee publicată încă. Fii primul!'}
            />
          )}
          {ideiError && !ideiLoading && (
            <ErrorState onRetry={() => { setIdeiError(false); void loadIdeas(true); }} />
          )}
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {antreprenori.map((a) => (
              <AntreprenorCard
                key={a.id}
                antreprenor={a}
                onClick={() => navigate(`/profile/antreprenor/${a.id}`)}
              />
            ))}
            {isLoading && Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton h-44 rounded-2xl" />
            ))}
          </div>
          {!antrLoading && antreprenori.length === 0 && !antrError && (
            <EmptyState message="Niciun antreprenor înregistrat încă." />
          )}
          {antrError && !antrLoading && (
            <ErrorState onRetry={() => { setAntrError(false); void loadAntreprenori(true); }} />
          )}
        </>
      )}

      {/* Sentinel pentru infinite scroll */}
      <div ref={sentinelRef} className="h-8" />
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-16">
      <p className="text-base font-medium" style={{ color: 'var(--text-2)' }}>{message}</p>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="text-center py-16">
      <p className="text-base font-medium mb-3" style={{ color: 'var(--text-2)' }}>
        Nu s-au putut încărca datele. Verifică conexiunea.
      </p>
      <button
        onClick={onRetry}
        className="px-4 py-2 rounded-xl text-sm font-medium"
        style={{ backgroundColor: 'var(--bg-3)', color: 'var(--text-2)', border: '1px solid var(--border)' }}
      >
        Încearcă din nou
      </button>
    </div>
  );
}
