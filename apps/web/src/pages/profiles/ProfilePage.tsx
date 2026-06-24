import { useState, useEffect, useRef, FormEvent } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  MapPin, Globe, Crown, Building2, Briefcase, BookOpen,
  Pencil, Check, X, Camera, Trophy, Users, Loader2, ArrowLeft,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

type ApiError = { response?: { data?: { error?: string } } };

interface ElevProfile {
  id: string; plan: string; createdAt: string; targetRole: 'ELEV';
  profileElev: {
    firstName: string; lastName: string; school: string | null; class: string | null;
    city: string | null; bio: string | null; interests: string[]; avatarUrl: string | null;
  } | null;
  ideas: {
    id: string; title: string; category: string; status: string; planAtPost: string;
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
  _count: { ideas: number; collaborationsAsElev: number };
}

interface AntreprenorProfile {
  id: string; plan: string; createdAt: string; targetRole: 'ANTREPRENOR';
  profileAntreprenor: {
    firstName: string; lastName: string; company: string | null; position: string | null;
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
  _count: { collaborationsAsAntreprenor: number; giveawaysCreated: number; feedbackGiven: number };
}

type ProfileData = ElevProfile | AntreprenorProfile;

const CATEGORY_LABELS: Record<string, string> = {
  ECO: 'Eco', TECH: 'Tech', ARTA: 'Artă', EDUCATIE: 'Educație',
  SANATATE: 'Sănătate', SOCIAL: 'Social', FOOD: 'Food', FINANTE: 'Finanțe',
};

const STATUS_COLOR: Record<string, string> = {
  ACTIV: '#22c55e', INACTIV: 'var(--orange)', RETRAS: '#ef4444',
};

function getInitials(name: string) {
  return name.split(' ').map((w) => w[0] ?? '').join('').toUpperCase().slice(0, 2);
}

export default function ProfilePage() {
  const { id } = useParams<{ id?: string }>();
  const { user, login } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isOwn = !id || id === user?.id;
  const endpoint = isOwn ? '/profiles/me' : `/profiles/${id}`;

  useEffect(() => {
    setLoading(true);
    api.get<ProfileData>(endpoint)
      .then(({ data }) => {
        setProfile(data);
        if (isOwn) {
          const p = data.targetRole === 'ELEV'
            ? (data as ElevProfile).profileElev
            : (data as AntreprenorProfile).profileAntreprenor;
          if (p) setForm(p as unknown as Record<string, string>);
        }
      })
      .finally(() => setLoading(false));
  }, [endpoint, isOwn]);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch('/profiles/me', form);
      // Re-fetch profil
      const { data } = await api.get<ProfileData>('/profiles/me');
      setProfile(data);
      setEditing(false);
    } catch (err) {
      alert((err as ApiError).response?.data?.error ?? 'Eroare la salvare.');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (file: File) => {
    const formData = new FormData();
    formData.append('avatar', file);
    try {
      const { data } = await api.post<{ avatarUrl: string }>('/profiles/me/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setProfile((prev) => {
        if (!prev) return prev;
        if (prev.targetRole === 'ELEV') {
          return { ...prev, profileElev: { ...(prev as ElevProfile).profileElev!, avatarUrl: data.avatarUrl } };
        }
        return { ...prev, profileAntreprenor: { ...(prev as AntreprenorProfile).profileAntreprenor!, avatarUrl: data.avatarUrl } };
      });
      // Actualizăm și AuthContext dacă e profil propriu
      if (isOwn && user) login({ ...user, avatarUrl: data.avatarUrl } as Parameters<typeof login>[0]);
    } catch {
      alert('Eroare la upload avatar.');
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="skeleton h-32 rounded-2xl" />
        <div className="skeleton h-48 rounded-2xl" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <p className="text-base font-medium mb-4" style={{ color: '#ef4444' }}>Profil negăsit.</p>
        <button onClick={() => navigate(-1)} className="text-sm font-medium" style={{ color: 'var(--orange)' }}>← Înapoi</button>
      </div>
    );
  }

  const isElev = profile.targetRole === 'ELEV';
  const p = isElev ? (profile as ElevProfile).profileElev : (profile as AntreprenorProfile).profileAntreprenor;
  const displayName = p ? `${p.firstName} ${p.lastName}` : 'Utilizator';
  const avatarUrl = p?.avatarUrl ?? null;

