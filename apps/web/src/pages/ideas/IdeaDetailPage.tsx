import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Eye, Star, MessageSquare, MapPin, Crown, Trophy,
  FileText, Pencil, Trash2, Lock, Globe, Loader2, ArrowLeft,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

const CATEGORY_LABELS: Record<string, string> = {
  ECO: 'Eco', TECH: 'Tech', ARTA: 'Artă', EDUCATIE: 'Educație',
  SANATATE: 'Sănătate', SOCIAL: 'Social', FOOD: 'Food', FINANTE: 'Finanțe',
};

const STATUS_LABELS: Record<string, string> = {
  PUBLICAT: 'Publicat', CONTACTAT: 'Contactat',
  IN_COLABORARE: 'În Colaborare', REALIZAT: 'Realizat',
};

const STATUS_COLORS: Record<string, string> = {
  PUBLICAT: '#8892a4', CONTACTAT: '#f6a623', IN_COLABORARE: '#22c55e', REALIZAT: '#a855f7',
};

interface IdeaDetail {
  id: string; title: string; category: string; problem: string; solution: string;
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
    id: string; ratingGeneral: number; comment: string | null; interestedInCollab: boolean; createdAt: string;
  }[];
  connectionRequest: { id: string; status: string; createdAt: string } | null;
}

