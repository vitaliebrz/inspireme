import { useState, useEffect } from 'react';
import { Routes, Route, NavLink, useNavigate } from 'react-router-dom';
import {
  BarChart2, Users, Flag, ShieldOff, Loader2, Search,
  CheckCircle, XCircle, AlertTriangle, Ban,
} from 'lucide-react';
import { api } from '../../lib/api';

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

  const load = (s = search) => {
    setLoading(true);
    api.get<{ users: AdminUser[] }>(`/admin/users${s ? `?search=${encodeURIComponent(s)}` : ''}`)
      .then(({ data }) => setUsers(data.users))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleSuspend = async (userId: string, isSuspended: boolean) => {
    if (!isSuspended) {
      const reason = prompt('Motiv suspendare (minim 10 caractere):');
      if (!reason || reason.trim().length < 10) return;
      setSuspending(userId);
      await api.post(`/admin/users/${userId}/suspend`, { reason });
    } else {
      setSuspending(userId);
      await api.post(`/admin/users/${userId}/unsuspend`);
    }
    setSuspending(null);
    load();
  };

  return (
    <div>
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
        <button onClick={() => load()} className="px-4 py-2.5 rounded-xl text-sm font-medium"
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
                <button
                  onClick={() => void handleSuspend(u.id, u.isSuspended)}
                  disabled={suspending === u.id}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium disabled:opacity-50"
                  style={{
                    backgroundColor: u.isSuspended ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                    color: u.isSuspended ? '#22c55e' : '#ef4444',
                  }}>
                  {suspending === u.id ? <Loader2 size={12} className="animate-spin" /> : u.isSuspended ? <CheckCircle size={12} /> : <Ban size={12} />}
                  {u.isSuspended ? 'Activează' : 'Suspendă'}
                </button>
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

function ReportsPanel() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api.get<{ reports: Report[] }>('/admin/reports').then(({ data }) => setReports(data.reports)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleResolve = async (reportId: string, action: string, targetUserId?: string) => {
    let reason: string | undefined;
    if (action !== 'DISMISS') {
      reason = prompt(`Motiv pentru acțiunea "${action}":`) ?? undefined;
      if (!reason || reason.trim().length < 10) return;
    }
    setResolving(reportId);
    await api.post(`/admin/reports/${reportId}/resolve`, { action, targetUserId, reason });
    setResolving(null);
    load();
  };

  if (loading) return <div className="skeleton h-64 rounded-2xl" />;

  return (
    <div>
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
                    <p className="text-sm" style={{ color: 'var(--text)' }}>{r.reason}</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-2)' }}>ID conținut: {r.contentId}</p>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => void handleResolve(r.id, 'DISMISS')} disabled={resolving === r.id}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium disabled:opacity-50"
                    style={{ backgroundColor: 'var(--bg-3)', color: 'var(--text-2)' }}>
                    <XCircle size={12} /> Respinge
                  </button>
                  <button onClick={() => void handleResolve(r.id, 'AVERTISMENT')} disabled={resolving === r.id}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium disabled:opacity-50"
                    style={{ backgroundColor: 'rgba(246,166,35,0.1)', color: 'var(--orange)' }}>
                    <AlertTriangle size={12} /> Avertisment
                  </button>
                  <button onClick={() => void handleResolve(r.id, 'ELIMINARE_CONTINUT')} disabled={resolving === r.id}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium disabled:opacity-50"
                    style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                    <ShieldOff size={12} /> Elimină conținut
                  </button>
                  <button onClick={() => void handleResolve(r.id, 'SUSPENDARE_CONT')} disabled={resolving === r.id}
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
// Admin layout cu nav
// ─────────────────────────────────────────────

const navItems = [
  { path: '', label: 'Dashboard', icon: BarChart2 },
  { path: 'users', label: 'Utilizatori', icon: Users },
  { path: 'reports', label: 'Rapoarte', icon: Flag },
];

export default function AdminPage() {
  const navigate = useNavigate();

  return (
    <div className="flex gap-6">
      {/* Sidebar admin */}
      <div className="w-48 shrink-0">
        <p className="text-xs font-semibold uppercase tracking-wide mb-3 px-2" style={{ color: 'var(--text-2)' }}>Admin</p>
        <nav className="space-y-0.5">
          {navItems.map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={`/admin${path ? `/${path}` : ''}`}
              end={!path}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${isActive ? 'font-semibold' : ''}`
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
        </Routes>
      </div>
    </div>
  );
}
