import { useState, useEffect, useRef, FormEvent } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Globe, Crown, BookOpen, ArrowLeft,
  Pencil, Check, X, Camera, Trophy, Loader2, Users,
  Eye, Handshake, Star, Lightbulb, BarChart2, Gift, MessageSquare,
  Plus, TrendingUp, Trash2, ChevronRight, Lock, Clock, Download,
  type LucideIcon,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import IdeaCard, { type IdeaCardData } from '../../components/feed/IdeaCard';
import ConfirmModal from '../../components/ui/ConfirmModal';
import { getCategoryIcon } from '../../lib/categories';

type ApiError = { response?: { data?: { error?: string } } };

const STATUS_COLORS: Record<string, string> = {
  PUBLICAT: '#8892a4',
  CONTACTAT: '#f6a623',
  IN_COLABORARE: '#22c55e',
  REALIZAT: '#a855f7',
};

const ANT_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  ACTIV:   { label: 'Activ',   color: '#22c55e' },
  INACTIV: { label: 'Inactiv', color: '#f59e0b' },
  RETRAS:  { label: 'Retras',  color: '#6b7280' },
};

interface ProfileCount {
  ideas?: number;
  collaborationsAsElev?: number;
  collaborationsAsAntreprenor?: number;
  giveawaysCreated?: number;
  feedbackGiven?: number;
}

interface ElevProfile {
  id: string; plan: string; createdAt: string; role?: string; targetRole?: string;
  profileElev: {
    firstName: string; lastName: string; username: string | null; school: string | null; class: string | null;
    city: string | null; bio: string | null; interests: string[]; avatarUrl: string | null;
  } | null;
  ideas: {
    id: string; title: string; categories: string[]; status: string; planAtPost: string;
    viewCount: number; createdAt: string;
    images: { url: string }[];
    _count: { feedbackList: number };
  }[];
  collaborationsAsElev: {
    confirmedAt: string;
    antreprenor: {
      profileAntreprenor: { firstName: string; lastName: string; company: string | null; avatarUrl: string | null } | null;
    };
  }[];
  giveawayParticipations?: { id: string; title: string; status: string; isWinner: boolean; joinedAt: string }[];
  feedbackReceived?: {
    id: string;
    antreprenor: { profileAntreprenor: { firstName: string; lastName: string; avatarUrl: string | null } | null };
    ratingGeneral: number; comment: string | null; createdAt: string;
    idea: { title: string };
  }[];
  weeklyViews?: { day: string; count: number }[];
  recentActivity?: { type: string; actorName: string; ideaTitle: string; ideaId: string; timeAgo: string }[];
  _count: ProfileCount;
}

interface AntreprenorProfile {
  id: string; plan: string; createdAt: string; role?: string; targetRole?: string;
  profileAntreprenor: {
    firstName: string; lastName: string; username: string | null; company: string | null; position: string | null;
    domain: string | null; website: string | null; bioMentor: string | null;
    experienceYears: number | null; avatarUrl: string | null; status: string;
  } | null;
  collaborationsAsAntreprenor: {
    confirmedAt: string;
    idea: { id: string; title: string; category: string } | null;
    elev: { profileElev: { firstName: string; lastName: string; avatarUrl: string | null } | null };
  }[];
  giveawaysCreated: { id: string; title: string; status: string; _count: { participants: number } }[];
  investmentHistory: {
    id: string; investmentType: string; amountDescription: string | null; status: string; createdAt: string;
    idea: { id: string; title: string } | null;
  }[];
  _count: ProfileCount;
}

type ProfileData = ElevProfile | AntreprenorProfile;