function formatBytes(bytes: number) {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function IdeaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [idea, setIdea] = useState<IdeaDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeImage, setActiveImage] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [connectLoading, setConnectLoading] = useState(false);
  const [connectSent, setConnectSent] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api
      .get<IdeaDetail>(`/ideas/${id}`)
      .then(({ data }) => setIdea(data))
      .catch((err: { response?: { data?: { error?: string } } }) => {
        setError(err.response?.data?.error ?? 'Ideea nu a putut fi încărcată.');
      })
      .finally(() => setLoading(false));
  }, [id]);

  const isOwner = user?.id === idea?.userId;
  const isAntreprenor = user?.role === 'ANTREPRENOR';
  const myFeedback = idea?.feedbackList?.[0];
  const hasConnectionRequest = !!idea?.connectionRequest;

  const handleDelete = async () => {
    if (!window.confirm('Ești sigur că vrei să ștergi această idee? Acțiunea este ireversibilă.')) return;
    setDeleting(true);
    try {
      await api.delete(`/ideas/${idea!.id}`);
      navigate('/feed');
    } catch {
      alert('Eroare la ștergere. Încearcă din nou.');
      setDeleting(false);
    }
  };

  const handleConnect = async () => {
    setConnectLoading(true);
    try {
      await api.post('/chat/connect', { toUserId: idea!.userId, ideaId: idea!.id });
      setConnectSent(true);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Eroare.';
      alert(msg);
    } finally {
      setConnectLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="skeleton h-8 w-2/3 rounded-xl" />
        <div className="skeleton h-64 rounded-2xl" />
        <div className="skeleton h-32 rounded-2xl" />
        <div className="skeleton h-32 rounded-2xl" />
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
    <div className="max-w-3xl mx-auto">
      {/* Breadcrumb */}
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm mb-5 hover:underline" style={{ color: 'var(--text-2)' }}>
        <ArrowLeft size={14} /> Înapoi
      </button>

      {/* Header card */}
      <div className="rounded-2xl overflow-hidden mb-4" style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}>
        {/* Galerie imagini */}
        {idea.images.length > 0 && (
          <div>
            <div className="w-full h-64 overflow-hidden">
              <img
                src={idea.images[activeImage]?.url ?? ''}
                alt={idea.title}
                className="w-full h-full object-cover"
              />
            </div>
            {idea.images.length > 1 && (
              <div className="flex gap-2 p-3">
                {idea.images.map((img, i) => (
                  <button
                    key={img.id}
                    onClick={() => setActiveImage(i)}
                    className="w-12 h-12 rounded-lg overflow-hidden shrink-0"
                    style={{ border: `2px solid ${i === activeImage ? 'var(--orange)' : 'transparent'}` }}
                  >
                    <img src={img.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="p-6">
          {/* Badges + status */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
              style={{ backgroundColor: 'rgba(246,166,35,0.12)', color: 'var(--orange)' }}>
              {CATEGORY_LABELS[idea.category] ?? idea.category}
            </span>
            {idea.planAtPost === 'PRO' && (
              <span className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full"
                style={{ backgroundColor: 'rgba(246,166,35,0.18)', color: 'var(--orange)' }}>
                <Crown size={10} /> Pro
              </span>
            )}
            <span className="text-xs font-medium px-2.5 py-1 rounded-full"
              style={{ backgroundColor: 'var(--bg-3)', color: STATUS_COLORS[idea.status] ?? 'var(--text-2)' }}>
              {STATUS_LABELS[idea.status] ?? idea.status}
              {idea.status === 'REALIZAT' && <Trophy size={11} className="inline ml-1" />}
            </span>
            {isOwner && (
              <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full ml-auto"
                style={{ backgroundColor: 'var(--bg-3)', color: 'var(--text-2)' }}>
                {idea.visibility === 'PUBLIC' ? <Globe size={11} /> : <Lock size={11} />}
                {idea.visibility === 'PUBLIC' ? 'Publică' : 'Privată'}
              </span>
            )}
          </div>

          {/* Titlu */}
          <h1 className="text-xl font-bold mb-4" style={{ color: 'var(--text)' }}>{idea.title}</h1>

          {/* Autor */}
          <div className="flex items-center gap-3 mb-5 pb-5" style={{ borderBottom: '1px solid var(--border)' }}>
            {profile?.avatarUrl ? (
              <img src={profile.avatarUrl} alt={initials} className="w-10 h-10 rounded-xl object-cover" loading="lazy" />
            ) : (
              <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0"
                style={{ backgroundColor: 'var(--orange)', color: '#fff' }}>
                {initials}
              </div>
            )}
            <div>
              <p className="font-semibold text-sm" style={{ color: 'var(--text)' }}>
                {profile ? `${profile.firstName} ${profile.lastName}` : 'Utilizator necunoscut'}
              </p>
              <div className="flex items-center gap-3 text-xs mt-0.5" style={{ color: 'var(--text-2)' }}>
                {profile?.school && <span>{profile.school}</span>}
                {profile?.class && <span>Clasa {profile.class}</span>}
                {profile?.city && <span className="flex items-center gap-0.5"><MapPin size={10} /> {profile.city}</span>}
              </div>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-4 ml-auto text-xs" style={{ color: 'var(--text-2)' }}>
              <span className="flex items-center gap-1"><Eye size={13} /> {idea.viewCount}</span>
              <span className="flex items-center gap-1"><Star size={13} /> {idea._count.feedbackList}</span>
              <span className="flex items-center gap-1"><MessageSquare size={13} /> {idea._count.connectionRequests}</span>
            </div>
          </div>

          {/* Acțiuni owner */}
          {isOwner && (
            <div className="flex gap-2 mb-5">
              <Link to={`/idea/${idea.id}/edit`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium"
                style={{ backgroundColor: 'var(--bg-3)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
                <Pencil size={13} /> Editează
              </Link>
              <button onClick={handleDelete} disabled={deleting}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium disabled:opacity-50"
                style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
                {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                Șterge
              </button>
            </div>
          )}

          {/* Buton conectare antreprenor */}
          {isAntreprenor && !isOwner && (
            <div className="mb-5">
              {connectSent || hasConnectionRequest ? (
                <div className="px-4 py-3 rounded-xl text-sm font-medium text-center"
                  style={{ backgroundColor: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}>
                  {idea.connectionRequest?.status === 'ACCEPTED'
                    ? '✓ Cerere acceptată — poți accesa chat-ul'
                    : '✓ Cerere de conectare trimisă'}
                </div>
              ) : (
                <button onClick={handleConnect} disabled={connectLoading}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-70"
                  style={{ backgroundColor: 'var(--orange)', color: '#fff' }}>
                  {connectLoading && <Loader2 size={15} className="animate-spin" />}
                  Cere conectare cu elevul
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Secțiuni text */}
      <div className="space-y-4">
        <Section title="Ce problemă rezolvi?" content={idea.problem} />
        <Section title="Cum o rezolvi?" content={idea.solution} />
        {idea.targetAudience && <Section title="Audiență țintă" content={idea.targetAudience} />}
      </div>

      {/* Tags */}
      {idea.tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-4">
          {idea.tags.map((t) => (
            <span key={t} className="px-2.5 py-1 rounded-full text-xs font-medium"
              style={{ backgroundColor: 'var(--bg-3)', color: 'var(--text-2)' }}>
              #{t}
            </span>
          ))}
        </div>
      )}

      {/* PDF */}
      {idea.pdfs.length > 0 && (
        <div className="mt-4 rounded-2xl p-4" style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}>
          <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>Documente atașate</p>
          {idea.pdfs.map((pdf) => (
            <a key={pdf.id} href={pdf.url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-3 px-4 py-3 rounded-xl hover:opacity-80 transition-opacity"
              style={{ backgroundColor: 'var(--bg-3)' }}>
              <FileText size={20} style={{ color: 'var(--orange)' }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{pdf.filename}</p>
                <p className="text-xs" style={{ color: 'var(--text-2)' }}>{formatBytes(pdf.size)}</p>
              </div>
            </a>
          ))}
        </div>
      )}

      {/* Feedback primit (dacă e vizualizare antreprenor) */}
      {isAntreprenor && myFeedback && (
        <div className="mt-4 rounded-2xl p-4" style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}>
          <p className="text-sm font-semibold mb-2" style={{ color: 'var(--text)' }}>Feedback-ul tău</p>
          <div className="flex items-center gap-2 mb-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} size={16} fill={i < myFeedback.ratingGeneral ? 'var(--orange)' : 'transparent'}
                style={{ color: 'var(--orange)' }} />
            ))}
            <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{myFeedback.ratingGeneral}/5</span>
          </div>
          {myFeedback.comment && (
            <p className="text-sm" style={{ color: 'var(--text-2)' }}>{myFeedback.comment}</p>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, content }: { title: string; content: string }) {
  return (
    <div className="rounded-2xl p-5" style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}>
      <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>{title}</h2>
      <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: 'var(--text-2)' }}>{content}</p>
    </div>
  );
}
