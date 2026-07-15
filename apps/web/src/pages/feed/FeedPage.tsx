import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Plus, Users, Lightbulb, Handshake, Gift, SlidersHorizontal, RefreshCw, Send, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api } from '../../lib/api';
import IdeaCard, { type IdeaCardData } from '../../components/feed/IdeaCard';
import AntreprenorCard, { type AntreprenorCardData } from '../../components/feed/AntreprenorCard';
import { getCategoryIcon } from '../../lib/categories';
import { useCategories } from '../../lib/useCategories';

type ApiError = { response?: { data?: { error?: string } } };

interface FeedPageProps {
  tab?: 'antreprenori';
}

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
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const activeTab = tab ?? (location.pathname === '/feed/antreprenori' ? 'antreprenori' : 'idei');

  const { categories: categoryList } = useCategories();

  const [category, setCategory] = useState('');
  const [stats, setStats] = useState<Stats | null>(null);

  // Modal cerere de contact
  const [contactTarget, setContactTarget] = useState<{ id: string; name: string } | null>(null);
  const [sendingContact, setSendingContact] = useState(false);
  const [contactResult, setContactResult] = useState<'sent' | 'error' | null>(null);
  const [contactError, setContactError] = useState<string>('');

  // Map userId → conversationId pentru conexiunile existente (construit client-side la mount)
  const [connectedUsers, setConnectedUsers] = useState<Map<string, string>>(new Map());

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

  // Construiește map-ul userId → conversationId din conversațiile existente (o singură dată, client-side)
  useEffect(() => {
    if (!user) return;
    api.get<{ conversations: Array<{ id: string; participantA: { id: string }; participantB: { id: string } }> }>('/chat/conversations')
      .then(({ data }) => {
        const map = new Map<string, string>();
        for (const conv of data.conversations) {
          const otherId = conv.participantA.id === user.id ? conv.participantB.id : conv.participantA.id;
          map.set(otherId, conv.id);
        }
        setConnectedUsers(map);
      })
      .catch(() => null);
  }, [user]);

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

  const handleContact = async (id: string, name: string, ideaId?: string) => {
    const existingConvId = connectedUsers.get(id);
    if (existingConvId) {
      if (ideaId) {
        try { await api.post(`/chat/conversations/${existingConvId}/open-idea`, { ideaId }); } catch { /* idempotent */ }
        navigate(`/chat/${existingConvId}?ideaId=${ideaId}`);
      } else {
        navigate(`/chat/${existingConvId}`);
      }
    } else {
      setContactTarget({ id, name });
    }
  };

  const handleSendContact = async () => {
    if (!contactTarget) return;
    setSendingContact(true);
    setContactResult(null);
    try {
      await api.post('/chat/request', { toUserId: contactTarget.id });
      setContactTarget(null);
      setContactResult(null);
      toast('Cerere trimisă cu succes!', 'success');
    } catch (err) {
      setContactError((err as ApiError).response?.data?.error ?? 'A apărut o eroare. Încearcă din nou.');
      setContactResult('error');
    } finally {
      setSendingContact(false);
    }
  };

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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div className="flex gap-1 p-1 rounded-xl" style={{ backgroundColor: 'var(--bg-3)' }}>
          {(['idei', 'antreprenori'] as const).map((t) => (
            <button
              key={t}
              onClick={() => navigate(t === 'idei' ? '/feed' : '/feed/antreprenori')}
              className="flex-1 sm:flex-none px-4 py-2 sm:py-1.5 rounded-lg text-sm font-medium cursor-pointer text-center"
              style={{
                backgroundColor: activeTab === t ? 'var(--orange)' : 'transparent',
                color: activeTab === t ? '#fff' : 'var(--text-2)',
                transition: 'background-color 150ms ease, color 150ms ease',
              }}
              onMouseEnter={(e) => { if (activeTab !== t) (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-4)'; }}
              onMouseLeave={(e) => { if (activeTab !== t) (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
            >
              <span className="sm:hidden">{t === 'idei' ? 'Idei' : 'Antreprenori'}</span>
              <span className="hidden sm:inline">Feed {t === 'idei' ? 'Idei' : 'Antreprenori'}</span>
            </button>
          ))}
        </div>

        {user?.role === 'ELEV' && (
          <button
            onClick={() => navigate('/idea/new')}
            className="flex items-center justify-center gap-2 px-4 py-2.5 sm:py-2 rounded-xl text-sm font-semibold cursor-pointer hover:opacity-90"
            style={{
              backgroundColor: 'var(--orange)',
              color: '#fff',
              transition: 'opacity 150ms ease',
            }}
          >
            <Plus size={16} />
            Postează idee
          </button>
        )}
      </div>

      {/* Filtre categorii — doar pe tab-ul idei */}
      {activeTab === 'idei' && (
        <div className="flex flex-wrap gap-2 mb-6">
          {[{ value: '', label: 'Toate' }, ...categoryList.map((c) => ({ value: c.name, label: c.name }))].map((c) => {
            const Icon = getCategoryIcon(c.label);
            const active = category === c.value;
            return (
              <button
                key={c.value}
                onClick={() => setCategory(c.value)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium cursor-pointer"
                style={{
                  backgroundColor: active ? 'var(--orange)' : 'var(--bg-3)',
                  color: active ? '#fff' : 'var(--text-2)',
                  border: '1px solid ' + (active ? 'var(--orange)' : 'var(--border)'),
                  transition: 'background-color 150ms ease, color 150ms ease',
                }}
                onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-4)'; }}
                onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-3)'; }}
              >
                {Icon && <Icon size={13} />}
                {c.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Grid conținut */}
      {activeTab === 'idei' ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {ideas.map((idea) => {
              const ideaOwnerName = idea.user.profileElev
                ? `${idea.user.profileElev.firstName} ${idea.user.profileElev.lastName}`
                : 'Utilizator';
              const isSelf = idea.user.id === user?.id;
              return (
              <IdeaCard
                key={idea.id}
                idea={idea}
                onClick={() => navigate(`/idea/${idea.id}`)}
                onViewProfile={() => navigate(`/profile/${idea.user.id}`)}
                isConnected={!isSelf && connectedUsers.has(idea.user.id)}
                onContact={isSelf ? undefined : () => void handleContact(idea.user.id, ideaOwnerName, idea.id)}
              />
              );
            })}
            {isLoading && Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton h-64 rounded-2xl" />
            ))}
          </div>
          {!ideiLoading && ideas.length === 0 && !ideiError && (
            <EmptyState
              message={category ? 'Nicio idee în această categorie.' : 'Nicio idee publicată încă. Fii primul!'}
              withFilter={!!category}
              onClearFilter={() => setCategory('')}
            />
          )}
          {ideiError && !ideiLoading && (
            <ErrorState onRetry={() => { setIdeiError(false); void loadIdeas(true); }} />
          )}
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {antreprenori.map((a) => {
              const antrName = a.profileAntreprenor
                ? `${a.profileAntreprenor.firstName} ${a.profileAntreprenor.lastName}`
                : 'Antreprenor';
              const isSelf = a.id === user?.id;
              return (
              <AntreprenorCard
                key={a.id}
                antreprenor={a}
                onClick={() => navigate(`/profile/${a.id}`)}
                onViewProfile={() => navigate(`/profile/${a.id}`)}
                isConnected={!isSelf && connectedUsers.has(a.id)}
                onContact={isSelf ? undefined : () => handleContact(a.id, antrName)}
              />
              );
            })}
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

      {/* Modal cerere de contact */}
      {contactTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-sm rounded-2xl p-6"
            style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}>

            <h3 className="text-base font-bold mb-1" style={{ color: 'var(--text)' }}>
              Trimite cerere de mesaj
            </h3>
            <p className="text-sm mb-4" style={{ color: 'var(--text-2)' }}>
              Trimite o cerere de conectare lui{' '}
              <strong style={{ color: 'var(--text)' }}>{contactTarget.name}</strong>.
              Dacă acceptă, veți putea comunica prin chat.
            </p>

            {contactResult === 'error' && (
              <div className="mb-4 px-3 py-2.5 rounded-xl text-sm"
                style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}>
                {contactError}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { setContactTarget(null); setContactResult(null); }}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium cursor-pointer"
                style={{ backgroundColor: 'var(--bg-3)', color: 'var(--text-2)' }}>
                Anulează
              </button>
              <button
                onClick={() => void handleSendContact()}
                disabled={sendingContact}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold cursor-pointer disabled:opacity-40 flex items-center justify-center gap-2"
                style={{ backgroundColor: 'var(--orange)', color: '#fff' }}>
                {sendingContact ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Trimite cererea
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState({ message, withFilter, onClearFilter }: { message: string; withFilter?: boolean; onClearFilter?: () => void }) {
  return (
    <div className="flex flex-col items-center py-20 gap-4">
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
        style={{ backgroundColor: 'var(--bg-3)' }}>
        <SlidersHorizontal size={24} style={{ color: 'var(--text-2)' }} />
      </div>
      <div className="text-center">
        <p className="text-base font-semibold mb-1" style={{ color: 'var(--text)' }}>{message}</p>
        {withFilter && (
          <p className="text-sm" style={{ color: 'var(--text-2)' }}>Încearcă un alt filtru sau șterge selecția curentă.</p>
        )}
      </div>
      {withFilter && onClearFilter && (
        <button
          onClick={onClearFilter}
          className="px-4 py-2 rounded-xl text-sm font-medium cursor-pointer"
          style={{ backgroundColor: 'var(--bg-3)', color: 'var(--text)', border: '1px solid var(--border)' }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-4)')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-3)')}
        >
          Șterge filtrul
        </button>
      )}
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center py-20 gap-4">
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
        style={{ backgroundColor: 'rgba(239,68,68,0.08)' }}>
        <RefreshCw size={24} style={{ color: '#ef4444' }} />
      </div>
      <div className="text-center">
        <p className="text-base font-semibold mb-1" style={{ color: 'var(--text)' }}>Nu s-au putut încărca datele</p>
        <p className="text-sm" style={{ color: 'var(--text-2)' }}>Verifică conexiunea și încearcă din nou.</p>
      </div>
      <button
        onClick={onRetry}
        className="px-4 py-2 rounded-xl text-sm font-medium cursor-pointer"
        style={{ backgroundColor: 'var(--bg-3)', color: 'var(--text)', border: '1px solid var(--border)' }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-4)')}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-3)')}
      >
        Încearcă din nou
      </button>
    </div>
  );
}