function getInitials(name: string) {
  return name.split(' ').map((w) => w[0] ?? '').join('').toUpperCase().slice(0, 2);
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 60) return `acum ${min || 1} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `acum ${h} ${h === 1 ? 'oră' : 'ore'}`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'ieri';
  if (d < 7) return `acum ${d} zile`;
  return new Date(dateStr).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' });
}

export default function ProfilePage() {
  const { id } = useParams<{ id?: string }>();
  const { user, logout, updateUser } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  // GDPR — export date + ștergere cont
  const [exporting, setExporting] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  const handleExportData = async () => {
    setExporting(true);
    try {
      const res = await api.get('/gdpr/export', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `inspireme-date-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast('Nu am putut genera exportul. Încearcă din nou.', 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAccount = async (password?: string) => {
    if (!password) return;
    setDeletingAccount(true);
    try {
      await api.post('/gdpr/account/delete', { password });
      toast('Contul a fost șters.', 'success');
      await logout();
      navigate('/login');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Nu am putut șterge contul.';
      toast(msg, 'error');
      setDeletingAccount(false);
    }
  };

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState('ideas');
  const [ideaToDelete, setIdeaToDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [weeklyViews, setWeeklyViews] = useState<NonNullable<ElevProfile['weeklyViews']>>([]);
  const [recentActivity, setRecentActivity] = useState<NonNullable<ElevProfile['recentActivity']>>([]);

  const isOwn = !id || id === user?.id;
  const endpoint = isOwn ? '/profiles/me' : `/profiles/${id}`;

  useEffect(() => {
    setLoading(true);
    api.get<ProfileData>(endpoint)
      .then(({ data }) => {
        setProfile(data);
        if (isOwn) {
          const dataRole = data.targetRole ?? data.role;
          const p = dataRole === 'ELEV'
            ? (data as ElevProfile).profileElev
            : (data as AntreprenorProfile).profileAntreprenor;
          if (p) setForm(p as unknown as Record<string, string>);
        }
      })
      .finally(() => setLoading(false));
  }, [endpoint, isOwn]);

  useEffect(() => {
    if (!isOwn || !profile) return;
    if ((profile.targetRole ?? profile.role) !== 'ELEV') return;
    if (activeTab !== 'analytics' || profile.plan !== 'PRO') return;

    let cancelled = false;
    api.get<{ weeklyViews: ElevProfile['weeklyViews']; recentActivity: ElevProfile['recentActivity'] }>('/profiles/me/analytics')
      .then(({ data }) => {
        if (!cancelled) {
          setWeeklyViews(data.weeklyViews ?? []);
          setRecentActivity(data.recentActivity ?? []);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [activeTab, isOwn, profile]);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch('/profiles/me', form);
      const { data } = await api.get<ProfileData>('/profiles/me');
      setProfile(data);
      setEditing(false);
    } catch (err) {
      toast((err as ApiError).response?.data?.error ?? 'Eroare la salvare.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (file: File) => {
    const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
    // Unele browsere Android/iOS raportează HEIC cu tip gol — lăsăm backend-ul să decidă
    if (file.type && !ALLOWED.includes(file.type)) {
      toast(`Format nesuportat (${file.type}). Folosește JPG, PNG, WebP sau HEIC.`, 'error');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast('Imaginea este prea mare. Maxim 10MB.', 'error');
      return;
    }

    const formData = new FormData();
    formData.append('avatar', file);
    try {
      const { data } = await api.post<{ avatarUrl: string }>('/profiles/me/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setProfile((prev) => {
        if (!prev) return prev;
        if ((prev.targetRole ?? prev.role) === 'ELEV') {
          return { ...prev, profileElev: { ...(prev as ElevProfile).profileElev!, avatarUrl: data.avatarUrl } };
        }
        return { ...prev, profileAntreprenor: { ...(prev as AntreprenorProfile).profileAntreprenor!, avatarUrl: data.avatarUrl } };
      });
      if (isOwn) updateUser({ avatarUrl: data.avatarUrl });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast(msg ?? 'Eroare la upload avatar. Încearcă din nou.', 'error');
    }
  };

  const handleDeleteIdea = async () => {
    if (!ideaToDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/ideas/${ideaToDelete}`);
      setProfile((prev) => {
        if (!prev || (prev.targetRole ?? prev.role) !== 'ELEV') return prev;
        const el = prev as ElevProfile;
        return { ...el, ideas: el.ideas.filter((i) => i.id !== ideaToDelete), _count: { ...el._count, ideas: (el._count.ideas ?? 1) - 1 } };
      });
      toast('Idee ștearsă.', 'success');
      setIdeaToDelete(null);
    } catch (err) {
      toast((err as ApiError).response?.data?.error ?? 'Eroare la ștergere.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-5xl min-[1920px]:mx-auto space-y-4">
        <div className="skeleton h-44 rounded-2xl" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-28 rounded-2xl" />)}
        </div>
        <div className="skeleton h-10 rounded-2xl w-2/3" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-44 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-5xl min-[1920px]:mx-auto py-20 text-center">
        <p className="text-base font-medium mb-4" style={{ color: '#ef4444' }}>Profil negăsit.</p>
        <button onClick={() => navigate(-1)} className="text-sm font-medium" style={{ color: 'var(--orange)' }}>← Înapoi</button>
      </div>
    );
  }

  const isElev = (profile.targetRole ?? profile.role) === 'ELEV';
  const p = isElev ? (profile as ElevProfile).profileElev : (profile as AntreprenorProfile).profileAntreprenor;
  const displayName = p ? `${p.firstName} ${p.lastName}` : 'Utilizator';
  const avatarUrl = p?.avatarUrl ?? null;
  const isPro = profile.plan === 'PRO';

  const elevIdeas = isElev ? ((profile as ElevProfile).ideas ?? []) : [];
  const totalViews = elevIdeas.reduce((sum, i) => sum + i.viewCount, 0);
  const totalFeedback = elevIdeas.reduce((sum, i) => sum + i._count.feedbackList, 0);
  const canPostMoreIdeas = isPro || elevIdeas.length < 1;

  const roleChipParts: string[] = [];
  if (isElev) {
    roleChipParts.push('Elev');
    const ep = (profile as ElevProfile).profileElev;
    if (ep?.class) roleChipParts.push(`Clasa ${ep.class}`);
    if (ep?.city) roleChipParts.push(ep.city);
  } else {
    roleChipParts.push('Antreprenor');
    const ap = (profile as AntreprenorProfile).profileAntreprenor;
    if (ap?.position) roleChipParts.push(ap.position);
    if (ap?.company) roleChipParts.push(ap.company);
  }

  const elevTabs: { id: string; label: string; Icon: LucideIcon; proOnly?: boolean }[] = [
    { id: 'ideas',     label: 'Ideile mele',    Icon: Lightbulb     },
    { id: 'giveaways', label: 'Giveaway-uri',   Icon: Gift          },
    { id: 'feedback',  label: 'Feedback primit', Icon: MessageSquare },
    { id: 'analytics', label: 'Analytics',       Icon: BarChart2, proOnly: true },
  ];

  const antreprenorTabs: { id: string; label: string; Icon: LucideIcon; proOnly?: boolean }[] = [
    { id: 'connections', label: 'Conexiuni',   Icon: Handshake  },
    { id: 'feedback',    label: 'Feedback dat', Icon: Star       },
    { id: 'giveaways',   label: 'Giveaway-uri', Icon: Gift       },
    { id: 'investments', label: 'Investiții',   Icon: TrendingUp },
  ];

  const tabs = isElev ? elevTabs : antreprenorTabs;

  // Adaptează idea din profil la forma IdeaCardData pentru IdeaCard
  const toIdeaCardData = (idea: ElevProfile['ideas'][0]): IdeaCardData => ({
    id: idea.id,
    title: idea.title,
    categories: idea.categories,
    problem: '',
    viewCount: idea.viewCount,
    status: idea.status,
    planAtPost: idea.planAtPost,
    createdAt: idea.createdAt,
    tags: [],
    user: {
      id: profile.id,
      plan: profile.plan,
      profileElev: (profile as ElevProfile).profileElev
        ? {
            firstName: (profile as ElevProfile).profileElev!.firstName,
            lastName: (profile as ElevProfile).profileElev!.lastName,
            avatarUrl: (profile as ElevProfile).profileElev!.avatarUrl,
            city: (profile as ElevProfile).profileElev!.city,
          }
        : null,
    },
    images: idea.images,
    _count: { feedbackList: idea._count.feedbackList, connectionRequests: 0 },
  });

  return (
    <div className="max-w-5xl min-[1920px]:mx-auto space-y-4">

      {!isOwn && (
        <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--text-2)' }}>
          <ArrowLeft size={14} /> Înapoi
        </button>
      )}

      {/* ── Hero Card ── */}
      <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}>
        {editing ? (
          <form onSubmit={(e) => void handleSave(e)} className="p-5 space-y-3">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>Editează profilul</h2>
              <button type="button" onClick={() => setEditing(false)} style={{ color: 'var(--text-2)' }}>
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <EditField label="Prenume" value={form['firstName'] ?? ''} onChange={(v) => setForm((f) => ({ ...f, firstName: v }))} />
              <EditField label="Nume" value={form['lastName'] ?? ''} onChange={(v) => setForm((f) => ({ ...f, lastName: v }))} />
            </div>
            <UsernameField value={form['username'] ?? ''} onChange={(v) => setForm((f) => ({ ...f, username: v }))} />
            {isElev ? (
              <>
                <EditField label="Școală" value={form['school'] ?? ''} onChange={(v) => setForm((f) => ({ ...f, school: v }))} />
                <div className="grid grid-cols-2 gap-3">
                  <EditField label="Clasa" value={form['class'] ?? ''} onChange={(v) => setForm((f) => ({ ...f, class: v }))} />
                  <EditField label="Oraș" value={form['city'] ?? ''} onChange={(v) => setForm((f) => ({ ...f, city: v }))} />
                </div>
                <EditField label="Bio" value={form['bio'] ?? ''} onChange={(v) => setForm((f) => ({ ...f, bio: v }))} textarea />
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <EditField label="Companie" value={form['company'] ?? ''} onChange={(v) => setForm((f) => ({ ...f, company: v }))} />
                  <EditField label="Poziție" value={form['position'] ?? ''} onChange={(v) => setForm((f) => ({ ...f, position: v }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <EditField label="Domeniu" value={form['domain'] ?? ''} onChange={(v) => setForm((f) => ({ ...f, domain: v }))} />
                  <EditField label="Website" value={form['website'] ?? ''} onChange={(v) => setForm((f) => ({ ...f, website: v }))} />
                </div>
                <EditField label="Despre mine (ca mentor)" value={form['bioMentor'] ?? ''} onChange={(v) => setForm((f) => ({ ...f, bioMentor: v }))} textarea />
              </>
            )}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setEditing(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5"
                style={{ backgroundColor: 'var(--bg-3)', color: 'var(--text-2)' }}>
                <X size={14} /> Anulează
              </button>
              <button type="submit" disabled={saving}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
                style={{ backgroundColor: 'var(--orange)', color: '#fff' }}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                {saving ? 'Se salvează...' : 'Salvează'}
              </button>
            </div>
          </form>
        ) : (
          <>
            {/* Banner colorat — albastru pentru elev, orange pentru antreprenor */}
            <div className="h-20 sm:h-24" style={{
              background: isElev
                ? 'linear-gradient(135deg, rgba(59,130,246,0.22) 0%, rgba(99,102,241,0.10) 100%)'
                : 'linear-gradient(135deg, rgba(246,166,35,0.25) 0%, rgba(45,55,72,0.18) 100%)',
            }} />

            {/* Conținut principal — avatar iese din banner */}
            <div className="px-5 pb-5">
              <input ref={fileInputRef} type="file" className="hidden" accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleAvatarUpload(f); e.target.value = ''; }} />

              {/* Rând avatar + acțiuni — alignate la bottom */}
              <div className="flex items-end justify-between" style={{ marginTop: -40 }}>
                {/* Avatar — iese din banner */}
                <div className="relative inline-flex">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={displayName}
                      className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl object-cover"
                      style={{
                        boxShadow: isPro
                          ? '0 0 0 3px var(--bg-2), 0 0 0 5.5px var(--orange)'
                          : '0 0 0 3px var(--bg-2)',
                      }}
                      loading="lazy" />
                  ) : (
                    <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl flex items-center justify-center text-2xl font-bold"
                      style={{
                        background: 'linear-gradient(135deg, var(--orange) 0%, #2d3748 100%)',
                        color: '#fff',
                        boxShadow: isPro
                          ? '0 0 0 3px var(--bg-2), 0 0 0 5.5px var(--orange)'
                          : '0 0 0 3px var(--bg-2)',
                      }}>
                      {getInitials(displayName)}
                    </div>
                  )}
                  {isOwn && (
                    <button onClick={() => fileInputRef.current?.click()}
                      className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: 'var(--bg-4)', border: '2px solid var(--bg-2)', color: 'var(--text-2)' }}>
                      <Camera size={12} />
                    </button>
                  )}
                </div>

                {/* Acțiuni — Pro badge / Upgrade / Editează */}
                <div className="flex items-center gap-1.5">
                  {isPro && (
                    <span className="flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-xl whitespace-nowrap"
                      style={{ backgroundColor: 'rgba(246,166,35,0.12)', color: 'var(--orange)', border: '1px solid rgba(246,166,35,0.25)' }}>
                      <Star size={10} /> Pro
                    </span>
                  )}
                  {isOwn && !isPro && (
                    <Link to="/subscriptions"
                      className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-xl whitespace-nowrap"
                      style={{ backgroundColor: 'var(--bg-3)', color: 'var(--text-2)', border: '1px solid var(--border)' }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-4)')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-3)')}>
                      <Crown size={10} /> Upgrade
                    </Link>
                  )}
                  {isOwn && (
                    <button onClick={() => setEditing(true)}
                      className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-xl whitespace-nowrap"
                      style={{ backgroundColor: 'var(--bg-3)', color: 'var(--text)', border: '1px solid var(--border)' }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-4)')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-3)')}>
                      <Pencil size={11} /> Editează
                    </button>
                  )}
                </div>
              </div>

              {/* Nume + username */}
              <div className="mt-3">
                <h1 className="text-xl sm:text-2xl font-extrabold leading-tight tracking-tight" style={{ color: 'var(--text)' }}>
                  {displayName}
                </h1>
                {p?.username && (
                  <p className="text-sm mt-0.5 font-medium" style={{ color: 'var(--text-2)' }}>@{p.username}</p>
                )}
              </div>

              {/* Role chip */}
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full mt-2.5"
                style={{ backgroundColor: isElev ? 'rgba(59,130,246,0.12)' : 'rgba(246,166,35,0.12)' }}>
                <Users size={11} style={{ color: isElev ? '#3b82f6' : 'var(--orange)', flexShrink: 0 }} />
                <span className="text-xs font-semibold" style={{ color: isElev ? '#3b82f6' : 'var(--orange)' }}>
                  {roleChipParts.join(' · ')}
                </span>
              </div>

              {/* Info: școală, bio, interese, status */}
              {(() => {
                const elevP = isElev ? (profile as ElevProfile).profileElev : null;
                const antrP = !isElev ? (profile as AntreprenorProfile).profileAntreprenor : null;
                const bio = elevP?.bio ?? antrP?.bioMentor;
                const hasInfo = !!(elevP?.school || antrP?.domain || antrP?.website || bio || (elevP?.interests?.length ?? 0) > 0 || antrP?.status);
                if (!hasInfo) return null;
                return (
                  <div className="mt-4 pt-4 space-y-2" style={{ borderTop: '1px solid var(--border)' }}>
                    {elevP?.school && (
                      <p className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-2)' }}>
                        <BookOpen size={14} className="shrink-0" style={{ color: 'var(--text-2)' }} />
                        {elevP.school}
                      </p>
                    )}
                    {antrP?.domain && (
                      <p className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-2)' }}>
                        <Handshake size={14} className="shrink-0" style={{ color: 'var(--text-2)' }} />
                        {antrP.domain}
                      </p>
                    )}
                    {antrP?.website && (
                      <a href={antrP.website} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm hover:underline" style={{ color: 'var(--orange)' }}>
                        <Globe size={14} className="shrink-0" />
                        {antrP.website.replace(/^https?:\/\//, '')}
                      </a>
                    )}
                    {bio && (
                      <p className="text-sm leading-relaxed" style={{ color: 'var(--text-2)' }}>{bio}</p>
                    )}
                    {(elevP?.interests?.length ?? 0) > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {elevP!.interests.map((interest) => (
                          <span key={interest} className="px-2.5 py-1 rounded-xl text-xs font-medium"
                            style={{ backgroundColor: 'var(--bg-3)', color: 'var(--text-2)' }}>
                            {interest}
                          </span>
                        ))}
                      </div>
                    )}
                    {antrP?.status && (() => {
                      const cfg = ANT_STATUS_CONFIG[antrP.status] ?? ANT_STATUS_CONFIG['RETRAS']!;
                      return (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
                          style={{ backgroundColor: `${cfg.color}18`, color: cfg.color }}>
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: cfg.color }} />
                          {cfg.label}
                        </span>
                      );
                    })()}
                  </div>
                );
              })()}
            </div>
          </>
        )}
      </div>

      {/* ── Stats Grid ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(isElev ? [
          { Icon: Lightbulb, value: profile._count.ideas ?? elevIdeas.length, label: 'Idei postate', color: '#f6a623' },
          { Icon: Eye,        value: totalViews,                                label: 'Vizualizări',  color: '#3b82f6' },
          { Icon: Handshake,  value: profile._count.collaborationsAsElev ?? 0,  label: 'Colaborări',   color: '#22c55e' },
          { Icon: Star,       value: totalFeedback,                             label: 'Feedback-uri', color: '#a855f7' },
        ] : [
          { Icon: Handshake,  value: profile._count.collaborationsAsAntreprenor ?? 0,                    label: 'Colaborări',   color: '#22c55e' },
          { Icon: Star,       value: profile._count.feedbackGiven ?? 0,                                  label: 'Feedback dat', color: '#3b82f6' },
          { Icon: Gift,       value: profile._count.giveawaysCreated ?? 0,                               label: 'Giveaway-uri', color: '#f6a623' },
          { Icon: TrendingUp, value: (profile as AntreprenorProfile).investmentHistory?.length ?? 0,     label: 'Investiții',   color: '#a855f7' },
        ]).map(({ Icon, value, label, color }) => (
          <div key={label} className="rounded-xl p-3.5 flex items-center gap-3"
            style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${color}18` }}>
              <Icon size={18} style={{ color }} />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-extrabold leading-none mb-0.5" style={{ color: 'var(--text)' }}>{value}</p>
              <p className="text-xs leading-tight" style={{ color: 'var(--text-2)' }}>{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Tabs ── */}
      {isOwn && (
        <div className="flex gap-2 flex-wrap">
          {tabs.map(({ id: tabId, label, Icon, proOnly }) => {
            const isActive = activeTab === tabId;
            const isLocked = (proOnly ?? false) && !isPro;
            return (
              <button key={tabId}
                onClick={() => { if (!isLocked) setActiveTab(tabId); }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
                style={{
                  backgroundColor: isActive ? 'var(--orange)' : 'var(--bg-2)',
                  color: isActive ? '#fff' : isLocked ? 'var(--text-2)' : 'var(--text)',
                  border: `1px solid ${isActive ? 'var(--orange)' : 'var(--border)'}`,
                  opacity: isLocked ? 0.6 : 1,
                  transition: 'background-color 150ms, color 150ms, border-color 150ms',
                }}
                onMouseEnter={(e) => { if (!isActive && !isLocked) e.currentTarget.style.backgroundColor = 'var(--bg-3)'; }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = 'var(--bg-2)'; }}>
                {isLocked ? <Lock size={13} /> : <Icon size={13} />}
                {label}
                {isLocked && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                    style={{ backgroundColor: 'rgba(246,166,35,0.15)', color: 'var(--orange)' }}>
                    Pro
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Grid idei: profil propriu (cu acțiuni) ── */}
      {isOwn && isElev && activeTab === 'ideas' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {elevIdeas.map((idea) => {
            const catLabel = idea.categories[0] ?? '';
            const CatIcon = getCategoryIcon(catLabel);
            const statusColor = STATUS_COLORS[idea.status] ?? '#8892a4';
            const statusLabel = idea.status === 'IN_COLABORARE' ? 'Colaborare'
              : idea.status === 'REALIZAT' ? 'Realizat'
              : idea.status.charAt(0) + idea.status.slice(1).toLowerCase();
            const coverImg = idea.images[0]?.url;
            return (
              <article key={idea.id} className="flex flex-col rounded-2xl overflow-hidden"
                style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}>

                {/* Cover imagine sau placeholder categorie */}
                {coverImg ? (
                  <div className="h-32 overflow-hidden shrink-0">
                    <img src={coverImg} alt={idea.title} className="w-full h-full object-cover" loading="lazy" />
                  </div>
                ) : (
                  <div className="h-20 flex items-center justify-center shrink-0"
                    style={{ backgroundColor: 'var(--bg-3)' }}>
                    {CatIcon
                      ? <CatIcon size={28} style={{ color: 'var(--orange)', opacity: 0.4 }} />
                      : <Lightbulb size={28} style={{ color: 'var(--orange)', opacity: 0.4 }} />}
                  </div>
                )}

                <div className="flex flex-col gap-2.5 p-4 flex-1">
                  {/* Badges */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {idea.planAtPost === 'PRO' && (
                      <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                        style={{ backgroundColor: 'rgba(246,166,35,0.15)', color: 'var(--orange)' }}>
                        <Star size={9} /> Pro
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
                      style={{ color: statusColor, backgroundColor: `${statusColor}18` }}>
                      {idea.status === 'REALIZAT'
                        ? <Trophy size={9} />
                        : <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: statusColor }} />}
                      {statusLabel}
                    </span>
                    {idea.categories.map((cat) => (
                      <span key={cat} className="text-[10px] font-medium px-1.5 py-0.5 rounded-md"
                        style={{ backgroundColor: 'var(--bg-3)', color: 'var(--text-2)' }}>
                        {cat}
                      </span>
                    ))}
                  </div>

                  {/* Titlu */}
                  <Link to={`/idea/${idea.id}`}
                    className="text-sm font-bold leading-snug hover:underline line-clamp-2 flex-1"
                    style={{ color: 'var(--text)' }}>
                    {idea.title}
                  </Link>

                  {/* Vizualizări */}
                  <p className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-2)' }}>
                    <Eye size={11} /> {idea.viewCount} vizualizări
                  </p>

                  {/* Acțiuni */}
                  <div className="flex items-center gap-2 pt-2.5" style={{ borderTop: '1px solid var(--border)' }}>
                    <Link to={`/idea/${idea.id}/edit`}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold"
                      style={{ backgroundColor: 'var(--bg-3)', color: 'var(--text-2)', border: '1px solid var(--border)' }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-4)')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-3)')}>
                      <Pencil size={11} /> Editează
                    </Link>
                    <Link to={`/idea/${idea.id}`}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold"
                      style={{ backgroundColor: 'var(--bg-3)', color: 'var(--text-2)', border: '1px solid var(--border)' }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-4)')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-3)')}>
                      <Eye size={11} /> Deschide
                    </Link>
                    <button onClick={() => setIdeaToDelete(idea.id)}
                      className="w-8 h-8 flex items-center justify-center rounded-xl shrink-0"
                      style={{ color: '#ef4444' }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.1)')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}

          {/* Card: postează o idee nouă */}
          <Link to={canPostMoreIdeas ? '/idea/new' : '/subscriptions'}
            className="rounded-2xl flex flex-col items-center justify-center gap-2.5 text-center"
            style={{ border: '2px dashed var(--border)', minHeight: 160, padding: '1.5rem' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--orange)'; (e.currentTarget.querySelector('svg') as SVGElement | null)?.style.setProperty('color', 'var(--orange)'); }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; (e.currentTarget.querySelector('svg') as SVGElement | null)?.style.setProperty('color', 'var(--text-2)'); }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: 'var(--bg-3)' }}>
              <Plus size={20} style={{ color: 'var(--text-2)', transition: 'color 150ms' }} />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Idee nouă</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-2)' }}>
                {canPostMoreIdeas ? 'Postează o idee în feed' : 'Necesită Plan Pro'}
              </p>
            </div>
          </Link>
        </div>
      )}

      {/* ── Grid idei: profil public (folosim IdeaCard) ── */}
      {!isOwn && isElev && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {elevIdeas.map((idea) => (
            <IdeaCard
              key={idea.id}
              idea={toIdeaCardData(idea)}
              onClick={() => navigate(`/idea/${idea.id}`)}
            />
          ))}
        </div>
      )}

      {/* ── Tab: Giveaway-uri (elev) ── */}
      {isOwn && isElev && activeTab === 'giveaways' && (() => {
        const giveaways = (profile as ElevProfile).giveawayParticipations ?? [];
        if (!giveaways.length) return (
          <EmptyTabState icon={Gift} title="Nu participi la niciun giveaway încă"
            description="Descoperă giveaway-urile lansate de antreprenori și înscrie-ți ideea">
            <Link to="/giveaways"
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold mt-4"
              style={{ backgroundColor: 'var(--orange)', color: '#fff' }}>
              <Trophy size={13} /> Explorează giveaway-urile
            </Link>
          </EmptyTabState>
        );
        return (
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}>
            {giveaways.map((g, i) => {
              const isActive = g.status === 'ACTIVE';
              const isFinished = g.status === 'FINISHED';
              const iconColor = g.isWinner ? '#22c55e' : isActive ? 'var(--orange)' : 'var(--text-2)';
              const iconBg = g.isWinner ? 'rgba(34,197,94,0.12)' : isActive ? 'rgba(246,166,35,0.12)' : 'var(--bg-3)';
              const badgeStyle = g.isWinner
                ? { backgroundColor: 'rgba(34,197,94,0.15)', color: '#22c55e' }
                : isActive
                  ? { backgroundColor: 'rgba(246,166,35,0.15)', color: 'var(--orange)' }
                  : { backgroundColor: 'var(--bg-3)', color: 'var(--text-2)' };
              return (
                <Link key={g.id} to={`/giveaways/${g.id}`}
                  className="flex items-center gap-3 px-4 py-3"
                  style={{ borderBottom: i < giveaways.length - 1 ? '1px solid var(--border)' : 'none', transition: 'background-color 150ms' }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-3)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: iconBg }}>
                    {g.isWinner
                      ? <Trophy size={16} style={{ color: iconColor }} />
                      : <Gift size={16} style={{ color: iconColor }} />}
                  </div>
                  <p className="flex-1 text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{g.title}</p>
                  <span className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full shrink-0 font-semibold"
                    style={badgeStyle}>
                    {g.isWinner
                      ? <><Check size={10} /> Câștigat!</>
                      : isActive
                        ? <><span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--orange)' }} /> Participi</>
                        : isFinished
                          ? <>Participat</>
                          : <>Anulat</>}
                  </span>
                </Link>
              );
            })}
          </div>
        );
      })()}

      {/* ── Tab: Feedback primit (elev) ── */}
      {isOwn && isElev && activeTab === 'feedback' && (() => {
        const feedbackList = (profile as ElevProfile).feedbackReceived ?? [];
        if (!feedbackList.length) return (
          <EmptyTabState icon={MessageSquare}
            title={totalFeedback > 0 ? `${totalFeedback} feedback-uri primite` : 'Niciun feedback primit încă'}
            description={totalFeedback > 0
              ? 'Antreprenorii ți-au evaluat ideile — detaliile apar în pagina fiecărei idei'
              : 'Postează-ți ideile în feed ca antreprenorii să le poată evalua'} />
        );
        return (
          <div className="space-y-3">
            {feedbackList.map((fb) => {
              const ap = fb.antreprenor?.profileAntreprenor;
              const fbName = ap ? `${ap.firstName} ${ap.lastName}` : 'Antreprenor';
              return (
                <div key={fb.id} className="rounded-2xl p-4"
                  style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}>
                  <div className="flex items-start gap-3 mb-3">
                    {ap?.avatarUrl
                      ? <img src={ap.avatarUrl} alt={fbName} className="w-8 h-8 rounded-full object-cover shrink-0" loading="lazy" />
                      : <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                          style={{ background: 'linear-gradient(135deg, var(--orange) 0%, #2d3748 100%)', color: '#fff' }}>
                          {getInitials(fbName)}
                        </div>}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold leading-tight" style={{ color: 'var(--text)' }}>
                        {fbName}{' '}
                        <span className="font-normal" style={{ color: 'var(--text-2)' }}>· Antreprenor</span>
                      </p>
                      <div className="flex items-center gap-0.5 mt-1.5">
                        {Array.from({ length: 5 }).map((_, idx) => (
                          <Star key={idx} size={12}
                            fill={idx < fb.ratingGeneral ? 'var(--orange)' : 'none'}
                            style={{ color: idx < fb.ratingGeneral ? 'var(--orange)' : 'var(--text-2)' }} />
                        ))}
                      </div>
                    </div>
                  </div>
                  {fb.comment && (
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--text-2)' }}>{fb.comment}</p>
                  )}
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* ── Tab: Analytics ── */}
      {isOwn && activeTab === 'analytics' && (
        isPro ? (
          <div className="space-y-3">
            {/* Vizualizări — ultimele 7 zile */}
            <div className="rounded-2xl p-5" style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp size={15} style={{ color: 'var(--orange)' }} />
                <h3 className="text-sm font-bold" style={{ color: 'var(--text)' }}>Vizualizări — ultimele 7 zile</h3>
              </div>
              {weeklyViews.length > 0 ? (
                <>
                  <p className="text-xs mb-4" style={{ color: 'var(--text-2)' }}>
                    Total: <span style={{ color: 'var(--orange)' }}>+{weeklyViews.reduce((s, d) => s + d.count, 0)}</span> în această săptămână
                  </p>
                  <div className="flex items-end gap-1.5" style={{ height: 112 }}>
                    {(() => {
                      const maxVal = Math.max(...weeklyViews.map((d) => d.count), 1);
                      return weeklyViews.map(({ day, count }) => (
                        <div key={day} className="flex-1 flex flex-col items-center gap-1 justify-end h-full">
                          <span className="text-[11px] font-semibold" style={{ color: 'var(--text-2)' }}>{count}</span>
                          <div className="w-full rounded-t-xl" style={{
                            height: `${Math.max((count / maxVal) * 72, 4)}px`,
                            background: 'linear-gradient(180deg, #f6a623 0%, rgba(246,166,35,0.25) 100%)',
                          }} />
                          <span className="text-[11px]" style={{ color: 'var(--text-2)' }}>{day}</span>
                        </div>
                      ));
                    })()}
                  </div>
                </>
              ) : (
                <p className="text-xs text-center py-6" style={{ color: 'var(--text-2)' }}>
                  Datele analitice vor fi disponibile în curând
                </p>
              )}
            </div>

            {/* Performanța ideilor */}
            {elevIdeas.length > 0 && (
              <div className="rounded-2xl p-5" style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}>
                <div className="flex items-center gap-2 mb-4">
                  <Lightbulb size={15} style={{ color: 'var(--orange)' }} />
                  <h3 className="text-sm font-bold" style={{ color: 'var(--text)' }}>Performanța ideilor tale</h3>
                </div>
                <div className="space-y-3">
                  {elevIdeas.map((idea) => {
                    const maxViews = Math.max(...elevIdeas.map((i) => i.viewCount), 1);
                    const pct = Math.round((idea.viewCount / maxViews) * 100);
                    return (
                      <div key={idea.id} className="rounded-xl p-3.5"
                        style={{ backgroundColor: 'var(--bg-3)', border: '1px solid var(--border)' }}>
                        <div className="flex items-center justify-between mb-2">
                          <Link to={`/idea/${idea.id}`} className="text-sm font-semibold truncate hover:underline"
                            style={{ color: 'var(--text)', maxWidth: '75%' }}>
                            {idea.title}
                          </Link>
                          <p className="text-xs font-bold shrink-0" style={{ color: 'var(--orange)' }}>{pct}%</p>
                        </div>
                        <div className="h-1.5 rounded-full mb-3" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
                          <div className="h-full rounded-full" style={{
                            width: `${pct}%`,
                            background: 'linear-gradient(90deg, #f6a623 0%, #fc8406 100%)',
                          }} />
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-2)' }}>
                            <Eye size={11} /> {idea.viewCount} vizualizări
                          </span>
                          <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-2)' }}>
                            <Star size={11} /> {idea._count.feedbackList} feedback-uri
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Activitate recentă — calculată din date locale */}
            {(() => {
              type ActItem = {
                key: string; Icon: LucideIcon; iconColor: string; iconBg: string;
                actorName: string; action: string; label?: string; linkTo?: string; date: Date;
              };
              const elevProfile = profile as ElevProfile;
              const collabItems: ActItem[] = (elevProfile.collaborationsAsElev ?? []).map((c, i) => {
                const ap = c.antreprenor?.profileAntreprenor;
                return {
                  key: `collab-${i}`,
                  Icon: Handshake, iconColor: '#22c55e', iconBg: 'rgba(34,197,94,0.13)',
                  actorName: ap ? `${ap.firstName} ${ap.lastName}` : 'Antreprenor',
                  action: 'a confirmat colaborarea',
                  date: new Date(c.confirmedAt),
                };
              });
              const ideaItems: ActItem[] = elevIdeas.map((idea) => ({
                key: `idea-${idea.id}`,
                Icon: Lightbulb, iconColor: 'var(--orange)', iconBg: 'rgba(246,166,35,0.13)',
                actorName: 'Tu', action: 'ai postat ideea',
                label: idea.title, linkTo: `/idea/${idea.id}`,
                date: new Date(idea.createdAt),
              }));
              const giveawayItems: ActItem[] = (elevProfile.giveawayParticipations ?? []).map((g) => ({
                key: `giveaway-${g.id}`,
                Icon: Gift,
                iconColor: g.isWinner ? '#22c55e' : 'var(--orange)',
                iconBg: g.isWinner ? 'rgba(34,197,94,0.13)' : 'rgba(246,166,35,0.13)',
                actorName: 'Tu',
                action: g.isWinner ? 'ai câștigat' : 'ai participat la',
                label: g.title, linkTo: `/giveaways/${g.id}`,
                date: new Date(g.joinedAt),
              }));
              const localActivities = [...collabItems, ...ideaItems, ...giveawayItems]
                .sort((a, b) => b.date.getTime() - a.date.getTime())
                .slice(0, 10);
              return (
                <div className="rounded-2xl p-5" style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center gap-2 mb-4">
                    <Clock size={15} style={{ color: 'var(--orange)' }} />
                    <h3 className="text-sm font-bold" style={{ color: 'var(--text)' }}>Activitate recentă</h3>
                  </div>
                  {localActivities.length > 0 ? (
                    <div>
                      {localActivities.map((item, i) => (
                        <div key={item.key} className="flex items-center gap-3 py-2.5"
                          style={{ borderBottom: i < localActivities.length - 1 ? '1px solid var(--border)' : 'none' }}>
                          <div className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0"
                            style={{ backgroundColor: item.iconBg }}>
                            <item.Icon size={13} style={{ color: item.iconColor }} />
                          </div>
                          <p className="flex-1 text-xs leading-relaxed" style={{ color: 'var(--text-2)' }}>
                            <span className="font-semibold" style={{ color: 'var(--text)' }}>{item.actorName}</span>
                            {' '}{item.action}
                            {item.label && item.linkTo
                              ? <>{' '}<Link to={item.linkTo} className="hover:underline" style={{ color: 'var(--orange)' }}>{item.label}</Link></>
                              : item.label
                                ? <>{' '}<span style={{ color: 'var(--orange)' }}>{item.label}</span></>
                                : null}
                          </p>
                          <span className="text-[11px] shrink-0" style={{ color: 'var(--text-2)' }}>{timeAgo(item.date.toISOString())}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-center py-4" style={{ color: 'var(--text-2)' }}>
                      Nicio activitate recentă
                    </p>
                  )}
                </div>
              );
            })()}

            {/* Fallback dacă nu sunt date */}
            {!weeklyViews.length && !elevIdeas.length && (
              <EmptyTabState icon={BarChart2} title="Fără date analitice încă"
                description="Postează idei și interacționează cu antreprenorii pentru a vedea statisticile" />
            )}
          </div>
        ) : (
          <EmptyTabState icon={BarChart2} title="Analytics disponibil cu Plan Pro"
            description="Statistici despre vizibilitate, engagement și tendințe ale ideilor tale">
            <Link to="/subscriptions"
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold mt-4"
              style={{ backgroundColor: 'var(--orange)', color: '#fff' }}>
              <Crown size={14} /> Actualizează la Pro
            </Link>
          </EmptyTabState>
        )
      )}

      {/* ── Antreprenor: Conexiuni ── */}
      {isOwn && !isElev && activeTab === 'connections' && (() => {
        const collabs = (profile as AntreprenorProfile).collaborationsAsAntreprenor ?? [];
        if (!collabs.length) return <EmptyTabState icon={Handshake} title="Nicio conexiune activă" description="Conectează-te cu elevii ai căror idei te inspiră" />;
        return (
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}>
            {collabs.map((c, i) => {
              const ep = c.elev.profileElev;
              const name = ep ? `${ep.firstName} ${ep.lastName}` : 'Elev';
              return (
                <div key={i} className="flex items-center gap-3 px-4 py-3"
                  style={{ borderBottom: i < collabs.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  {ep?.avatarUrl
                    ? <img src={ep.avatarUrl} alt={name} className="w-9 h-9 rounded-full object-cover shrink-0" loading="lazy" />
                    : <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                        style={{ backgroundColor: 'rgba(59,130,246,0.15)', color: '#3b82f6' }}>{getInitials(name)}</div>
                  }
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{name}</p>
                    {c.idea && <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-2)' }}>{c.idea.title}</p>}
                  </div>
                  <span className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg shrink-0 font-semibold"
                    style={{ backgroundColor: 'rgba(34,197,94,0.12)', color: '#22c55e' }}>
                    <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e]" /> Activ
                  </span>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* ── Antreprenor: Giveaway-uri ── */}
      {isOwn && !isElev && activeTab === 'giveaways' && (() => {
        const giveaways = (profile as AntreprenorProfile).giveawaysCreated ?? [];
        const giveawayStatusLabel: Record<string, string> = { ACTIVE: 'Activ', FINISHED: 'Finalizat', CANCELLED: 'Anulat' };
        if (!isPro) {
          return (
            <EmptyTabState icon={Gift} title="Giveaway-urile necesită Plan Pro"
              description="Lansează giveaway-uri și investește în ideile elevilor">
              <Link to="/subscriptions"
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold mt-4"
                style={{ backgroundColor: 'var(--orange)', color: '#fff' }}>
                <Crown size={14} /> Actualizează la Pro
              </Link>
            </EmptyTabState>
          );
        }
        if (!giveaways.length) {
          return (
            <EmptyTabState icon={Gift} title="Nu ai lansat niciun giveaway" description="Creează primul tău giveaway și inspiră elevii">
              <Link to="/giveaways/new"
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold mt-4"
                style={{ backgroundColor: 'var(--bg-3)', color: 'var(--text)', border: '1px solid var(--border)' }}>
                <Plus size={14} /> Lansează un giveaway
              </Link>
            </EmptyTabState>
          );
        }
        return (
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}>
            {giveaways.map((g, i) => (
              <Link key={g.id} to={`/giveaways/${g.id}`}
                className="flex items-center gap-3 px-4 py-3"
                style={{
                  borderBottom: i < giveaways.length - 1 ? '1px solid var(--border)' : 'none',
                  transition: 'background-color 150ms',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-3)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: 'rgba(246,166,35,0.12)' }}>
                  <Gift size={16} style={{ color: 'var(--orange)' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{g.title}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-2)' }}>{g._count.participants} participanți</p>
                </div>
                <span className="text-[11px] px-2 py-1 rounded-lg shrink-0 font-semibold"
                  style={{
                    backgroundColor: g.status === 'ACTIVE' ? 'rgba(34,197,94,0.12)' : 'var(--bg-3)',
                    color: g.status === 'ACTIVE' ? '#22c55e' : 'var(--text-2)',
                  }}>
                  {giveawayStatusLabel[g.status] ?? g.status}
                </span>
              </Link>
            ))}
          </div>
        );
      })()}

      {/* ── Antreprenor: Feedback dat ── */}
      {isOwn && !isElev && activeTab === 'feedback' && (() => {
        const count = profile._count.feedbackGiven ?? 0;
        return (
          <EmptyTabState
            icon={Star}
            title={count > 0 ? `${count} feedback-uri oferite` : 'Nu ai oferit niciun feedback'}
            description={count > 0
              ? 'Detaliile feedback-ului apar în paginile individuale ale fiecărei idei evaluate'
              : 'Explorează ideile din feed și lasă un feedback constructiv elevilor'}
          />
        );
      })()}

      {/* ── Antreprenor: Investiții ── */}
      {isOwn && !isElev && activeTab === 'investments' && (() => {
        const investments = (profile as AntreprenorProfile).investmentHistory ?? [];
        const invStatusLabel: Record<string, string> = {
          ACTIV: 'Activ', IN_NEGOCIERE: 'În negociere', FINALIZAT: 'Finalizat', NECONFIRMAT: 'Neconfirmat',
        };
        if (!investments.length) {
          return (
            <EmptyTabState icon={TrendingUp} title="Nicio investiție înregistrată"
              description="Investițiile tale vor apărea aici după ce confirmi colaborări cu elevii" />
          );
        }
        return (
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}>
            {investments.map((inv, i) => (
              <div key={inv.id} className="flex items-center gap-3 px-4 py-3"
                style={{ borderBottom: i < investments.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: 'rgba(34,197,94,0.1)' }}>
                  <TrendingUp size={15} style={{ color: '#22c55e' }} />
                </div>
                <div className="flex-1 min-w-0">
                  {inv.idea ? (
                    <Link to={`/idea/${inv.idea.id}`} className="text-sm font-semibold truncate block hover:underline"
                      style={{ color: 'var(--text)' }}>
                      {inv.idea.title}
                    </Link>
                  ) : (
                    <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>—</p>
                  )}
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-2)' }}>
                    {inv.investmentType}{inv.amountDescription ? ` · ${inv.amountDescription}` : ''}
                  </p>
                </div>
                <span className="text-[11px] px-2 py-1 rounded-lg shrink-0 font-semibold"
                  style={{
                    backgroundColor: inv.status === 'ACTIV' ? 'rgba(34,197,94,0.12)'
                      : inv.status === 'FINALIZAT' ? 'rgba(99,102,241,0.12)' : 'var(--bg-3)',
                    color: inv.status === 'ACTIV' ? '#22c55e'
                      : inv.status === 'FINALIZAT' ? '#6366f1' : 'var(--text-2)',
                  }}>
                  {invStatusLabel[inv.status] ?? inv.status}
                </span>
              </div>
            ))}
          </div>
        );
      })()}

      {/* ── Cont & date (GDPR) — doar profil propriu ── */}
      {isOwn && (
        <div className="rounded-2xl p-5" style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}>
          <h2 className="text-sm font-bold mb-1" style={{ color: 'var(--text)' }}>Cont și date</h2>
          <p className="text-xs mb-4" style={{ color: 'var(--text-2)' }}>
            Descarcă o copie a datelor tale sau șterge-ți definitiv contul (GDPR).
          </p>
          <div className="flex flex-col sm:flex-row gap-2.5">
            <button
              type="button"
              onClick={() => void handleExportData()}
              disabled={exporting}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors"
              style={{ backgroundColor: 'var(--bg-4)', color: 'var(--text)', border: '1px solid var(--border)' }}
            >
              {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              Descarcă datele mele
            </button>
            <button
              type="button"
              onClick={() => setShowDeleteAccount(true)}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors"
              style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}
            >
              <Trash2 size={14} /> Șterge contul
            </button>
          </div>
        </div>
      )}

      <ConfirmModal
        open={showDeleteAccount}
        title="Șterge contul definitiv"
        description="Datele tale personale vor fi anonimizate ireversibil și vei fi deconectat. Introdu parola pentru a confirma."
        danger
        confirmLabel="Șterge contul"
        loading={deletingAccount}
        withInput
        inputType="password"
        inputLabel="Parola curentă"
        inputPlaceholder="Parola ta"
        inputMinLength={1}
        onConfirm={(pw) => void handleDeleteAccount(pw)}
        onCancel={() => setShowDeleteAccount(false)}
      />

      {/* ── Modal confirmare ștergere idee ── */}
      {ideaToDelete && (
        <>
          <div className="fixed inset-0 modal-backdrop-anim" style={{ zIndex: 50, backgroundColor: 'rgba(0,0,0,0.55)' }}
            onClick={() => !deleting && setIdeaToDelete(null)} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm rounded-2xl p-6 modal-content-centered-anim"
            style={{ zIndex: 51, backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)', boxShadow: '0 24px 48px rgba(0,0,0,0.3)' }}>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ backgroundColor: 'rgba(239,68,68,0.1)' }}>
              <Trash2 size={22} style={{ color: '#ef4444' }} />
            </div>
            <h3 className="text-base font-bold text-center mb-1.5" style={{ color: 'var(--text)' }}>
              Ștergi această idee?
            </h3>
            <p className="text-sm text-center mb-6" style={{ color: 'var(--text-2)' }}>
              Acțiunea este ireversibilă. Toate imaginile, feedback-ul și conexiunile asociate vor fi șterse permanent.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setIdeaToDelete(null)}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
                style={{ backgroundColor: 'var(--bg-3)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
                Anulează
              </button>
              <button
                onClick={() => void handleDeleteIdea()}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
                style={{ backgroundColor: '#ef4444', color: '#fff' }}>
                {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                {deleting ? 'Se șterge...' : 'Șterge ideea'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Profil public antreprenor: giveaways active ── */}
      {!isOwn && !isElev && ((profile as AntreprenorProfile).giveawaysCreated?.length ?? 0) > 0 && (() => {
        const gws = (profile as AntreprenorProfile).giveawaysCreated;
        return (
          <div>
            <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>Giveaway-uri active</h2>
            <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}>
              {gws.map((g, i) => (
                <Link key={g.id} to={`/giveaways/${g.id}`}
                  className="flex items-center gap-3 px-4 py-3"
                  style={{
                    borderBottom: i < gws.length - 1 ? '1px solid var(--border)' : 'none',
                    transition: 'background-color 150ms',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-3)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: 'rgba(246,166,35,0.12)' }}>
                    <Gift size={15} style={{ color: 'var(--orange)' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{g.title}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-2)' }}>{g._count.participants} participanți</p>
                  </div>
                  <ChevronRight size={15} style={{ color: 'var(--text-2)' }} />
                </Link>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function EmptyTabState({
  icon: Icon, title, description, children,
}: {
  icon: LucideIcon; title: string; description?: string; children?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl p-10 flex flex-col items-center justify-center text-center"
      style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}>
      <Icon size={28} className="mb-3" style={{ color: 'var(--text-2)' }} />
      <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{title}</p>
      {description && <p className="text-xs mt-1 max-w-xs leading-relaxed" style={{ color: 'var(--text-2)' }}>{description}</p>}
      {children}
    </div>
  );
}

function EditField({
  label, value, onChange, textarea,
}: {
  label: string; value: string; onChange: (v: string) => void; textarea?: boolean;
}) {
  const cls = 'w-full px-3 py-2 rounded-xl text-sm outline-none';
  const sty = { backgroundColor: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)' };
  return (
    <div>
      <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-2)' }}>{label}</label>
      {textarea
        ? <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} className={`${cls} resize-y`} style={sty} />
        : <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className={cls} style={sty} />
      }
    </div>
  );
}

function UsernameField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const isValid = value === '' || /^[a-zA-Z0-9_]{3,30}$/.test(value);
  return (
    <div>
      <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-2)' }}>Username (opțional)</label>
      <div className="flex items-center rounded-xl overflow-hidden"
        style={{ border: `1px solid ${!isValid ? '#ef4444' : 'var(--border)'}`, backgroundColor: 'var(--bg-3)' }}>
        <span className="px-3 py-2 text-sm font-medium shrink-0" style={{ color: 'var(--text-2)' }}>@</span>
        <input type="text" value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 30))}
          placeholder="username"
          className="flex-1 py-2 pr-3 text-sm outline-none bg-transparent"
          style={{ color: 'var(--text)' }} />
      </div>
      {!isValid && <p className="text-xs mt-1" style={{ color: '#ef4444' }}>Minim 3 caractere, doar litere, cifre și _ .</p>}
      {isValid && value && <p className="text-xs mt-1" style={{ color: 'var(--text-2)' }}>Profilul tău va fi găsibil ca @{value}</p>}
    </div>
  );
}
