import { useState, useEffect, useRef, useCallback } from 'react';
import DOMPurify from 'dompurify';
import { createPortal } from 'react-dom';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Eye, Star, MessageSquare, Crown, Trophy,
  FileText, Pencil, Trash2, Lock, Globe, Loader2,
  ChevronLeft, ChevronRight, X, Lightbulb, Zap, Users,
  Download,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import ConfirmModal from '../../components/ui/ConfirmModal';

const STATUS_LABELS: Record<string, string> = {
  PUBLICAT: 'Publicat', CONTACTAT: 'Contactat',
  IN_COLABORARE: 'În Colaborare', REALIZAT: 'Realizat',
};

const STATUS_COLORS: Record<string, string> = {
  PUBLICAT: '#8892a4', CONTACTAT: '#f6a623', IN_COLABORARE: '#22c55e', REALIZAT: '#a855f7',
};


interface IdeaDetail {
  id: string; title: string; categories: string[]; problem: string; solution: string;
  targetAudience: string | null; tags: string[]; visibility: string; status: string;
  planAtPost: string; viewCount: number; wordCount: number; createdAt: string; updatedAt: string;
  userId: string;
  user: {
    id: string; plan: string;
    profileElev: {
      firstName: string; lastName: string; avatarUrl: string | null; city: string | null;
      school: string | null; class: string | null;
    } | null;
  };
  images: { id: string; url: string; order: number }[];
  pdfs: { id: string; url: string; filename: string; size: number }[];
  _count: { feedbackList: number; connectionRequests: number };
  feedbackList: {
    id: string; antreprenorId: string; ratingGeneral: number; comment: string | null;
    interestedInCollab: boolean; createdAt: string;
    antreprenor: {
      id: string;
      profileAntreprenor: { firstName: string; lastName: string; company: string | null; avatarUrl: string | null } | null;
    } | null;
  }[];
  connectionRequest: { id: string; status: string; createdAt: string } | null;
}

function formatBytes(bytes: number) {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return 'acum câteva secunde';
  if (diff < 3600) return `acum ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `acum ${Math.floor(diff / 3600)} ore`;
  const days = Math.floor(diff / 86400);
  if (days < 30) return `acum ${days} ${days === 1 ? 'zi' : 'zile'}`;
  return new Date(dateStr).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', year: 'numeric' });
}

function ImageLightbox({
  images, startIdx, title, onClose,
}: {
  images: { id: string; url: string }[];
  startIdx: number;
  title: string;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(startIdx);

  const goTo = useCallback((i: number) => {
    setIdx(Math.max(0, Math.min(i, images.length - 1)));
  }, [images.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') goTo(idx - 1);
      if (e.key === 'ArrowRight') goTo(idx + 1);
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [idx, goTo, onClose]);

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 1000, backgroundColor: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Imagine ${idx + 1} din ${images.length}: ${title}`}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-full transition-colors"
        style={{ backgroundColor: 'rgba(255,255,255,0.12)', color: '#fff' }}
        aria-label="Închide"
      >
        <X size={20} />
      </button>

      {images.length > 1 && (
        <span
          className="absolute top-4 left-1/2 -translate-x-1/2 text-xs font-semibold px-3 py-1 rounded-full"
          style={{ backgroundColor: 'rgba(255,255,255,0.12)', color: '#fff' }}
        >
          {idx + 1} / {images.length}
        </span>
      )}

      <img
        src={images[idx].url}
        alt={`${title} — imaginea ${idx + 1}`}
        onClick={(e) => e.stopPropagation()}
        className="rounded-xl select-none"
        style={{
          maxWidth: 'min(92vw, 1200px)',
          maxHeight: '88vh',
          objectFit: 'contain',
          boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
        }}
        draggable={false}
      />

      {images.length > 1 && (
        <div
          className="absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          {images.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className="rounded-full"
              style={{
                width: i === idx ? 22 : 7,
                height: 7,
                backgroundColor: i === idx ? 'var(--orange)' : 'rgba(255,255,255,0.4)',
                transition: 'width 200ms var(--ease-out), background-color 200ms ease-out',
              }}
              aria-label={`Imaginea ${i + 1}`}
            />
          ))}
        </div>
      )}

      {images.length > 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); goTo(idx - 1); }}
            disabled={idx === 0}
            className="absolute left-4 top-1/2 -translate-y-1/2 p-2.5 rounded-full disabled:opacity-20"
            style={{
              backgroundColor: 'rgba(255,255,255,0.12)',
              color: '#fff',
              transition: 'background-color 150ms ease-out, opacity 150ms ease-out',
            }}
            aria-label="Imaginea anterioară"
          >
            <ChevronLeft size={24} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); goTo(idx + 1); }}
            disabled={idx === images.length - 1}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-2.5 rounded-full disabled:opacity-20"
            style={{
              backgroundColor: 'rgba(255,255,255,0.12)',
              color: '#fff',
              transition: 'background-color 150ms ease-out, opacity 150ms ease-out',
            }}
            aria-label="Imaginea următoare"
          >
            <ChevronRight size={24} />
          </button>
        </>
      )}
    </div>,
    document.body,
  );
}

