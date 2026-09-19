import { useState, useEffect, FormEvent } from 'react';
import { Routes, Route, NavLink, Link, useSearchParams, useNavigate } from 'react-router-dom';
import {
  BarChart2, Users, Flag, ShieldOff, Loader2, Search,
  CheckCircle, XCircle, AlertTriangle, Ban, Trash2, Tag, Plus, Pencil, X,
  ScrollText, AlertCircle, Info, ChevronRight, MessageCircle,
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
  const navigate = useNavigate();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [suspending, setSuspending] = useState<string | null>(null);
  const [suspendModal, setSuspendModal] = useState<{ userId: string; name: string } | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ userId: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [contacting, setContacting] = useState<string | null>(null);

  // Adminul deschide chat 1:1 cu userul (din partea userului = chat de suport)
  const handleContact = async (userId: string) => {
    setContacting(userId);
    try {
      const { data } = await api.post<{ ticketId: string }>(`/support/admin/start/${userId}`);
      navigate(`/chat?support=${data.ticketId}`);
    } catch {
      setContacting(null);
    }
  };

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
                  {u.role !== 'ADMIN' && (
                    <button
                      onClick={() => void handleContact(u.id)}
                      disabled={contacting === u.id}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium disabled:opacity-50"
                      style={{ backgroundColor: 'rgba(246,166,35,0.12)', color: 'var(--orange)' }}
                      title="Deschide chat cu utilizatorul (suport)">
                      {contacting === u.id ? <Loader2 size={12} className="animate-spin" /> : <MessageCircle size={12} />}
                      Chat
                    </button>
                  )}
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
  targetName: string | null;
  warningCount: number;
  reportedIdea: { id: string; title: string } | null;
  relatedIdea: { id: string; title: string } | null;
}

interface ResolvedReport extends Report {
  resolvedAt: string | null;
  action: string;
}

interface ReportDetail {
  report: {
    id: string; contentType: string; contentId: string; reason: string; status: string;
    createdAt: string; resolvedAt: string | null; reporterName: string;
  };
  targetUser: { id: string; name: string; role: string; isSuspended: boolean } | null;
  reportedIdea: { id: string; title: string } | null;
  relatedIdea: { id: string; title: string } | null;
  warningCount: number;
  totalActions: number;
  moderationHistory: { level: string; reason: string; adminName: string; createdAt: string }[];
}

const ACTION_LABELS: Record<string, string> = {
  AVERTISMENT: 'Avertisment',
  ELIMINARE_CONTINUT: 'Elimină conținut',
  SUSPENDARE_CONT: 'Suspendă contul',
};

// Etichete + culori pentru acțiunea luată, în istoric
const HISTORY_ACTION: Record<string, { label: string; color: string }> = {
  DISMISS: { label: 'Respins', color: 'var(--text-2)' },
  AVERTISMENT: { label: 'Avertisment', color: 'var(--orange)' },
  ELIMINARE_CONTINUT: { label: 'Conținut eliminat', color: '#ef4444' },
  SUSPENDARE_CONT: { label: 'Cont suspendat', color: '#ef4444' },
};

