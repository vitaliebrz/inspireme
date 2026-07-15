import { useState, useEffect, useRef, FormEvent } from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
import {
  BarChart2, Users, Flag, ShieldOff, Loader2, Search,
  CheckCircle, XCircle, AlertTriangle, Ban, Trash2, Tag, Plus, Pencil, X,
} from 'lucide-react';
import { api } from '../../lib/api';
import ConfirmModal from '../../components/ui/ConfirmModal';
import { invalidateCategoriesCache } from '../../lib/useCategories';
import { ICON_MAP, searchIcons, resolveIcon } from '../../lib/categories';

type ApiError = { response?: { data?: { error?: string } } };

// ─────────────────────────────────────────────
// Dashboard stats
// ─────────────────────────────────────────────

interface Stats {
  users: number; ideas: number; activeGiveaways: number; pendingReports: number;
  collaborations: number; subscriptions: number;
  roleBreakdown: { role: string; count: number }[];
  planBreakdown: { plan: string; count: number }[];
}

function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<Stats>('/admin/stats').then(({ data }) => setStats(data)).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="skeleton h-64 rounded-2xl" />;
  if (!stats) return null;

  const statCards = [
    { label: 'Utilizatori', value: stats.users, color: '#3b82f6' },
    { label: 'Idei', value: stats.ideas, color: 'var(--orange)' },
    { label: 'Colaborări', value: stats.collaborations, color: '#22c55e' },
    { label: 'Giveaway-uri active', value: stats.activeGiveaways, color: '#a855f7' },
    { label: 'Abonamente Pro', value: stats.subscriptions, color: 'var(--orange)' },
    { label: 'Rapoarte pending', value: stats.pendingReports, color: '#ef4444' },
  ];

  return (
    <div>
      <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--text)' }}>Dashboard</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        {statCards.map((s) => (
          <div key={s.label} className="rounded-2xl p-4" style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}>
            <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-2)' }}>{s.label}</p>
            <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value.toLocaleString('ro-RO')}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-2xl p-4" style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}>
          <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text-2)' }}>Utilizatori pe rol</p>
          {stats.roleBreakdown.map((r) => (
            <div key={r.role} className="flex items-center justify-between py-1.5">
              <span className="text-sm" style={{ color: 'var(--text)' }}>{r.role}</span>
              <span className="text-sm font-semibold" style={{ color: 'var(--orange)' }}>{r.count}</span>
            </div>
          ))}
        </div>
        <div className="rounded-2xl p-4" style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}>
          <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text-2)' }}>Utilizatori pe plan</p>
          {stats.planBreakdown.map((p) => (
            <div key={p.plan} className="flex items-center justify-between py-1.5">
              <span className="text-sm" style={{ color: 'var(--text)' }}>{p.plan}</span>
              <span className="text-sm font-semibold" style={{ color: 'var(--orange)' }}>{p.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Users management
// ─────────────────────────────────────────────

interface AdminUser {
  id: string; email: string; role: string; plan: string; isSuspended: boolean; createdAt: string; lastLogin: string | null;
  profileElev: { firstName: string; lastName: string } | null;
  profileAntreprenor: { firstName: string; lastName: string; company: string | null } | null;
  _count: { ideas: number; reportsSubmitted: number };
}

function UsersPanel() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [suspending, setSuspending] = useState<string | null>(null);
  const [suspendModal, setSuspendModal] = useState<{ userId: string; name: string } | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ userId: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = (s = search) => {
    setLoading(true);
    api.get<{ users: AdminUser[] }>(`/admin/users${s ? `?search=${encodeURIComponent(s)}` : ''}`)
      .then(({ data }) => setUsers(data.users))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleSuspendConfirm = async (reason?: string) => {
    if (!suspendModal) return;
    setSuspending(suspendModal.userId);
    await api.post(`/admin/users/${suspendModal.userId}/suspend`, { reason });
    setSuspending(null);
    setSuspendModal(null);
    load();
  };

  const handleUnsuspend = async (userId: string) => {
    setSuspending(userId);
    await api.post(`/admin/users/${userId}/unsuspend`);
    setSuspending(null);
    load();
  };

  const handleDeleteConfirm = async () => {
    if (!deleteModal) return;
    setDeleting(deleteModal.userId);
    try {
      await api.delete(`/admin/users/${deleteModal.userId}`);
      setDeleteModal(null);
      load();
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div>
      <ConfirmModal
        open={!!suspendModal}
        title={`Suspendă utilizatorul`}
        description={suspendModal ? `Contul lui ${suspendModal.name} va fi suspendat.` : undefined}
        danger
        confirmLabel="Suspendă"
        loading={!!suspending}
        withInput
        inputLabel="Motivul suspendării"
        inputPlaceholder="Descrie motivul (min. 10 caractere)..."
        inputMinLength={10}
        onConfirm={(reason) => void handleSuspendConfirm(reason)}
        onCancel={() => setSuspendModal(null)}
      />
      <ConfirmModal
        open={!!deleteModal}
        title="Șterge utilizatorul"
        description={deleteModal ? `Contul lui ${deleteModal.name} va fi anonimizat permanent (GDPR). Acțiunea nu poate fi anulată.` : undefined}
        danger
        confirmLabel="Șterge permanent"
        loading={!!deleting}
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => setDeleteModal(null)}
      />

      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-2)' }} />
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()}
            placeholder="Caută după email sau nume..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm outline-none"
            style={{ backgroundColor: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)' }}
          />
        </div>
        <button onClick={() => load()} className="px-4 py-2.5 rounded-xl text-sm font-medium cursor-pointer hover:opacity-90"
          style={{ backgroundColor: 'var(--orange)', color: '#fff' }}>
          Caută
        </button>
      </div>

      {loading ? <div className="skeleton h-64 rounded-2xl" /> : (
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          {users.map((u, i) => {
            const p = u.profileElev ?? u.profileAntreprenor;
            const name = p ? `${p.firstName} ${p.lastName}` : u.email;
            return (
              <div key={u.id} className="flex items-center gap-3 px-4 py-3"
                style={{
                  backgroundColor: 'var(--bg-2)',
                  borderBottom: i < users.length - 1 ? '1px solid var(--border)' : 'none',
                }}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{name}</p>
                    {u.isSuspended && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full"
                        style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>Suspendat</span>
                    )}
                  </div>
                  <p className="text-xs truncate" style={{ color: 'var(--text-2)' }}>
                    {u.email} · {u.role} · {u.plan} · {u._count.ideas} idei
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => u.isSuspended ? void handleUnsuspend(u.id) : setSuspendModal({ userId: u.id, name })}
                    disabled={suspending === u.id || deleting === u.id}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium disabled:opacity-50"
                    style={{
                      backgroundColor: u.isSuspended ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                      color: u.isSuspended ? '#22c55e' : '#ef4444',
                    }}>
                    {suspending === u.id ? <Loader2 size={12} className="animate-spin" /> : u.isSuspended ? <CheckCircle size={12} /> : <Ban size={12} />}
                    {u.isSuspended ? 'Activează' : 'Suspendă'}
                  </button>
                  <button
                    onClick={() => setDeleteModal({ userId: u.id, name })}
                    disabled={suspending === u.id || deleting === u.id}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium disabled:opacity-50"
                    style={{ backgroundColor: 'rgba(239,68,68,0.08)', color: '#ef4444' }}
                    title="Șterge cont permanent">
                    {deleting === u.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  </button>
                </div>
              </div>
            );
          })}
          {users.length === 0 && (
            <div className="p-8 text-center" style={{ color: 'var(--text-2)' }}>Niciun utilizator găsit</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Reports moderation
// ─────────────────────────────────────────────

interface Report {
  id: string; contentType: string; contentId: string; reason: string; status: string; createdAt: string;
  reporter: { id: string; profileElev: { firstName: string; lastName: string } | null };
}

const ACTION_LABELS: Record<string, string> = {
  AVERTISMENT: 'Avertisment',
  ELIMINARE_CONTINUT: 'Elimină conținut',
  SUSPENDARE_CONT: 'Suspendă contul',
};

function ReportsPanel() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<string | null>(null);
  const [resolveModal, setResolveModal] = useState<{ reportId: string; action: string } | null>(null);

  const load = () => {
    setLoading(true);
    api.get<{ reports: Report[] }>('/admin/reports').then(({ data }) => setReports(data.reports)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleResolve = async (reportId: string, action: string, reason?: string) => {
    setResolving(reportId);
    await api.post(`/admin/reports/${reportId}/resolve`, { action, reason });
    setResolving(null);
    setResolveModal(null);
    load();
  };

  if (loading) return <div className="skeleton h-64 rounded-2xl" />;

  return (
    <div>
      <ConfirmModal
        open={!!resolveModal}
        title={resolveModal ? (ACTION_LABELS[resolveModal.action] ?? resolveModal.action) : ''}
        description="Această acțiune va fi notificată utilizatorului."
        danger
        confirmLabel="Aplică"
        loading={!!resolving}
        withInput
        inputLabel="Motiv"
        inputPlaceholder="Descrie motivul acțiunii (min. 10 caractere)..."
        inputMinLength={10}
        onConfirm={(reason) => resolveModal && void handleResolve(resolveModal.reportId, resolveModal.action, reason)}
        onCancel={() => setResolveModal(null)}
      />

      <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--text)' }}>
        Rapoarte pending ({reports.length})
      </h2>
      {reports.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2 rounded-2xl"
          style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}>
          <CheckCircle size={32} style={{ color: '#22c55e', opacity: 0.5 }} />
          <p style={{ color: 'var(--text-2)' }}>Niciun raport pending</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => {
            const reporterName = r.reporter.profileElev
              ? `${r.reporter.profileElev.firstName} ${r.reporter.profileElev.lastName}`
              : 'Utilizator';
            return (
              <div key={r.id} className="rounded-2xl p-4" style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                        {r.contentType}
                      </span>
                      <span className="text-xs" style={{ color: 'var(--text-2)' }}>de la {reporterName}</span>
                    </div>
                    <p className="text-sm break-words" style={{ color: 'var(--text)' }}>{r.reason}</p>
                    <p className="text-xs mt-1 break-all" style={{ color: 'var(--text-2)' }}>ID conținut: {r.contentId}</p>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => void handleResolve(r.id, 'DISMISS')}
                    disabled={resolving === r.id}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium disabled:opacity-50"
                    style={{ backgroundColor: 'var(--bg-3)', color: 'var(--text-2)' }}>
                    <XCircle size={12} /> Respinge
                  </button>
                  <button
                    onClick={() => setResolveModal({ reportId: r.id, action: 'AVERTISMENT' })}
                    disabled={resolving === r.id}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium disabled:opacity-50"
                    style={{ backgroundColor: 'rgba(246,166,35,0.1)', color: 'var(--orange)' }}>
                    <AlertTriangle size={12} /> Avertisment
                  </button>
                  <button
                    onClick={() => setResolveModal({ reportId: r.id, action: 'ELIMINARE_CONTINUT' })}
                    disabled={resolving === r.id}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium disabled:opacity-50"
                    style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                    <ShieldOff size={12} /> Elimină conținut
                  </button>
                  <button
                    onClick={() => setResolveModal({ reportId: r.id, action: 'SUSPENDARE_CONT' })}
                    disabled={resolving === r.id}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium disabled:opacity-50"
                    style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
                    <Ban size={12} /> Suspendă cont
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


// ─────────────────────────────────────────────
// Categorii dinamice
// ─────────────────────────────────────────────

interface CategoryItem {
  id: string;
  name: string;
  iconName: string | null;
  order: number;
}

function CategoriiPanel() {
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [openPickerId, setOpenPickerId] = useState<string | null>(null);
  const [iconSearch, setIconSearch] = useState('');
  const [savingIconId, setSavingIconId] = useState<string | null>(null);
  const [catDeleteModal, setCatDeleteModal] = useState<{ name: string } | null>(null);
  const [deletingCat, setDeletingCat] = useState(false);

  const load = () => {
    setLoading(true);
    api.get<CategoryItem[]>('/categories')
      .then(({ data }) => setCategories(data))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    setError('');
    try {
      await api.post('/admin/categories', { name });
      setNewName('');
      invalidateCategoriesCache();
      load();
    } catch (err: unknown) {
      setError((err as ApiError).response?.data?.error ?? 'Eroare la adăugare');
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteConfirm = async (message?: string) => {
    if (!catDeleteModal) return;
    setDeletingCat(true);
    try {
      await api.delete(`/admin/categories/${encodeURIComponent(catDeleteModal.name)}`, {
        data: { message: message || undefined },
      });
      invalidateCategoriesCache();
      setCatDeleteModal(null);
      load();
    } catch (err: unknown) {
      alert((err as ApiError).response?.data?.error ?? 'Eroare la ștergere');
    } finally {
      setDeletingCat(false);
    }
  };

  const handleSetIcon = async (catId: string, iconName: string | null) => {
    setSavingIconId(catId);
    try {
      await api.patch(`/admin/categories/${catId}/icon`, { iconName });
      setCategories((prev) =>
        prev.map((c) => c.id === catId ? { ...c, iconName } : c),
      );
      invalidateCategoriesCache();
      setOpenPickerId(null);
    } catch {
      alert('Eroare la salvarea iconului');
    } finally {
      setSavingIconId(null);
    }
  };

  return (
    <div>
      <ConfirmModal
        open={!!catDeleteModal}
        title={`Șterge categoria „${catDeleteModal?.name}"`}
        description="Studenții care au idei cu această categorie vor primi o notificare. Poți adăuga un motiv opțional."
        danger
        confirmLabel="Șterge categoria"
        loading={deletingCat}
        withInput
        inputLabel="Motiv (opțional)"
        inputPlaceholder="Ex: categorie prea generală, duplicat etc."
        inputMinLength={0}
        onConfirm={(msg) => void handleDeleteConfirm(msg)}
        onCancel={() => setCatDeleteModal(null)}
      />

      <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--text)' }}>
        Categorii dinamice
      </h2>

      {/* Formular adăugare */}
      <form onSubmit={(e) => void handleAdd(e)} className="flex gap-2 mb-6">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nume categorie nouă..."
          minLength={2}
          maxLength={50}
          className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none"
          style={{ backgroundColor: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)' }}
        />
        <button
          type="submit"
          disabled={adding || newName.trim().length < 2}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40"
          style={{ backgroundColor: 'var(--orange)', color: '#fff' }}>
          {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          Adaugă
        </button>
      </form>

      {error && (
        <div className="mb-4 px-3 py-2.5 rounded-xl text-sm"
          style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}>
          {error}
        </div>
      )}

      {/* Lista categorii */}
      {loading ? (
        <div className="skeleton h-48 rounded-2xl" />
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          {categories.length === 0 ? (
            <div className="p-8 text-center" style={{ color: 'var(--text-2)' }}>Nicio categorie definită</div>
          ) : (
            categories.map((cat, i) => {
              const CurrentIcon = resolveIcon(cat.iconName);
              const pickerOpen = openPickerId === cat.id;
              return (
                <div key={cat.id} style={{ borderBottom: i < categories.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  {/* Rând categorie */}
                  <div
                    className="flex items-center gap-3 px-4 py-3"
                    style={{ backgroundColor: 'var(--bg-2)' }}>
                    {/* Icon curent */}
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{
                        backgroundColor: cat.iconName ? 'rgba(246,166,35,0.1)' : 'var(--bg-3)',
                        border: `1px solid ${cat.iconName ? 'rgba(246,166,35,0.25)' : 'var(--border)'}`,
                      }}>
                      <CurrentIcon
                        size={15}
                        style={{ color: cat.iconName ? 'var(--orange)' : 'var(--text-2)' }}
                      />
                    </div>

                    {/* Nume */}
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{cat.name}</span>
                      {!cat.iconName && (
                        <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full"
                          style={{ backgroundColor: 'rgba(246,166,35,0.1)', color: 'var(--orange)' }}>
                          fără icon
                        </span>
                      )}
                    </div>

                    {/* Buton schimbă icon */}
                    <button
                      onClick={() => { setOpenPickerId(pickerOpen ? null : cat.id); setIconSearch(''); }}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium"
                      style={{ backgroundColor: pickerOpen ? 'rgba(246,166,35,0.12)' : 'var(--bg-3)', color: pickerOpen ? 'var(--orange)' : 'var(--text-2)', border: '1px solid var(--border)' }}>
                      {savingIconId === cat.id ? <Loader2 size={11} className="animate-spin" /> : <Pencil size={11} />}
                      Icon
                    </button>

                    {/* Buton șterge */}
                    <button
                      onClick={() => setCatDeleteModal({ name: cat.name })}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium"
                      style={{ backgroundColor: 'rgba(239,68,68,0.08)', color: '#ef4444' }}
                      title={`Șterge categoria ${cat.name}`}>
                      <Trash2 size={12} />
                    </button>
                  </div>

                  {/* Icon picker (inline, se deschide sub rând) */}
                  {pickerOpen && (
                    <div
                      className="px-4 py-3"
                      style={{ backgroundColor: 'var(--bg-3)', borderTop: '1px solid var(--border)' }}>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <p className="text-xs font-semibold" style={{ color: 'var(--text-2)' }}>
                          Alege iconul pentru „{cat.name}":
                        </p>
                        <button
                          type="button"
                          onClick={() => { setOpenPickerId(null); setIconSearch(''); }}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium shrink-0 transition-colors"
                          style={{ backgroundColor: 'var(--bg-4)', color: 'var(--text-2)', border: '1px solid var(--border)' }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text)')}
                          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-2)')}>
                          <X size={12} /> Închide
                        </button>
                      </div>

                      {/* Căutare iconițe */}
                      <div className="relative mb-2.5">
                        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-2)' }} />
                        <input
                          type="text"
                          value={iconSearch}
                          onChange={(e) => setIconSearch(e.target.value)}
                          placeholder="Caută iconiță (ex: mâncare, sport, tech)..."
                          className="w-full pl-8 pr-3 py-2 rounded-lg text-xs"
                          style={{ backgroundColor: 'var(--bg-4)', border: '1px solid var(--border)', color: 'var(--text)' }}
                        />
                      </div>

                      {(() => {
                        const results = searchIcons(iconSearch);
                        return (
                          <>
                            <div className="flex flex-wrap gap-1.5 max-h-44 overflow-y-auto">
                              {/* Opțiunea fără icon — mereu vizibilă */}
                              <button
                                onClick={() => void handleSetIcon(cat.id, null)}
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-xs border-2 shrink-0"
                                style={{
                                  borderColor: !cat.iconName ? 'var(--orange)' : 'var(--border)',
                                  backgroundColor: !cat.iconName ? 'rgba(246,166,35,0.12)' : 'var(--bg-4)',
                                  color: 'var(--text-2)',
                                }}
                                title="Fără icon">
                                –
                              </button>
                              {results.map((iconName) => {
                                const Icon = ICON_MAP[iconName];
                                const active = cat.iconName === iconName;
                                return (
                                  <button
                                    key={iconName}
                                    onClick={() => void handleSetIcon(cat.id, iconName)}
                                    className="w-8 h-8 rounded-lg flex items-center justify-center border-2 transition-colors shrink-0"
                                    style={{
                                      borderColor: active ? 'var(--orange)' : 'transparent',
                                      backgroundColor: active ? 'rgba(246,166,35,0.12)' : 'var(--bg-4)',
                                    }}
                                    title={iconName}
                                    onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-3)'; }}
                                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = active ? 'rgba(246,166,35,0.12)' : 'var(--bg-4)'; }}>
                                    <Icon size={15} style={{ color: active ? 'var(--orange)' : 'var(--text-2)' }} />
                                  </button>
                                );
                              })}
                            </div>
                            {results.length === 0 && (
                              <p className="text-xs text-center py-3" style={{ color: 'var(--text-2)' }}>
                                Nicio iconiță găsită pentru „{iconSearch}"
                              </p>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Admin layout cu nav
// ─────────────────────────────────────────────

const navItems = [
  { path: '', label: 'Dashboard', icon: BarChart2 },
  { path: 'users', label: 'Utilizatori', icon: Users },
  { path: 'reports', label: 'Rapoarte', icon: Flag },
  { path: 'categories', label: 'Categorii', icon: Tag },
];

export default function AdminPage() {
  return (
    <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
      {/* Nav admin — vertical pe desktop, bară orizontală scrollabilă pe mobil/tabletă */}
      <div className="w-full lg:w-48 shrink-0">
        <p className="text-xs font-semibold uppercase tracking-wide mb-3 px-2 hidden lg:block" style={{ color: 'var(--text-2)' }}>Admin</p>
        <nav className="flex lg:flex-col gap-1.5 lg:gap-0.5 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0">
          {navItems.map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={`/admin${path ? `/${path}` : ''}`}
              end={!path}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${isActive ? 'font-semibold' : ''}`
              }
              style={({ isActive }) => ({
                backgroundColor: isActive ? 'rgba(246,166,35,0.12)' : 'transparent',
                color: isActive ? 'var(--orange)' : 'var(--text-2)',
              })}>
              <Icon size={15} /> {label}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Conținut */}
      <div className="flex-1 min-w-0">
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="users" element={<UsersPanel />} />
          <Route path="reports" element={<ReportsPanel />} />
          <Route path="categories" element={<CategoriiPanel />} />
        </Routes>
      </div>
    </div>
  );
}