function ImageSwiper({ images, title }: { images: { id: string; url: string }[]; title: string }) {
  const [idx, setIdx] = useState(0);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const goTo = useCallback((i: number) => {
    const next = Math.max(0, Math.min(i, images.length - 1));
    setIdx(next);
    trackRef.current?.children[next]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [images.length]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const onScroll = () => {
      const w = track.clientWidth;
      if (w) setIdx(Math.round(track.scrollLeft / w));
    };
    track.addEventListener('scroll', onScroll, { passive: true });
    return () => track.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <>
      {lightboxIdx !== null && (
        <ImageLightbox
          images={images}
          startIdx={lightboxIdx}
          title={title}
          onClose={() => setLightboxIdx(null)}
        />
      )}

      <div className="relative select-none">
        <div
          ref={trackRef}
          className="flex overflow-x-auto"
          style={{
            scrollSnapType: 'x mandatory',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {images.map((img, i) => (
            <div
              key={img.id}
              className="shrink-0 w-full"
              style={{ scrollSnapAlign: 'start' }}
            >
              <img
                src={img.url}
                alt={title}
                className="w-full object-cover transition-opacity hover:opacity-90"
                style={{ height: 320, objectFit: 'cover', cursor: 'zoom-in' }}
                loading="lazy"
                onClick={() => setLightboxIdx(i)}
              />
            </div>
          ))}
        </div>

        {images.length > 1 && (
          <>
            <button
              onClick={() => goTo(idx - 1)}
              disabled={idx === 0}
              className="absolute left-3 top-1/2 -translate-y-1/2 p-1.5 rounded-full"
              style={{
                backgroundColor: 'rgba(0,0,0,0.45)',
                color: '#fff',
                opacity: idx === 0 ? 0.3 : 1,
                backdropFilter: 'blur(4px)',
                transition: 'background-color 150ms ease-out, opacity 150ms ease-out',
              }}
              aria-label="Imaginea anterioară"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              onClick={() => goTo(idx + 1)}
              disabled={idx === images.length - 1}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-full"
              style={{
                backgroundColor: 'rgba(0,0,0,0.45)',
                color: '#fff',
                opacity: idx === images.length - 1 ? 0.3 : 1,
                backdropFilter: 'blur(4px)',
                transition: 'background-color 150ms ease-out, opacity 150ms ease-out',
              }}
              aria-label="Imaginea următoare"
            >
              <ChevronRight size={20} />
            </button>

            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
              {images.map((_, i) => (
                <button
                  key={i}
                  onClick={() => goTo(i)}
                  className="rounded-full"
                  style={{
                    width: i === idx ? 20 : 6,
                    height: 6,
                    backgroundColor: i === idx ? 'var(--orange)' : 'rgba(255,255,255,0.5)',
                    transition: 'width 200ms var(--ease-out), background-color 200ms ease-out',
                  }}
                  aria-label={`Imaginea ${i + 1}`}
                />
              ))}
            </div>

            <span
              className="absolute top-3 right-3 text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: 'rgba(0,0,0,0.45)', color: '#fff', backdropFilter: 'blur(4px)' }}
            >
              {idx + 1} / {images.length}
            </span>
          </>
        )}

        <span
          className="absolute bottom-3 right-3 text-xs px-2 py-0.5 rounded-full pointer-events-none"
          style={{ backgroundColor: 'rgba(0,0,0,0.45)', color: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(4px)' }}
        >
          Click pentru mărire
        </span>
      </div>
    </>
  );
}

const ALLOWED_TAGS = ['p', 'strong', 'em', 'ul', 'li', 'br'];

function ContentCard({ icon, title, content }: { icon: React.ReactNode; title: string; content: string }) {
  const clean = DOMPurify.sanitize(content, { ALLOWED_TAGS, ALLOWED_ATTR: [] });
  return (
    <div className="rounded-2xl p-5" style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2 mb-3">
        <span style={{ color: 'var(--orange)' }}>{icon}</span>
        <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>{title}</h2>
      </div>
      <div className="rich-content" dangerouslySetInnerHTML={{ __html: clean }} />
    </div>
  );
}

function StatRow({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span style={{ color: 'var(--text-2)' }}>{icon}</span>
      <span className="font-semibold text-sm" style={{ color: 'var(--text)' }}>{value}</span>
      <span className="text-xs" style={{ color: 'var(--text-2)' }}>{label}</span>
    </div>
  );
}


export default function IdeaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [idea, setIdea] = useState<IdeaDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [connectLoading, setConnectLoading] = useState(false);
  const [connectSent, setConnectSent] = useState(false);
  const [connectError, setConnectError] = useState('');
  const [existingConvId, setExistingConvId] = useState<string | null>(null);
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackHover, setFeedbackHover] = useState(0);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [feedbackInterested, setFeedbackInterested] = useState(false);
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackSuccess, setFeedbackSuccess] = useState(false);

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    setLoading(true);
    api
      .get<IdeaDetail>(`/ideas/${id}`, { signal: controller.signal })
      .then(({ data }) => setIdea(data))
      .catch((err: { code?: string; response?: { data?: { error?: string } } }) => {
        if (controller.signal.aborted) return;
        setError(err.response?.data?.error ?? 'Ideea nu a putut fi încărcată.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [id]);

  const isOwner = user?.id === idea?.userId;
  const isAntreprenor = user?.role === 'ANTREPRENOR';
  const allFeedback = idea?.feedbackList ?? [];
  const myFeedback = allFeedback.find((f) => f.antreprenorId === user?.id);
  const hasConnectionRequest = !!idea?.connectionRequest;

  useEffect(() => {
    if (!idea?.userId || !isAntreprenor || isOwner) return;
    api.get<{ conversationId: string | null }>(`/chat/with/${idea.userId}`)
      .then(({ data }) => setExistingConvId(data.conversationId ?? null))
      .catch(() => {});
  }, [idea?.userId, isAntreprenor, isOwner]);
  const isRealizat = idea?.status === 'REALIZAT';

  // Preumple formularul cu feedback-ul existent
  useEffect(() => {
    if (myFeedback) {
      setFeedbackRating(myFeedback.ratingGeneral);
      setFeedbackComment(myFeedback.comment ?? '');
      setFeedbackInterested(myFeedback.interestedInCollab);
    }
  }, [myFeedback]);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/ideas/${idea!.id}`);
      // Anunță Sidebar-ul să reevalueze limita de idei (deblocare buton la Gratuit)
      window.dispatchEvent(new Event('ideas:changed'));
      navigate('/feed');
    } catch (err: unknown) {
      // Afișăm motivul (ex. 409 — idee angajată în conectare/giveaway/colaborare)
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Ideea nu a putut fi ștearsă.';
      toast(msg, 'error');
      setDeleteModalOpen(false);
      setDeleting(false);
    }
  };

  const handleConnect = async () => {
    setConnectLoading(true);
    setConnectError('');
    try {
      await api.post('/chat/connect', { toUserId: idea!.userId, ideaId: idea!.id });
      setConnectSent(true);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Eroare la trimiterea cererii.';
      setConnectError(msg);
    } finally {
      setConnectLoading(false);
    }
  };

  const handleOpenChat = async () => {
    const convId = existingConvId;
    if (!convId || !idea) return;
    try { await api.post(`/chat/conversations/${convId}/open-idea`, { ideaId: idea.id }); } catch { /* idempotent */ }
    navigate(`/chat/${convId}?ideaId=${idea.id}`);
  };

  const handleFeedbackSubmit = async () => {
    if (feedbackRating === 0 || feedbackSubmitting) return;
    setFeedbackSubmitting(true);
    try {
      const { data } = await api.post<{ feedback: { id: string; ratingGeneral: number; comment: string | null; interestedInCollab: boolean; createdAt: string } }>(
        `/ideas/${idea!.id}/feedback`,
        { ratingGeneral: feedbackRating, comment: feedbackComment || undefined, interestedInCollab: feedbackInterested },
      );
      setIdea((prev) => {
        if (!prev) return prev;
        const mine = {
          ...data.feedback,
          comment: data.feedback.comment ?? null,
          antreprenorId: user!.id,
          antreprenor: {
            id: user!.id,
            profileAntreprenor: {
              firstName: user!.firstName ?? '',
              lastName: user!.lastName ?? '',
              company: null,
              avatarUrl: user!.avatarUrl ?? null,
            },
          },
        };
        const existing = prev.feedbackList.some((f) => f.antreprenorId === user!.id);
        const feedbackList = existing
          ? prev.feedbackList.map((f) => (f.antreprenorId === user!.id ? { ...f, ...mine } : f))
          : [mine, ...prev.feedbackList];
        return {
          ...prev,
          feedbackList,
          _count: { ...prev._count, feedbackList: existing ? prev._count.feedbackList : prev._count.feedbackList + 1 },
        };
      });
      setFeedbackSuccess(true);
      setTimeout(() => setFeedbackSuccess(false), 3000);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Eroare la trimitere.';
      setConnectError(msg);
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="w-full">
        <div className="skeleton h-4 w-48 rounded mb-5" />
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
          <div className="space-y-4">
            <div className="skeleton h-64 rounded-2xl" />
            <div className="skeleton h-36 rounded-2xl" />
            <div className="skeleton h-36 rounded-2xl" />
            <div className="skeleton h-24 rounded-2xl" />
          </div>
          <div className="space-y-4">
            <div className="skeleton h-44 rounded-2xl" />
            <div className="skeleton h-36 rounded-2xl" />
            <div className="skeleton h-28 rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !idea) {
    return (
      <div className="max-w-3xl mx-auto text-center py-20">
        <p className="text-base font-medium mb-4" style={{ color: '#ef4444' }}>{error || 'Ideea nu a fost găsită.'}</p>
        <Link to="/feed" className="text-sm font-medium" style={{ color: 'var(--orange)' }}>← Înapoi la feed</Link>
      </div>
    );
  }

  const profile = idea.user.profileElev;
  const initials = profile ? `${profile.firstName[0] ?? ''}${profile.lastName[0] ?? ''}`.toUpperCase() : '?';

  return (
    <div className="w-full">
      <ConfirmModal
        open={deleteModalOpen}
        title="Șterge ideea"
        description="Această acțiune este ireversibilă. Ideea va fi ștearsă definitiv împreună cu toate imaginile și documentele atașate."
        danger
        confirmLabel="Șterge"
        loading={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteModalOpen(false)}
      />

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm mb-5 min-w-0">
        <Link to="/feed" className="shrink-0 hover:underline" style={{ color: 'var(--text-2)' }}>
          Feed
        </Link>
        <ChevronRight size={14} className="shrink-0" style={{ color: 'var(--text-2)' }} />
        <span className="truncate font-medium" style={{ color: 'var(--text)' }}>{idea.title}</span>
      </nav>

      {/* Grid 2 coloane */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">

        {/* ── COLOANA STÂNGA ── */}
        <div className="space-y-4 min-w-0">

          {/* Swiper + info header */}
          <div
            className="rounded-2xl overflow-hidden"
            style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}
          >
            {idea.images.length > 0 && (
              <ImageSwiper images={idea.images} title={idea.title} />
            )}

            <div className="p-5">
              {/* Badges */}
              <div className="flex flex-wrap items-center gap-2 mb-3">
                {idea.planAtPost === 'PRO' && (
                  <span
                    className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full"
                    style={{ backgroundColor: 'rgba(246,166,35,0.18)', color: 'var(--orange)' }}
                  >
                    <Crown size={10} /> Pro
                  </span>
                )}
                <span
                  className="text-xs font-medium px-2.5 py-1 rounded-full"
                  style={{ backgroundColor: 'var(--bg-3)', color: STATUS_COLORS[idea.status] ?? 'var(--text-2)' }}
                >
                  {STATUS_LABELS[idea.status] ?? idea.status}
                  {idea.status === 'REALIZAT' && <Trophy size={11} className="inline ml-1" />}
                </span>
                {idea.categories.map((cat) => (
                  <span
                    key={cat}
                    className="text-xs font-semibold px-2.5 py-1 rounded-full"
                    style={{ backgroundColor: 'rgba(246,166,35,0.12)', color: 'var(--orange)' }}
                  >
                    {cat}
                  </span>
                ))}
                {isOwner && (
                  <span
                    className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full ml-auto"
                    style={{ backgroundColor: 'var(--bg-3)', color: 'var(--text-2)' }}
                  >
                    {idea.visibility === 'PUBLIC' ? <Globe size={11} /> : <Lock size={11} />}
                    {idea.visibility === 'PUBLIC' ? 'Publică' : 'Privată'}
                  </span>
                )}
              </div>

              {/* Titlu */}
              <h1 className="text-2xl font-extrabold mb-4" style={{ color: 'var(--text)' }}>
                {idea.title}
              </h1>

              {/* Rând autor */}
              <div
                className="flex items-center gap-3 pb-4"
                style={{ borderBottom: '1px solid var(--border)' }}
              >
                {profile?.avatarUrl ? (
                  <img
                    src={profile.avatarUrl}
                    alt={initials}
                    className="w-9 h-9 rounded-xl object-cover shrink-0"
                    loading="lazy"
                  />
                ) : (
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shrink-0"
                    style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
                  >
                    {initials}
                  </div>
                )}
                <span className="text-sm font-semibold truncate flex-1" style={{ color: 'var(--text)' }}>
                  {profile ? `${profile.firstName} ${profile.lastName}` : 'Utilizator necunoscut'}
                </span>
                <div className="flex items-center gap-3 shrink-0 text-xs" style={{ color: 'var(--text-2)' }}>
                  <span>{formatDate(idea.createdAt)}</span>
                  <span className="flex items-center gap-1">
                    <Eye size={13} /> {idea.viewCount}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Problema */}
          <ContentCard
            icon={<Lightbulb size={16} />}
            title="Problema"
            content={idea.problem}
          />

          {/* Soluție */}
          <ContentCard
            icon={<Zap size={16} />}
            title="Soluția propusă"
            content={idea.solution}
          />

          {/* Audiență (opțional) */}
          {idea.targetAudience && (
            <ContentCard
              icon={<Users size={16} />}
              title="Audiență țintă"
              content={idea.targetAudience}
            />
          )}

          {/* Tag-uri */}
          {idea.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {idea.tags.map((t) => (
                <span
                  key={t}
                  className="px-2.5 py-1 rounded-full text-xs font-medium"
                  style={{ backgroundColor: 'var(--bg-3)', color: 'var(--text-2)' }}
                >
                  #{t}
                </span>
              ))}
            </div>
          )}

          {/* PDF-uri */}
          {idea.pdfs.length > 0 && (
            <div
              className="rounded-2xl p-5"
              style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}
            >
              <h2 className="text-base font-bold mb-4" style={{ color: 'var(--text)' }}>
                Documente atașate
              </h2>
              <div className="space-y-3">
                {idea.pdfs.map((pdf) => (
                  <div
                    key={pdf.id}
                    className="flex items-center gap-3 p-3 rounded-xl"
                    style={{ backgroundColor: 'var(--bg-3)' }}
                  >
                    <div
                      className="w-12 h-12 flex items-center justify-center shrink-0"
                      style={{ backgroundColor: 'rgba(246,166,35,0.15)', borderRadius: 14 }}
                    >
                      <FileText size={20} style={{ color: 'var(--orange)' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>
                        {pdf.filename}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-2)' }}>
                        {formatBytes(pdf.size)}
                      </p>
                    </div>
                    <a
                      href={pdf.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium shrink-0 hover:opacity-80 transition-opacity"
                      style={{
                        backgroundColor: 'var(--bg-4)',
                        color: 'var(--text)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <Download size={13} /> Descarcă
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Feedback primit — vizibil oricui vede ideea (proprietar, mentori, elevi) */}
          {allFeedback.length > 0 && (
            <div
              className="rounded-2xl p-5"
              style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}
            >
              <h2 className="text-base font-bold mb-4 flex items-center gap-2" style={{ color: 'var(--text)' }}>
                <Star size={16} style={{ color: 'var(--orange)' }} />
                Feedback de la antreprenori
                <span className="text-sm font-normal" style={{ color: 'var(--text-2)' }}>({allFeedback.length})</span>
              </h2>
              <div className="space-y-3">
                {allFeedback.map((fb) => {
                  const prof = fb.antreprenor?.profileAntreprenor;
                  const fbName = prof ? `${prof.firstName} ${prof.lastName}`.trim() : 'Antreprenor';
                  const fbInitials = prof ? `${prof.firstName[0] ?? ''}${prof.lastName[0] ?? ''}`.toUpperCase() : 'A';
                  const isMine = fb.antreprenorId === user?.id;
                  return (
                    <div key={fb.id} className="p-4 rounded-xl" style={{ backgroundColor: 'var(--bg-4)' }}>
                      <div className="flex items-center gap-3 mb-1.5">
                        <div
                          className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center shrink-0 text-sm font-bold"
                          style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
                        >
                          {prof?.avatarUrl
                            ? <img src={prof.avatarUrl} alt={fbName} className="w-full h-full object-cover" />
                            : fbInitials}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
                            {fbName}
                            {isMine && <span className="font-normal" style={{ color: 'var(--text-2)' }}> (tu)</span>}
                          </p>
                          {prof?.company && (
                            <p className="text-xs truncate" style={{ color: 'var(--text-2)' }}>{prof.company}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              size={13}
                              fill={i < fb.ratingGeneral ? 'var(--orange)' : 'transparent'}
                              style={{ color: 'var(--orange)' }}
                            />
                          ))}
                          <span className="text-sm font-semibold ml-1" style={{ color: 'var(--text)' }}>
                            {fb.ratingGeneral}/5
                          </span>
                        </div>
                      </div>
                      {fb.comment && (
                        <p className="text-sm mt-1.5" style={{ color: 'var(--text-2)' }}>{fb.comment}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── SIDEBAR DREAPTA ── */}
        <div className="space-y-4 lg:sticky lg:top-6">

          {/* Card autor */}
          <div
            className="rounded-2xl p-5"
            style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}
          >
            <div className="flex flex-col items-center text-center gap-3">
              {profile?.avatarUrl ? (
                <img
                  src={profile.avatarUrl}
                  alt={initials}
                  className="w-11 h-11 rounded-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div
                  className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm"
                  style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
                >
                  {initials}
                </div>
              )}
              <div>
                <p className="font-bold text-base" style={{ color: 'var(--text)' }}>
                  {profile ? `${profile.firstName} ${profile.lastName}` : 'Utilizator'}
                </p>
                {(profile?.class || profile?.school) && (
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-2)' }}>
                    {[profile.class ? `Clasa ${profile.class}` : null, profile.school]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )}
                {idea.user.plan === 'PRO' && (
                  <span
                    className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full mt-2"
                    style={{ backgroundColor: 'rgba(246,166,35,0.18)', color: 'var(--orange)' }}
                  >
                    <Crown size={10} /> Pro
                  </span>
                )}
              </div>
              <Link
                to={`/profile/${idea.userId}`}
                className="w-full py-2.5 rounded-xl text-sm font-medium text-center"
                style={{
                  backgroundColor: 'var(--bg-4)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-3)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-4)')}
              >
                Vezi profil
              </Link>

              {/* Acțiune contact — sub „Vezi profil", în cardul elevului */}
              {isAntreprenor && !isOwner && (
                <>
                  {isRealizat ? (
                    <div
                      className="w-full py-2.5 rounded-xl text-sm font-semibold text-center"
                      style={{ backgroundColor: 'rgba(168,85,247,0.1)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.2)' }}
                    >
                      <Trophy size={13} className="inline mr-1.5" />Proiect realizat
                    </div>
                  ) : connectSent || hasConnectionRequest ? (
                    idea.connectionRequest?.status === 'ACCEPTED' ? (
                      <button
                        onClick={() => void handleOpenChat()}
                        className="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 hover:opacity-90"
                        style={{ backgroundColor: 'rgba(34,197,94,0.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}
                      >
                        <MessageSquare size={14} /> Deschide chat
                      </button>
                    ) : (
                      <div
                        className="w-full py-2.5 rounded-xl text-sm font-semibold text-center"
                        style={{ backgroundColor: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}
                      >
                        ✓ Cerere trimisă
                      </div>
                    )
                  ) : existingConvId ? (
                    <button
                      onClick={() => void handleOpenChat()}
                      className="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 hover:opacity-90"
                      style={{ backgroundColor: 'rgba(34,197,94,0.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}
                    >
                      <MessageSquare size={14} /> Deschide chat
                    </button>
                  ) : (
                    <button
                      onClick={() => void handleConnect()}
                      disabled={connectLoading}
                      className="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-70"
                      style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
                    >
                      {connectLoading ? <Loader2 size={14} className="animate-spin" /> : <MessageSquare size={14} />}
                      Trimite mesaj
                    </button>
                  )}
                  {connectError && (
                    <p className="text-xs px-3 py-2 rounded-xl w-full text-center" style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                      {connectError}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Card statistici */}
          <div
            className="rounded-2xl p-5"
            style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}
          >
            <h3 className="text-sm font-bold mb-4" style={{ color: 'var(--text)' }}>Statistici idee</h3>
            <div className="space-y-3">
              <StatRow icon={<Eye size={15} />} value={idea.viewCount} label="vizualizări" />
              <StatRow icon={<MessageSquare size={15} />} value={idea._count.connectionRequests} label="mesaje" />
              <StatRow icon={<FileText size={15} />} value={idea.pdfs.length} label="PDF-uri" />
              <StatRow icon={<Star size={15} />} value={idea._count.feedbackList} label="feedback-uri" />
            </div>
          </div>

          {/* Card acțiuni — doar proprietarul (editează / șterge) */}
          {isOwner && (
            <div
              className="rounded-2xl p-5 space-y-2.5"
              style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}
            >
              <Link
                to={`/idea/${idea.id}/edit`}
                className="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer"
                style={{ backgroundColor: 'var(--orange)', color: '#fff', transition: 'background-color 150ms ease-out' }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--orange-2)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--orange)')}
              >
                <Pencil size={14} /> Editează idee
              </Link>
              <button
                onClick={() => setDeleteModalOpen(true)}
                disabled={deleting}
                className="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                style={{
                  backgroundColor: 'rgba(239,68,68,0.1)',
                  color: '#ef4444',
                  border: '1px solid rgba(239,68,68,0.2)',
                  transition: 'background-color 150ms ease-out',
                }}
                onMouseEnter={(e) => { if (!deleting) e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.18)'; }}
                onMouseLeave={(e) => { if (!deleting) e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.1)'; }}
              >
                {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Șterge idee
              </button>
            </div>
          )}

          {/* Secțiunea feedback — doar antreprenori */}
          {isAntreprenor && (
            <div className="rounded-2xl p-5" style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}>
              <h3 className="text-sm font-bold mb-1" style={{ color: 'var(--text)' }}>
                {myFeedback ? 'Feedback-ul tău' : 'Lasă un feedback'}
              </h3>
              <p className="text-xs mb-4" style={{ color: 'var(--text-2)' }}>
                {myFeedback ? 'Poți actualiza oricând.' : 'Ajută elevul să-și îmbunătățească ideea.'}
              </p>

              {/* Stele */}
              <div className="flex gap-1 mb-4">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setFeedbackRating(star)}
                    onMouseEnter={() => setFeedbackHover(star)}
                    onMouseLeave={() => setFeedbackHover(0)}
                    className="p-0.5 transition-transform hover:scale-110"
                    aria-label={`${star} stele`}
                  >
                    <Star
                      size={28}
                      fill={(feedbackHover || feedbackRating) >= star ? 'var(--orange)' : 'transparent'}
                      style={{ color: 'var(--orange)', transition: 'fill 100ms ease-out' }}
                    />
                  </button>
                ))}
                {feedbackRating > 0 && (
                  <span className="ml-2 text-sm font-semibold self-center" style={{ color: 'var(--orange)' }}>
                    {feedbackRating}/5
                  </span>
                )}
              </div>

              {/* Comentariu */}
              <textarea
                value={feedbackComment}
                onChange={(e) => setFeedbackComment(e.target.value)}
                rows={3}
                placeholder="Comentariu opțional..."
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none resize-none mb-3"
                style={{ backgroundColor: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)' }}
              />

              {/* Interesat colaborare */}
              <label className="flex items-center gap-2 mb-4 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={feedbackInterested}
                  onChange={(e) => setFeedbackInterested(e.target.checked)}
                  className="w-4 h-4 rounded accent-orange-400"
                />
                <span className="text-xs" style={{ color: 'var(--text-2)' }}>Sunt interesat de colaborare</span>
              </label>

              {feedbackSuccess && (
                <p className="text-xs mb-3 font-medium" style={{ color: '#22c55e' }}>✓ Feedback trimis cu succes!</p>
              )}

              <button
                onClick={() => void handleFeedbackSubmit()}
                disabled={feedbackRating === 0 || feedbackSubmitting}
                className="w-full py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
                style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
              >
                {feedbackSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Star size={14} />}
                {myFeedback ? 'Actualizează feedback' : 'Trimite feedback'}
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