// Cele două idei implicate într-un raport de duplicat, afișate clar și distinct —
// altfel adminul nu știe la care idee anume s-a raportat duplicatul.
function DuplicateIdeasLinks({
  reportedIdea, relatedIdea,
}: {
  reportedIdea: { id: string; title: string } | null;
  relatedIdea: { id: string; title: string } | null;
}) {
  if (!relatedIdea) return null;
  return (
    <div className="mt-1.5 space-y-1 text-xs">
      <div>
        <span style={{ color: 'var(--text-2)' }}>Idee raportată (posibil copie): </span>
        {reportedIdea ? (
          <Link
            to={`/idea/${reportedIdea.id}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="font-semibold hover:underline"
            style={{ color: '#ef4444' }}
          >
            „{reportedIdea.title}"
          </Link>
        ) : (
          <span style={{ color: 'var(--text-2)' }}>(indisponibilă)</span>
        )}
      </div>
      <div>
        <span style={{ color: 'var(--text-2)' }}>Idee originală indicată: </span>
        <Link
          to={`/idea/${relatedIdea.id}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="font-semibold hover:underline"
          style={{ color: '#22c55e' }}
        >
          „{relatedIdea.title}"
        </Link>
      </div>
    </div>
  );
}

function ReportsPanel() {
  const [tab, setTab] = useState<'pending' | 'history'>('pending');
  const [reports, setReports] = useState<Report[]>([]);
  const [history, setHistory] = useState<ResolvedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);
  const [resolveModal, setResolveModal] = useState<{ reportId: string; action: string } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReportDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const openDetail = (reportId: string) => {
    setDetailId(reportId);
    setDetail(null);
    setLoadingDetail(true);
    api.get<ReportDetail>(`/admin/reports/${reportId}/detail`)
      .then(({ data }) => setDetail(data))
      .finally(() => setLoadingDetail(false));
  };

  const load = () => {
    setLoading(true);
    api.get<{ reports: Report[] }>('/admin/reports').then(({ data }) => setReports(data.reports)).finally(() => setLoading(false));
  };

  const loadHistory = () => {
    setLoadingHistory(true);
    api.get<{ reports: ResolvedReport[] }>('/admin/reports/history')
      .then(({ data }) => { setHistory(data.reports); setHistoryLoaded(true); })
      .finally(() => setLoadingHistory(false));
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (tab === 'history' && !historyLoaded) loadHistory(); }, [tab, historyLoaded]);

  // Deep-link din notificarea „Raport nou de moderat" → deschide direct raportul
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const rid = searchParams.get('report');
    if (rid) {
      openDetail(rid);
      searchParams.delete('report');
      setSearchParams(searchParams, { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleResolve = async (reportId: string, action: string, reason?: string) => {
    setResolving(reportId);
    await api.post(`/admin/reports/${reportId}/resolve`, { action, reason });
    setResolving(null);
    setResolveModal(null);
    setHistoryLoaded(false); // istoricul se reîncarcă (raportul a fost rezolvat)
    window.dispatchEvent(new Event('reports:changed')); // actualizează badge-urile
    load();
  };

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

      {/* Taburi: în așteptare / istoric */}
      <div className="flex gap-2 mb-5">
        {(['pending', 'history'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
            style={{
              backgroundColor: tab === t ? 'var(--orange)' : 'var(--bg-2)',
              color: tab === t ? '#fff' : 'var(--text-2)',
              border: `1px solid ${tab === t ? 'var(--orange)' : 'var(--border)'}`,
            }}
          >
            {t === 'pending' ? `În așteptare (${reports.length})` : 'Istoric'}
          </button>
        ))}
      </div>

      {tab === 'pending' && (loading ? (
        <div className="skeleton h-64 rounded-2xl" />
      ) : reports.length === 0 ? (
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
                <div
                  className="flex items-start justify-between gap-3 mb-3 cursor-pointer"
                  onClick={() => openDetail(r.id)}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                        {r.contentType}
                      </span>
                      <span className="text-xs" style={{ color: 'var(--text-2)' }}>de la {reporterName}</span>
                      {r.targetName && (
                        <span className="text-xs" style={{ color: 'var(--text-2)' }}>· despre <strong style={{ color: 'var(--text)' }}>{r.targetName}</strong></span>
                      )}
                      {r.warningCount > 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                          style={{ backgroundColor: 'rgba(246,166,35,0.15)', color: 'var(--orange)' }}>
                          {r.warningCount} avertisment{r.warningCount === 1 ? '' : 'e'}
                        </span>
                      )}
                    </div>
                    <p className="text-sm break-words" style={{ color: 'var(--text)' }}>{r.reason}</p>
                    <DuplicateIdeasLinks reportedIdea={r.reportedIdea} relatedIdea={r.relatedIdea} />
                    <p className="text-xs mt-1" style={{ color: 'var(--orange)' }}>Vezi detalii →</p>
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
      ))}

      {tab === 'history' && (loadingHistory ? (
        <div className="skeleton h-64 rounded-2xl" />
      ) : history.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2 rounded-2xl"
          style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}>
          <Flag size={32} style={{ color: 'var(--text-2)', opacity: 0.4 }} />
          <p style={{ color: 'var(--text-2)' }}>Niciun raport rezolvat încă</p>
        </div>
      ) : (
        <div className="space-y-3">
          {history.map((r) => {
            const reporterName = r.reporter.profileElev
              ? `${r.reporter.profileElev.firstName} ${r.reporter.profileElev.lastName}`
              : 'Utilizator';
            const act = HISTORY_ACTION[r.action] ?? { label: r.action, color: 'var(--text-2)' };
            return (
              <div
                key={r.id}
                className="rounded-2xl p-4 cursor-pointer transition-colors hover:brightness-110"
                style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}
                onClick={() => openDetail(r.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: 'var(--bg-3)', color: 'var(--text-2)' }}>
                        {r.contentType}
                      </span>
                      <span className="text-xs" style={{ color: 'var(--text-2)' }}>de la {reporterName}</span>
                      {r.targetName && (
                        <span className="text-xs" style={{ color: 'var(--text-2)' }}>· despre <strong style={{ color: 'var(--text)' }}>{r.targetName}</strong></span>
                      )}
                      {r.warningCount > 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                          style={{ backgroundColor: 'rgba(246,166,35,0.15)', color: 'var(--orange)' }}>
                          {r.warningCount} avertisment{r.warningCount === 1 ? '' : 'e'}
                        </span>
                      )}
                    </div>
                    <p className="text-sm break-words" style={{ color: 'var(--text)' }}>{r.reason}</p>
                    <DuplicateIdeasLinks reportedIdea={r.reportedIdea} relatedIdea={r.relatedIdea} />
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-xs font-semibold px-2 py-1 rounded-lg whitespace-nowrap"
                      style={{ backgroundColor: 'var(--bg-3)', color: act.color }}>
                      {act.label}
                    </span>
                    {r.resolvedAt && (
                      <span className="text-[11px]" style={{ color: 'var(--text-2)' }}>
                        {new Date(r.resolvedAt).toLocaleDateString('ro-RO', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {/* Modal detaliu raport — cine a raportat, pe cine, câte avertismente, istoric moderare */}
      {detailId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop-anim"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
          onClick={() => { setDetailId(null); setDetail(null); }}
        >
          <div
            className="w-full max-w-lg rounded-2xl p-5 max-h-[85vh] overflow-y-auto modal-content-anim"
            style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold" style={{ color: 'var(--text)' }}>Detaliu raport</h3>
              <button
                onClick={() => { setDetailId(null); setDetail(null); }}
                className="p-1 rounded-lg transition-colors hover:brightness-125"
                style={{ color: 'var(--text-2)' }}
              >
                <XCircle size={20} />
              </button>
            </div>

            {loadingDetail || !detail ? (
              <div className="skeleton h-40 rounded-2xl" />
            ) : (
              <div className="space-y-4">
                {/* Utilizatorul raportat + avertismente (context autoblocare) */}
                <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--bg-3)' }}>
                  <p className="text-xs mb-1" style={{ color: 'var(--text-2)' }}>Utilizator raportat</p>
                  {detail.targetUser ? (
                    <>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{detail.targetUser.name}</span>
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                          style={{ backgroundColor: 'var(--bg-4)', color: 'var(--text-2)' }}>
                          {detail.targetUser.role}
                        </span>
                        {detail.targetUser.isSuspended && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                            style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
                            SUSPENDAT
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-lg font-bold" style={{ color: detail.warningCount >= 3 ? '#ef4444' : 'var(--orange)' }}>
                          {detail.warningCount}
                        </span>
                        <span className="text-xs" style={{ color: 'var(--text-2)' }}>
                          avertisment{detail.warningCount === 1 ? '' : 'e'} · {detail.totalActions} acțiuni de moderare în total
                        </span>
                      </div>
                      {detail.warningCount >= 3 && (
                        <p className="text-xs mt-2 font-medium" style={{ color: '#ef4444' }}>
                          ⚠ Utilizatorul a atins pragul de autoblocare (3 avertismente).
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm" style={{ color: 'var(--text-2)' }}>Nu s-a putut identifica utilizatorul.</p>
                  )}
                </div>

                {/* Raportul curent */}
                <div>
                  <p className="text-xs mb-1" style={{ color: 'var(--text-2)' }}>
                    Raportat de <strong style={{ color: 'var(--text)' }}>{detail.report.reporterName}</strong> · {detail.report.contentType}
                  </p>
                  <p className="text-sm" style={{ color: 'var(--text)' }}>{detail.report.reason}</p>
                  <p className="text-[11px] mt-1" style={{ color: 'var(--text-2)' }}>
                    {new Date(detail.report.createdAt).toLocaleString('ro-RO')}
                  </p>
                </div>

                {/* Cele două idei ale unui raport de duplicat: raportata vs. originalul */}
                {detail.relatedIdea && (
                  <div className="rounded-xl p-3 space-y-3" style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                    <div>
                      <p className="text-xs mb-1" style={{ color: 'var(--text-2)' }}>Idee raportată (posibilă copie)</p>
                      {detail.reportedIdea ? (
                        <Link
                          to={`/idea/${detail.reportedIdea.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-semibold hover:underline flex items-center gap-1"
                          style={{ color: '#ef4444' }}
                        >
                          {detail.reportedIdea.title} <ChevronRight size={12} />
                        </Link>
                      ) : (
                        <p className="text-sm" style={{ color: 'var(--text-2)' }}>(indisponibilă)</p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs mb-1" style={{ color: 'var(--text-2)' }}>Idee originală indicată de reporter</p>
                      <Link
                        to={`/idea/${detail.relatedIdea.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-semibold hover:underline flex items-center gap-1"
                        style={{ color: '#22c55e' }}
                      >
                        {detail.relatedIdea.title} <ChevronRight size={12} />
                      </Link>
                    </div>
                  </div>
                )}

                {/* Istoric moderare pe utilizator */}
                {detail.moderationHistory.length > 0 && (
                  <div>
                    <p className="text-xs mb-2 font-semibold" style={{ color: 'var(--text-2)' }}>Istoric moderare</p>
                    <div className="space-y-2">
                      {detail.moderationHistory.map((h, i) => {
                        const act = HISTORY_ACTION[h.level] ?? { label: h.level, color: 'var(--text-2)' };
                        return (
                          <div key={i} className="rounded-xl p-3" style={{ backgroundColor: 'var(--bg-3)' }}>
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <span className="text-xs font-semibold" style={{ color: act.color }}>{act.label}</span>
                              <span className="text-[11px]" style={{ color: 'var(--text-2)' }}>
                                {new Date(h.createdAt).toLocaleDateString('ro-RO', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </span>
                            </div>
                            <p className="text-xs" style={{ color: 'var(--text)' }}>{h.reason}</p>
                            <p className="text-[11px] mt-1" style={{ color: 'var(--text-2)' }}>de {h.adminName}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Acțiuni — doar pentru rapoarte în așteptare */}
                {detail.report.status === 'PENDING' && (
                  <div className="flex gap-2 flex-wrap pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                    <button
                      onClick={() => { void handleResolve(detail.report.id, 'DISMISS'); setDetailId(null); setDetail(null); }}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium"
                      style={{ backgroundColor: 'var(--bg-3)', color: 'var(--text-2)' }}>
                      <XCircle size={12} /> Respinge
                    </button>
                    <button
                      onClick={() => { setResolveModal({ reportId: detail.report.id, action: 'AVERTISMENT' }); setDetailId(null); setDetail(null); }}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium"
                      style={{ backgroundColor: 'rgba(246,166,35,0.1)', color: 'var(--orange)' }}>
                      <AlertTriangle size={12} /> Avertisment
                    </button>
                    <button
                      onClick={() => { setResolveModal({ reportId: detail.report.id, action: 'ELIMINARE_CONTINUT' }); setDetailId(null); setDetail(null); }}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium"
                      style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                      <ShieldOff size={12} /> Elimină conținut
                    </button>
                    <button
                      onClick={() => { setResolveModal({ reportId: detail.report.id, action: 'SUSPENDARE_CONT' }); setDetailId(null); setDetail(null); }}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium"
                      style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
                      <Ban size={12} /> Suspendă cont
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


// ─────────────────────────────────────────────
// Loguri — vizualizare erori + flux pe requestId
// ─────────────────────────────────────────────

interface LogEntry {
  level: string;
  levelNum: number;
  time: string;
  msg: string;
  reqId?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  userId?: string | null;
  role?: string | null;
  code?: string;
  ip?: string | null;
  userAgent?: string | null;
  referer?: string | null;
  host?: string | null;
  httpVersion?: string | null;
  responseTime?: number;
  bytes?: number;
  env?: string;
  query?: unknown;
  body?: unknown;
  err?: { type?: string; message?: string; stack?: string };
  raw?: Record<string, unknown>;
}

const LEVEL_STYLE: Record<string, { label: string; color: string; bg: string; Icon: typeof Info }> = {
  error: { label: 'Eroare', color: '#ef4444', bg: 'rgba(239,68,68,0.12)', Icon: AlertCircle },
  warn:  { label: 'Atenție', color: '#f6a623', bg: 'rgba(246,166,35,0.12)', Icon: AlertTriangle },
  info:  { label: 'Info', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', Icon: Info },
  debug: { label: 'Debug', color: '#64748b', bg: 'rgba(100,116,139,0.12)', Icon: Info },
  trace: { label: 'Trace', color: '#64748b', bg: 'rgba(100,116,139,0.12)', Icon: Info },
  fatal: { label: 'Fatal', color: '#ef4444', bg: 'rgba(239,68,68,0.18)', Icon: AlertCircle },
};

const LOG_FILTERS: { key: 'all' | 'error' | 'warn' | 'info'; label: string }[] = [
  { key: 'all', label: 'Toate' },
  { key: 'error', label: 'Erori' },
  { key: 'warn', label: 'Avertismente' },
  { key: 'info', label: 'Info' },
];

function fmtLogTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('ro-RO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function statusColor(code?: number): string {
  if (!code) return 'var(--text-2)';
  if (code >= 500) return '#ef4444';
  if (code >= 400) return '#f6a623';
  if (code >= 200 && code < 300) return '#22c55e';
  return 'var(--text-2)';
}

// ─────────────────────────────────────────────
// Dashboard metrici (stil Grafana) — peste logurile recente
// ─────────────────────────────────────────────

interface LogStats {
  from: string; to: string; bucketMs: number;
  totalLogs: number; totalRequests: number;
  errorCount: number; warnCount: number; errorResponses: number; errorRate: number;
  avgResponseTime: number | null; p95ResponseTime: number | null; p99ResponseTime: number | null;
  series: { t: string; info: number; warn: number; error: number; requests: number; avgMs: number | null }[];
  statusClasses: { '2xx': number; '3xx': number; '4xx': number; '5xx': number };
  topRoutes: { path: string; count: number; errors: number; avgMs: number | null }[];
  topErrors: { msg: string; count: number; lastSeen: string; path: string | null }[];
}

const LEVEL_COLORS = { info: '#3b82f6', warn: '#f6a623', error: '#ef4444' };
const STATUS_COLORS: Record<string, string> = { '2xx': '#22c55e', '3xx': '#3b82f6', '4xx': '#f6a623', '5xx': '#ef4444' };
const WINDOWS: { key: string; label: string }[] = [
  { key: '1h', label: '1 oră' }, { key: '6h', label: '6 ore' }, { key: '24h', label: '24 ore' }, { key: '7d', label: '7 zile' },
];

// Grafic cu bare stivuite (volum loguri pe nivel, în timp)
function StackedBars({ series, bucketMs }: { series: LogStats['series']; bucketMs: number }) {
  const max = Math.max(1, ...series.map((s) => s.info + s.warn + s.error));
  const H = 140;
  const showHour = bucketMs < 6 * 3600_000;
  return (
    <div className="flex items-end gap-[2px]" style={{ height: H }}>
      {series.map((s, i) => {
        const total = s.info + s.warn + s.error;
        const scale = (v: number) => (v / max) * (H - 4);
        const time = new Date(s.t).toLocaleString('ro-RO', showHour ? { hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: 'short' });
        return (
          <div key={i} className="flex-1 flex flex-col justify-end group relative" style={{ minWidth: 3 }}
            title={`${time} · ${total} loguri (${s.error} erori, ${s.warn} avert., ${s.info} info)`}>
            {s.error > 0 && <div style={{ height: scale(s.error), backgroundColor: LEVEL_COLORS.error }} />}
            {s.warn > 0 && <div style={{ height: scale(s.warn), backgroundColor: LEVEL_COLORS.warn }} />}
            {s.info > 0 && <div style={{ height: scale(s.info), backgroundColor: LEVEL_COLORS.info, borderRadius: '2px 2px 0 0' }} />}
          </div>
        );
      })}
    </div>
  );
}

// Grafic linie (timp mediu de răspuns pe bucket)
function ResponseLine({ series }: { series: LogStats['series'] }) {
  const W = 600, H = 120, pad = 4;
  const pts = series.map((s, i) => ({ x: i, y: s.avgMs }));
  const maxY = Math.max(1, ...pts.map((p) => p.y ?? 0));
  const stepX = (W - pad * 2) / Math.max(1, series.length - 1);
  const coords = pts.map((p, i) => p.y == null ? null : {
    x: pad + i * stepX,
    y: pad + (1 - p.y / maxY) * (H - pad * 2),
  });
  const path = coords.reduce((acc, c, i) => {
    if (!c) return acc;
    const prev = coords[i - 1];
    return acc + `${prev ? 'L' : 'M'}${c.x.toFixed(1)},${c.y.toFixed(1)} `;
  }, '');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: H }}>
      <path d={path} fill="none" stroke="var(--orange)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      {coords.map((c, i) => c && <circle key={i} cx={c.x} cy={c.y} r={2} fill="var(--orange)" />)}
    </svg>
  );
}

function KpiTile({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-2xl p-4" style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}>
      <p className="text-xs" style={{ color: 'var(--text-2)' }}>{label}</p>
      <p className="text-2xl font-extrabold mt-1" style={{ color: color ?? 'var(--text)' }}>{value}</p>
      {sub && <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-2)' }}>{sub}</p>}
    </div>
  );
}

function LogMetrics() {
  const [stats, setStats] = useState<LogStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [window_, setWindow] = useState('24h');

  const load = () => {
    setLoading(true);
    api.get<LogStats>(`/admin/logs/stats?window=${window_}`)
      .then(({ data }) => setStats(data))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [window_]);

  if (loading || !stats) {
    return <div className="space-y-3"><div className="skeleton h-24 rounded-2xl" /><div className="skeleton h-40 rounded-2xl" /></div>;
  }

  const statusTotal = Object.values(stats.statusClasses).reduce((a, b) => a + b, 0) || 1;

  return (
    <div className="space-y-5">
      {/* Selector fereastră */}
      <div className="flex flex-wrap gap-2">
        {WINDOWS.map((w) => {
          const active = window_ === w.key;
          return (
            <button key={w.key} onClick={() => setWindow(w.key)}
              className="px-3 py-1.5 rounded-full text-xs font-semibold transition-colors"
              style={{ backgroundColor: active ? 'var(--orange)' : 'var(--bg-3)', border: `1px solid ${active ? 'var(--orange)' : 'var(--border)'}`, color: active ? '#fff' : 'var(--text-2)' }}>
              {w.label}
            </button>
          );
        })}
      </div>

      {/* KPI-uri */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiTile label="Cereri" value={stats.totalRequests.toLocaleString('ro-RO')} sub={`${stats.totalLogs} loguri`} />
        <KpiTile label="Rată erori (5xx)" value={`${(stats.errorRate * 100).toFixed(1)}%`} sub={`${stats.errorResponses} răspunsuri 5xx`} color={stats.errorRate > 0.05 ? '#ef4444' : undefined} />
        <KpiTile label="Timp răspuns p95" value={stats.p95ResponseTime != null ? `${stats.p95ResponseTime} ms` : '—'} sub={stats.avgResponseTime != null ? `medie ${stats.avgResponseTime} ms` : undefined} />
        <KpiTile label="Erori (loguri)" value={stats.errorCount.toLocaleString('ro-RO')} sub={`${stats.warnCount} avertismente`} color={stats.errorCount > 0 ? '#ef4444' : undefined} />
      </div>

      {/* Volum loguri în timp */}
      <div className="rounded-2xl p-4" style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>Volum loguri în timp</p>
          <div className="flex items-center gap-3 text-[11px]">
            {(['error', 'warn', 'info'] as const).map((k) => (
              <span key={k} className="flex items-center gap-1" style={{ color: 'var(--text-2)' }}>
                <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: LEVEL_COLORS[k] }} />
                {k === 'error' ? 'Erori' : k === 'warn' ? 'Avert.' : 'Info'}
              </span>
            ))}
          </div>
        </div>
        <StackedBars series={stats.series} bucketMs={stats.bucketMs} />
      </div>

      {/* Timp de răspuns + Distribuție status */}
      <div className="grid lg:grid-cols-2 gap-3">
        <div className="rounded-2xl p-4" style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}>
          <p className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>Timp de răspuns (medie/bucket)</p>
          <ResponseLine series={stats.series} />
        </div>
        <div className="rounded-2xl p-4" style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}>
          <p className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>Distribuție status</p>
          <div className="space-y-2">
            {(['2xx', '3xx', '4xx', '5xx'] as const).map((cls) => {
              const v = stats.statusClasses[cls];
              const pct = (v / statusTotal) * 100;
              return (
                <div key={cls} className="flex items-center gap-2">
                  <span className="text-xs font-mono w-8" style={{ color: STATUS_COLORS[cls] }}>{cls}</span>
                  <div className="flex-1 h-4 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-3)' }}>
                    <div style={{ width: `${pct}%`, height: '100%', backgroundColor: STATUS_COLORS[cls] }} />
                  </div>
                  <span className="text-xs w-14 text-right" style={{ color: 'var(--text-2)' }}>{v} ({pct.toFixed(0)}%)</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Top rute + Top erori */}
      <div className="grid lg:grid-cols-2 gap-3">
        <div className="rounded-2xl p-4" style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}>
          <p className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>Top rute</p>
          {stats.topRoutes.length === 0 ? <p className="text-xs" style={{ color: 'var(--text-2)' }}>Fără date.</p> : (
            <div className="space-y-1.5">
              {stats.topRoutes.map((r) => (
                <div key={r.path} className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-mono truncate" style={{ color: 'var(--text)' }}>{r.path}</span>
                  <span className="shrink-0" style={{ color: 'var(--text-2)' }}>
                    {r.count}× {r.avgMs != null && `· ${r.avgMs}ms`} {r.errors > 0 && <span style={{ color: '#ef4444' }}>· {r.errors} err</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-2xl p-4" style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}>
          <p className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>Top erori</p>
          {stats.topErrors.length === 0 ? <p className="text-xs" style={{ color: '#22c55e' }}>Nicio eroare 🎉</p> : (
            <div className="space-y-1.5">
              {stats.topErrors.map((e, i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate" style={{ color: 'var(--text)' }} title={e.msg}>{e.msg}</span>
                  <span className="shrink-0 font-bold" style={{ color: '#ef4444' }}>{e.count}×</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LogsPanel() {
  const [view, setView] = useState<'logs' | 'metrics'>('logs');
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [level, setLevel] = useState<'all' | 'error' | 'warn' | 'info'>('all');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [detail, setDetail] = useState<LogEntry | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [flowReqId, setFlowReqId] = useState<string | null>(null);
  const [flow, setFlow] = useState<LogEntry[] | null>(null);
  const [loadingFlow, setLoadingFlow] = useState(false);

  // La deschiderea paginii de loguri → marcăm erorile ca văzute pe SERVER (per admin,
  // sincronizat pe toate dispozitivele). Badge-ul se golește după confirmare.
  useEffect(() => {
    api.post('/admin/logs/seen')
      .then(() => window.dispatchEvent(new Event('logs:seen')))
      .catch(() => {});
  }, []);

  // Debounce 300ms pe căutare (convenție proiect)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (level !== 'all') params.set('level', level);
    if (debounced) params.set('search', debounced);
    params.set('limit', '200');
    api.get<{ entries: LogEntry[] }>(`/admin/logs?${params.toString()}`)
      .then(({ data }) => setEntries(data.entries))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [level, debounced]);

  const openFlow = (reqId: string) => {
    setFlowReqId(reqId);
    setFlow(null);
    setLoadingFlow(true);
    api.get<{ entries: LogEntry[] }>(`/admin/logs/flow/${reqId}`)
      .then(({ data }) => setFlow(data.entries))
      .finally(() => setLoadingFlow(false));
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          {(['metrics', 'logs'] as const).map((v) => {
            const active = view === v;
            return (
              <button key={v} onClick={() => setView(v)}
                className="px-3 py-1.5 rounded-xl text-sm font-semibold transition-colors"
                style={{ backgroundColor: active ? 'var(--orange)' : 'var(--bg-2)', color: active ? '#fff' : 'var(--text-2)', border: `1px solid ${active ? 'var(--orange)' : 'var(--border)'}` }}>
                {v === 'metrics' ? 'Metrici' : 'Loguri'}
              </button>
            );
          })}
        </div>
        {view === 'logs' && (
          <button
            onClick={load}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors"
            style={{ backgroundColor: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text-2)' }}
          >
            <Loader2 size={12} className={loading ? 'animate-spin' : ''} /> Reîmprospătează
          </button>
        )}
      </div>

      {view === 'metrics' && <LogMetrics />}

      {view === 'logs' && (<>
      {/* Filtre nivel */}
      <div className="flex flex-wrap gap-2 mb-3">
        {LOG_FILTERS.map(({ key, label }) => {
          const active = level === key;
          return (
            <button
              key={key}
              onClick={() => setLevel(key)}
              className="px-3 py-1.5 rounded-full text-xs font-semibold transition-colors"
              style={{
                backgroundColor: active ? 'var(--orange)' : 'var(--bg-3)',
                border: `1px solid ${active ? 'var(--orange)' : 'var(--border)'}`,
                color: active ? '#fff' : 'var(--text-2)',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Căutare */}
      <div className="relative mb-3">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-2)' }} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Caută după rută, mesaj, requestId, userId..."
          className="w-full pl-9 pr-3 py-2 rounded-xl text-sm outline-none"
          style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
        />
      </div>

      {/* Statistici rezultate curente (stil Kibana — sumar rapid) */}
      {!loading && entries.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4 text-[11px]">
          {(() => {
            const err = entries.filter((e) => e.levelNum >= 50).length;
            const warn = entries.filter((e) => e.levelNum === 40).length;
            const info = entries.filter((e) => e.levelNum < 40).length;
            const times = entries.map((e) => e.responseTime).filter((t): t is number => typeof t === 'number');
            const avg = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null;
            const stat = (label: string, value: string | number, color: string) => (
              <span className="px-2.5 py-1 rounded-lg font-semibold" style={{ backgroundColor: 'var(--bg-3)', color }}>
                {label}: {value}
              </span>
            );
            return (
              <>
                {stat('Total', entries.length, 'var(--text)')}
                {stat('Erori', err, '#ef4444')}
                {stat('Avertismente', warn, '#f6a623')}
                {stat('Info', info, '#3b82f6')}
                {avg !== null && stat('Timp mediu', `${avg}ms`, 'var(--text-2)')}
              </>
            );
          })()}
        </div>
      )}

      {/* Listă */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="skeleton h-14 rounded-xl" />)}
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <ScrollText size={32} style={{ color: 'var(--text-2)', opacity: 0.3 }} />
          <p className="text-sm" style={{ color: 'var(--text-2)' }}>Niciun log care să corespundă filtrelor.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((e, i) => {
            const st = LEVEL_STYLE[e.level] ?? LEVEL_STYLE['info']!;
            return (
              <div
                key={i}
                onClick={() => { setDetail(e); setShowRaw(false); }}
                className="rounded-xl p-3 cursor-pointer transition-colors hover:brightness-110"
                style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}
              >
                <div className="flex items-start gap-2.5">
                  <div className="flex items-center justify-center rounded-lg shrink-0 mt-0.5"
                    style={{ width: 26, height: 26, backgroundColor: st.bg, color: st.color }}>
                    <st.Icon size={14} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-bold uppercase" style={{ color: st.color }}>{st.label}</span>
                      {e.method && (
                        <span className="text-[11px] font-mono" style={{ color: 'var(--text-2)' }}>{e.method}</span>
                      )}
                      {e.path && (
                        <span className="text-[11px] font-mono break-all" style={{ color: 'var(--text)' }}>{e.path}</span>
                      )}
                      {e.statusCode !== undefined && (
                        <span className="text-[11px] font-bold" style={{ color: statusColor(e.statusCode) }}>{e.statusCode}</span>
                      )}
                    </div>
                    <p className="text-sm mt-0.5 break-words" style={{ color: 'var(--text)' }}>{e.msg || e.err?.message || '—'}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-[11px]" style={{ color: 'var(--text-2)' }}>{fmtLogTime(e.time)}</span>
                      {typeof e.responseTime === 'number' && (
                        <span className="text-[11px]" style={{ color: 'var(--text-2)' }}>· {e.responseTime}ms</span>
                      )}
                      {e.ip && <span className="text-[11px]" style={{ color: 'var(--text-2)' }}>· {e.ip}</span>}
                      {e.userId && <span className="text-[11px]" style={{ color: 'var(--text-2)' }}>· user {e.userId.slice(0, 8)}</span>}
                      <span className="text-[11px] flex items-center gap-0.5" style={{ color: 'var(--orange)' }}>
                        · vezi detalii <ChevronRight size={11} />
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal detaliu log (stil Kibana — document view) */}
      {detail && (() => {
        const st = LEVEL_STYLE[detail.level] ?? LEVEL_STYLE['info']!;
        const fields: [string, string | number | null | undefined][] = [
          ['@timestamp', new Date(detail.time).toLocaleString('ro-RO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })],
          ['level', detail.level],
          ['method', detail.method],
          ['path', detail.path],
          ['statusCode', detail.statusCode],
          ['responseTime', typeof detail.responseTime === 'number' ? `${detail.responseTime} ms` : undefined],
          ['bytes', typeof detail.bytes === 'number' ? `${detail.bytes} B` : undefined],
          ['ip', detail.ip],
          ['host', detail.host],
          ['httpVersion', detail.httpVersion],
          ['referer', detail.referer],
          ['env', detail.env],
          ['userId', detail.userId],
          ['role', detail.role],
          ['reqId', detail.reqId],
          ['code', detail.code],
          ['err.type', detail.err?.type],
          ['err.message', detail.err?.message],
        ].filter(([, v]) => v !== null && v !== undefined && v !== '');
        const jsonBlock = (label: string, val: unknown) =>
          val != null && typeof val === 'object' && Object.keys(val as object).length > 0 ? (
            <div className="mt-3">
              <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--text-2)' }}>{label}</p>
              <pre className="text-[11px] p-2.5 rounded-lg overflow-x-auto whitespace-pre-wrap break-words"
                style={{ backgroundColor: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)' }}>
                {JSON.stringify(val, null, 2)}
              </pre>
            </div>
          ) : null;
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop-anim"
            style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
            onClick={() => setDetail(null)}
          >
            <div
              className="w-full max-w-2xl rounded-2xl p-5 max-h-[85vh] overflow-y-auto modal-content-anim"
              style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}
              onClick={(ev) => ev.stopPropagation()}
            >
              {/* Antet */}
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className="flex items-center justify-center rounded-lg shrink-0 mt-0.5"
                    style={{ width: 30, height: 30, backgroundColor: st.bg, color: st.color }}>
                    <st.Icon size={16} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold uppercase" style={{ color: st.color }}>{st.label}</span>
                      {detail.statusCode !== undefined && (
                        <span className="text-xs font-bold" style={{ color: statusColor(detail.statusCode) }}>{detail.statusCode}</span>
                      )}
                    </div>
                    <p className="text-sm mt-0.5 break-words" style={{ color: 'var(--text)' }}>{detail.msg || detail.err?.message || '—'}</p>
                  </div>
                </div>
                <button
                  onClick={() => setDetail(null)}
                  className="p-1 rounded-lg transition-colors hover:brightness-125 shrink-0"
                  style={{ color: 'var(--text-2)' }}
                >
                  <XCircle size={20} />
                </button>
              </div>

              {/* Tabel câmpuri (stil Kibana) */}
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                {fields.map(([k, v], idx) => (
                  <div
                    key={k}
                    className="flex items-start gap-3 px-3 py-2"
                    style={{
                      backgroundColor: idx % 2 === 0 ? 'var(--bg-3)' : 'var(--bg-2)',
                      borderTop: idx > 0 ? '1px solid var(--border)' : 'none',
                    }}
                  >
                    <span className="text-[11px] font-mono shrink-0" style={{ width: 110, color: 'var(--text-2)' }}>{k}</span>
                    <span className="text-xs font-mono break-all" style={{ color: 'var(--text)' }}>{String(v)}</span>
                  </div>
                ))}
              </div>

              {/* Query / Body / Stack */}
              {jsonBlock('query', detail.query)}
              {jsonBlock('body', detail.body)}
              {detail.err?.stack && (
                <div className="mt-3">
                  <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--text-2)' }}>stack trace</p>
                  <pre className="text-[11px] p-2.5 rounded-lg overflow-x-auto whitespace-pre-wrap break-words"
                    style={{ backgroundColor: 'var(--bg)', color: '#ef4444', border: '1px solid var(--border)' }}>
                    {detail.err.stack}
                  </pre>
                </div>
              )}

              {/* Acțiuni */}
              <div className="flex items-center gap-2 mt-4 flex-wrap">
                {detail.reqId && (
                  <button
                    onClick={() => { const rid = detail.reqId!; setDetail(null); openFlow(rid); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold"
                    style={{ backgroundColor: 'rgba(246,166,35,0.1)', color: 'var(--orange)' }}
                  >
                    Vezi fluxul cererii <ChevronRight size={13} />
                  </button>
                )}
                {detail.raw && (
                  <button
                    onClick={() => setShowRaw((v) => !v)}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold"
                    style={{ backgroundColor: 'var(--bg-3)', color: 'var(--text-2)' }}
                  >
                    {showRaw ? 'Ascunde JSON brut' : 'Arată JSON brut'}
                  </button>
                )}
              </div>
              {showRaw && detail.raw && (
                <pre className="text-[11px] mt-3 p-2.5 rounded-lg overflow-x-auto whitespace-pre-wrap break-words"
                  style={{ backgroundColor: 'var(--bg)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
                  {JSON.stringify(detail.raw, null, 2)}
                </pre>
              )}
            </div>
          </div>
        );
      })()}

      {/* Modal flux cerere */}
      {flowReqId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop-anim"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
          onClick={() => { setFlowReqId(null); setFlow(null); }}
        >
          <div
            className="w-full max-w-2xl rounded-2xl p-5 max-h-[85vh] overflow-y-auto modal-content-anim"
            style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-base font-bold" style={{ color: 'var(--text)' }}>Fluxul cererii</h3>
              <button
                onClick={() => { setFlowReqId(null); setFlow(null); }}
                className="p-1 rounded-lg transition-colors hover:brightness-125"
                style={{ color: 'var(--text-2)' }}
              >
                <XCircle size={20} />
              </button>
            </div>
            <p className="text-[11px] font-mono mb-4 break-all" style={{ color: 'var(--text-2)' }}>requestId: {flowReqId}</p>

            {loadingFlow || !flow ? (
              <div className="skeleton h-40 rounded-2xl" />
            ) : flow.length === 0 ? (
              <p className="text-sm py-6 text-center" style={{ color: 'var(--text-2)' }}>
                Nu s-au găsit intrări pentru această cerere (posibil rotate din fișier).
              </p>
            ) : (
              <>
              {/* Sumar cerere (stil Kibana) — câmpuri detaliate */}
              {(() => {
                const meta = flow.find((e) => e.method || e.ip) ?? flow[0]!;
                const rows: [string, string | number | null | undefined][] = [
                  ['Metodă', meta.method],
                  ['Rută', meta.path],
                  ['Status', meta.statusCode],
                  ['Durată', typeof meta.responseTime === 'number' ? `${meta.responseTime}ms` : undefined],
                  ['Mărime', typeof meta.bytes === 'number' ? `${meta.bytes} B` : undefined],
                  ['IP', meta.ip],
                  ['User', meta.userId],
                  ['Rol', meta.role],
                  ['Host', meta.host],
                  ['HTTP', meta.httpVersion],
                  ['Mediu', meta.env],
                  ['User-Agent', meta.userAgent],
                ].filter(([, v]) => v !== null && v !== undefined && v !== '');
                return (
                  <div className="rounded-xl p-3 mb-4" style={{ backgroundColor: 'var(--bg-3)' }}>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                      {rows.map(([k, v]) => (
                        <div key={k} className="flex flex-col min-w-0">
                          <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-2)' }}>{k}</span>
                          <span className="text-xs font-mono break-all" style={{ color: 'var(--text)' }}>{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
              <div className="relative pl-4">
                {/* Linie verticală timeline */}
                <div className="absolute left-1 top-1 bottom-1 w-px" style={{ backgroundColor: 'var(--border)' }} />
                <div className="space-y-3">
                  {flow.map((e, i) => {
                    const st = LEVEL_STYLE[e.level] ?? LEVEL_STYLE['info']!;
                    return (
                      <div key={i} className="relative">
                        <div className="absolute -left-3.5 top-1.5 rounded-full" style={{ width: 7, height: 7, backgroundColor: st.color }} />
                        <div className="rounded-xl p-3" style={{ backgroundColor: 'var(--bg-3)' }}>
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-[10px] font-bold uppercase" style={{ color: st.color }}>{st.label}</span>
                            {e.statusCode !== undefined && (
                              <span className="text-[11px] font-bold" style={{ color: statusColor(e.statusCode) }}>{e.statusCode}</span>
                            )}
                            <span className="text-[11px]" style={{ color: 'var(--text-2)' }}>{fmtLogTime(e.time)}</span>
                          </div>
                          <p className="text-sm break-words" style={{ color: 'var(--text)' }}>{e.msg || '—'}</p>
                          {e.code && <p className="text-[11px] mt-1 font-mono" style={{ color: 'var(--text-2)' }}>cod: {e.code}</p>}
                          {e.body != null && typeof e.body === 'object' && Object.keys(e.body as object).length > 0 && (
                            <pre className="text-[11px] mt-2 p-2 rounded-lg overflow-x-auto whitespace-pre-wrap break-words"
                              style={{ backgroundColor: 'var(--bg)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
                              {JSON.stringify(e.body, null, 2)}
                            </pre>
                          )}
                          {e.err?.stack && (
                            <pre className="text-[11px] mt-2 p-2 rounded-lg overflow-x-auto whitespace-pre-wrap break-words"
                              style={{ backgroundColor: 'var(--bg)', color: '#ef4444', border: '1px solid var(--border)' }}>
                              {e.err.stack}
                            </pre>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              </>
            )}
          </div>
        </div>
      )}
      </>)}
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
  { path: 'logs', label: 'Loguri', icon: ScrollText },
  { path: 'categories', label: 'Categorii', icon: Tag },
];

export default function AdminPage() {
  const [pendingReports, setPendingReports] = useState(0);
  const [errorLogs, setErrorLogs] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const fetchCounts = () => {
      api.get<{ pending: number }>('/admin/reports/count')
        .then(({ data }) => { if (!cancelled) setPendingReports(data.pending); })
        .catch(() => { /* silențios */ });
      // Badge loguri = erori NEVĂZUTE (momentul „văzut" e per-admin pe server)
      api.get<{ count: number }>('/admin/logs/error-count')
        .then(({ data }) => { if (!cancelled) setErrorLogs(data.count); })
        .catch(() => { /* silențios */ });
    };
    fetchCounts();
    const id = window.setInterval(fetchCounts, 60000);
    window.addEventListener('reports:changed', fetchCounts);
    window.addEventListener('logs:seen', fetchCounts); // după ce adminul deschide logurile
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener('reports:changed', fetchCounts);
      window.removeEventListener('logs:seen', fetchCounts);
    };
  }, []);

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
              {path === 'reports' && pendingReports > 0 && (
                <span
                  className="flex items-center justify-center rounded-full text-[10px] font-bold ml-auto"
                  style={{ minWidth: 18, height: 18, padding: '0 4px', backgroundColor: '#ef4444', color: '#fff' }}
                >
                  {pendingReports > 9 ? '9+' : pendingReports}
                </span>
              )}
              {path === 'logs' && errorLogs > 0 && (
                <span
                  className="flex items-center justify-center rounded-full text-[10px] font-bold ml-auto"
                  style={{ minWidth: 18, height: 18, padding: '0 4px', backgroundColor: '#ef4444', color: '#fff' }}
                >
                  {errorLogs > 99 ? '99+' : errorLogs}
                </span>
              )}
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
          <Route path="logs" element={<LogsPanel />} />
          <Route path="categories" element={<CategoriiPanel />} />
        </Routes>
      </div>
    </div>
  );
}