  return (
    <div className="max-w-2xl mx-auto">
      {!isOwn && (
        <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm mb-5 hover:underline" style={{ color: 'var(--text-2)' }}>
          <ArrowLeft size={14} /> Înapoi
        </button>
      )}

      {/* Header profil */}
      <div className="rounded-2xl p-6 mb-4" style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}>
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div className="relative shrink-0">
            {avatarUrl ? (
              <img src={avatarUrl} alt={displayName} className="w-20 h-20 rounded-2xl object-cover" loading="lazy" />
            ) : (
              <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-xl font-bold"
                style={{ backgroundColor: 'var(--orange)', color: '#fff' }}>
                {getInitials(displayName)}
              </div>
            )}
            {isOwn && (
              <>
                <input ref={fileInputRef} type="file" className="hidden" accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleAvatarUpload(f); e.target.value = ''; }} />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute bottom-0 right-0 p-1.5 rounded-lg"
                  style={{ backgroundColor: 'var(--orange)', color: '#fff' }}>
                  <Camera size={12} />
                </button>
              </>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>{displayName}</h1>
              {profile.plan === 'PRO' && <Crown size={16} style={{ color: 'var(--orange)' }} />}
              {!isElev && (profile as AntreprenorProfile).profileAntreprenor?.status && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor: `${STATUS_COLOR[(profile as AntreprenorProfile).profileAntreprenor!.status] ?? '#8892a4'}1a`,
                    color: STATUS_COLOR[(profile as AntreprenorProfile).profileAntreprenor!.status] ?? '#8892a4',
                  }}>
                  {(profile as AntreprenorProfile).profileAntreprenor!.status}
                </span>
              )}
            </div>

            {isElev ? (
              <div className="flex flex-wrap gap-3 text-xs" style={{ color: 'var(--text-2)' }}>
                {(profile as ElevProfile).profileElev?.school && (
                  <span className="flex items-center gap-1"><BookOpen size={11} /> {(profile as ElevProfile).profileElev!.school}</span>
                )}
                {(profile as ElevProfile).profileElev?.class && (
                  <span>Clasa {(profile as ElevProfile).profileElev!.class}</span>
                )}
                {(profile as ElevProfile).profileElev?.city && (
                  <span className="flex items-center gap-1"><MapPin size={11} /> {(profile as ElevProfile).profileElev!.city}</span>
                )}
              </div>
            ) : (
              <div className="flex flex-wrap gap-3 text-xs" style={{ color: 'var(--text-2)' }}>
                {(profile as AntreprenorProfile).profileAntreprenor?.company && (
                  <span className="flex items-center gap-1"><Building2 size={11} /> {(profile as AntreprenorProfile).profileAntreprenor!.company}</span>
                )}
                {(profile as AntreprenorProfile).profileAntreprenor?.position && (
                  <span className="flex items-center gap-1"><Briefcase size={11} /> {(profile as AntreprenorProfile).profileAntreprenor!.position}</span>
                )}
                {(profile as AntreprenorProfile).profileAntreprenor?.website && (
                  <a href={(profile as AntreprenorProfile).profileAntreprenor!.website!} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 hover:underline" style={{ color: 'var(--orange)' }}>
                    <Globe size={11} /> Website
                  </a>
                )}
              </div>
            )}

            {/* Statistici */}
            <div className="flex gap-4 mt-3 text-xs" style={{ color: 'var(--text-2)' }}>
              {isElev ? (
                <>
                  <span className="font-semibold" style={{ color: 'var(--text)' }}>{profile._count.ideas ?? 0}</span> idei
                  <span className="font-semibold" style={{ color: 'var(--text)' }}>{profile._count.collaborationsAsElev ?? 0}</span> colaborări
                </>
              ) : (
                <>
                  <span><span className="font-semibold" style={{ color: 'var(--text)' }}>{profile._count.collaborationsAsAntreprenor ?? 0}</span> colaborări</span>
                  <span><span className="font-semibold" style={{ color: 'var(--text)' }}>{profile._count.feedbackGiven ?? 0}</span> feedback-uri</span>
                </>
              )}
            </div>
          </div>

          {isOwn && !editing && (
            <button onClick={() => setEditing(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium shrink-0"
              style={{ backgroundColor: 'var(--bg-3)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
              <Pencil size={13} /> Editează
            </button>
          )}
        </div>

        {/* Bio */}
        {!editing && (p as { bio?: string | null; bioMentor?: string | null })?.bio || (p as { bio?: string | null; bioMentor?: string | null })?.bioMentor ? (
          <p className="text-sm leading-relaxed mt-4" style={{ color: 'var(--text-2)' }}>
            {isElev
              ? (profile as ElevProfile).profileElev?.bio
              : (profile as AntreprenorProfile).profileAntreprenor?.bioMentor}
          </p>
        ) : null}

        {/* Interese (elev) */}
        {isElev && (profile as ElevProfile).profileElev?.interests?.length ? (
          <div className="flex flex-wrap gap-2 mt-3">
            {(profile as ElevProfile).profileElev!.interests.map((i) => (
              <span key={i} className="px-2.5 py-1 rounded-full text-xs font-medium"
                style={{ backgroundColor: 'var(--bg-3)', color: 'var(--text-2)' }}>
                {i}
              </span>
            ))}
          </div>
        ) : null}

        {/* Formular editare */}
        {editing && isOwn && (
          <form onSubmit={(e) => void handleSave(e)} className="mt-5 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <EditField label="Prenume" value={form['firstName'] ?? ''} onChange={(v) => setForm((f) => ({ ...f, firstName: v }))} />
              <EditField label="Nume" value={form['lastName'] ?? ''} onChange={(v) => setForm((f) => ({ ...f, lastName: v }))} />
            </div>
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
            <div className="flex gap-3">
              <button type="button" onClick={() => setEditing(false)}
                className="flex-1 py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-1"
                style={{ backgroundColor: 'var(--bg-3)', color: 'var(--text-2)' }}>
                <X size={14} /> Anulează
              </button>
              <button type="submit" disabled={saving}
                className="flex-1 py-2 rounded-xl text-sm font-semibold flex items-center justify-center gap-1 disabled:opacity-50"
                style={{ backgroundColor: 'var(--orange)', color: '#fff' }}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                {saving ? 'Se salvează...' : 'Salvează'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Idei elev */}
      {isElev && (profile as ElevProfile).ideas.length > 0 && (
        <Section title="Idei publicate">
          <div className="space-y-2">
            {(profile as ElevProfile).ideas.map((idea) => (
              <Link key={idea.id} to={`/idea/${idea.id}`}
                className="flex items-center gap-3 px-4 py-3 rounded-xl hover:opacity-80 transition-opacity"
                style={{ backgroundColor: 'var(--bg-3)' }}>
                {idea.images[0] && (
                  <img src={idea.images[0].url} alt={idea.title} className="w-10 h-10 rounded-lg object-cover shrink-0" loading="lazy" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{idea.title}</p>
                  <p className="text-xs" style={{ color: 'var(--text-2)' }}>
                    {CATEGORY_LABELS[idea.category] ?? idea.category} · {idea.viewCount} vizualizări
                  </p>
                </div>
                {idea.planAtPost === 'PRO' && <Crown size={13} style={{ color: 'var(--orange)' }} />}
              </Link>
            ))}
          </div>
        </Section>
      )}

      {/* Colaborări */}
      {isElev && (profile as ElevProfile).collaborationsAsElev.length > 0 && (
        <Section title="Colaborări">
          <div className="space-y-2">
            {(profile as ElevProfile).collaborationsAsElev.map((collab, i) => {
              const ap = collab.antreprenor.profileAntreprenor;
              const name = ap ? `${ap.firstName} ${ap.lastName}` : 'Antreprenor';
              return (
                <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-xl"
                  style={{ backgroundColor: 'var(--bg-3)' }}>
                  {ap?.avatarUrl
                    ? <img src={ap.avatarUrl} alt={name} className="w-9 h-9 rounded-full object-cover" loading="lazy" />
                    : <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                        style={{ backgroundColor: 'var(--bg-4)', color: 'var(--text-2)' }}>{getInitials(name)}</div>
                  }
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{name}</p>
                    {ap?.company && <p className="text-xs" style={{ color: 'var(--text-2)' }}>{ap.company}</p>}
                  </div>
                  <Trophy size={14} className="ml-auto" style={{ color: '#22c55e' }} />
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* Antreprenor — giveaways + investiții */}
      {!isElev && (profile as AntreprenorProfile).giveawaysCreated.length > 0 && (
        <Section title="Giveaway-uri lansate">
          <div className="space-y-2">
            {(profile as AntreprenorProfile).giveawaysCreated.map((g) => (
              <Link key={g.id} to={`/giveaways/${g.id}`}
                className="flex items-center gap-3 px-4 py-3 rounded-xl hover:opacity-80 transition-opacity"
                style={{ backgroundColor: 'var(--bg-3)' }}>
                <Trophy size={18} style={{ color: 'var(--orange)' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{g.title}</p>
                  <p className="text-xs" style={{ color: 'var(--text-2)' }}>
                    {g.status} · <Users size={10} className="inline" /> {g._count.participants} participanți
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </Section>
      )}

      {!isElev && (profile as AntreprenorProfile).investmentHistory.length > 0 && (
        <Section title="Istoricul investițiilor">
          <div className="space-y-2">
            {(profile as AntreprenorProfile).investmentHistory.map((inv) => (
              <div key={inv.id} className="flex items-center gap-3 px-4 py-3 rounded-xl"
                style={{ backgroundColor: 'var(--bg-3)' }}>
                <div className="flex-1 min-w-0">
                  {inv.idea && (
                    <Link to={`/idea/${inv.idea.id}`} className="text-sm font-semibold truncate block hover:underline" style={{ color: 'var(--text)' }}>
                      {inv.idea.title}
                    </Link>
                  )}
                  <p className="text-xs" style={{ color: 'var(--text-2)' }}>
                    {inv.investmentType} · {inv.amountDescription}
                  </p>
                </div>
                <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: inv.status === 'ACTIV' ? 'rgba(34,197,94,0.1)' : 'var(--bg-4)', color: inv.status === 'ACTIV' ? '#22c55e' : 'var(--text-2)' }}>
                  {inv.status}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-5 mb-4" style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}>
      <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>{title}</h2>
      {children}
    </div>
  );
}

function EditField({
  label, value, onChange, textarea,
}: {
  label: string; value: string; onChange: (v: string) => void; textarea?: boolean;
}) {
  const className = 'w-full px-3 py-2 rounded-xl text-sm outline-none';
  const style = { backgroundColor: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)' };
  return (
    <div>
      <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-2)' }}>{label}</label>
      {textarea
        ? <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} className={`${className} resize-y`} style={style} />
        : <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className={className} style={style} />
      }
    </div>
  );
}
