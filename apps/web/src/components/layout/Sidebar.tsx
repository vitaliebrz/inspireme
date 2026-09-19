import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutGrid, MessageSquare, Gift, CreditCard,
  User, Bell, ShieldCheck, Lightbulb, X, Lock,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationsContext';
import { api } from '../../lib/api';
import Logo from '../Logo';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  roles?: ('ELEV' | 'ANTREPRENOR' | 'ADMIN')[];
}

const navItems: NavItem[] = [
  { to: '/feed',          label: 'Feed',          icon: <LayoutGrid size={18} /> },
  { to: '/idea/new',      label: 'Postează idee', icon: <Lightbulb size={18} />, roles: ['ELEV'] },
  { to: '/chat',          label: 'Chat',          icon: <MessageSquare size={18} /> },
  { to: '/giveaways',     label: 'Giveaway-uri',  icon: <Gift size={18} /> },
  { to: '/subscriptions', label: 'Abonament',     icon: <CreditCard size={18} />, roles: ['ELEV', 'ANTREPRENOR'] },
  { to: '/notifications', label: 'Notificări',    icon: <Bell size={18} /> },
  { to: '/profile/me',    label: 'Profilul meu',  icon: <User size={18} /> },
  { to: '/admin',         label: 'Admin',         icon: <ShieldCheck size={18} />, roles: ['ADMIN'] },
];

const ROLE_LABELS: Record<string, string> = {
  ELEV: 'Elev', ANTREPRENOR: 'Antreprenor', ADMIN: 'Admin',
};

export default function Sidebar({ open, onClose }: SidebarProps) {
  const { user } = useAuth();
  const { unreadMessages, unreadCount } = useNotifications();

  // Limita de idei la planul Gratuit (1 idee). Blocăm butonul „Postează idee"
  // când e atinsă. Numărul se reîmprospătează la evenimentul „ideas:changed"
  // emis la creare/ștergere de idee (fără fetch la fiecare navigare).
  const isFreeElev = user?.role === 'ELEV' && user?.plan === 'GRATUIT';
  const [ideaCount, setIdeaCount] = useState<number | null>(null);

  useEffect(() => {
    if (!isFreeElev) { setIdeaCount(null); return; }
    let cancelled = false;
    const fetchCount = () => {
      api.get<{ ideas: unknown[] }>('/ideas/me')
        .then(({ data }) => { if (!cancelled) setIdeaCount(data.ideas.length); })
        .catch(() => { /* silențios — nu blocăm UI la eroare de rețea */ });
    };
    fetchCount();
    window.addEventListener('ideas:changed', fetchCount);
    return () => { cancelled = true; window.removeEventListener('ideas:changed', fetchCount); };
  }, [isFreeElev]);

  const postLimitReached = isFreeElev && ideaCount !== null && ideaCount >= 1;

  // Rapoarte în așteptare (doar admin) — badge pe butonul „Admin".
  // Poll la 60s + reîmprospătare la evenimentul „reports:changed" (după rezolvare).
  const isAdmin = user?.role === 'ADMIN';
  const [pendingReports, setPendingReports] = useState(0);

  useEffect(() => {
    if (!isAdmin) { setPendingReports(0); return; }
    let cancelled = false;
    const fetchCount = () => {
      api.get<{ pending: number }>('/admin/reports/count')
        .then(({ data }) => { if (!cancelled) setPendingReports(data.pending); })
        .catch(() => { /* silențios */ });
    };
    fetchCount();
    const id = window.setInterval(fetchCount, 60000);
    window.addEventListener('reports:changed', fetchCount);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener('reports:changed', fetchCount);
    };
  }, [isAdmin]);

  const initials = user
    ? (user.firstName?.[0] ?? user.email[0] ?? '?').toUpperCase() + (user.lastName?.[0] ?? '').toUpperCase()
    : '?';

  const visibleItems = navItems.filter(
    (item) => !item.roles || (user && item.roles.includes(user.role)),
  );

  return (
    <>
      {/* Overlay mobil */}
      {open && (
        <div
          className="fixed inset-0 z-20 lg:hidden modal-backdrop-anim"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed top-0 left-0 z-30 h-dvh flex flex-col lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{
          width: 240,
          backgroundColor: 'var(--bg-2)',
          borderRight: '1px solid var(--border)',
          transition: 'transform 300ms var(--ease-drawer)',
        }}
      >
        {/* Logo */}
        <div
          className="flex items-center justify-between px-5 h-14 shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <Logo height={32} />
          <button
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-lg cursor-pointer"
            style={{ color: 'var(--text-2)' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-3)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <X size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-3">
          <ul className="space-y-1">
            {visibleItems.map((item) => (
              <li key={item.to}>
                {item.to === '/idea/new' && postLimitReached ? (
                  // Limită atinsă (Plan Gratuit): buton blocat cu badge Pro
                  <button
                    type="button"
                    disabled
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium cursor-not-allowed"
                    style={{ color: 'var(--text-2)', opacity: 0.6 }}
                    title="Ai atins limita de 1 idee (Plan Gratuit). Treci la Pro pentru idei nelimitate."
                  >
                    <Lock size={18} />
                    <span className="flex-1 text-left">{item.label}</span>
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                      style={{ backgroundColor: 'rgba(246,166,35,0.15)', color: 'var(--orange)' }}
                    >
                      Pro
                    </span>
                  </button>
                ) : (
                <NavLink
                  to={item.to}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium ${
                      isActive ? 'active-nav' : 'hover-nav-item'
                    }`
                  }
                  style={({ isActive }) => ({
                    color: isActive ? 'var(--orange)' : 'var(--text-2)',
                  })}
                >
                  {item.icon}
                  <span className="flex-1">{item.label}</span>
                  {item.to === '/chat' && unreadMessages > 0 && (
                    <span
                      className="flex items-center justify-center rounded-full text-[10px] font-bold"
                      style={{
                        minWidth: 18, height: 18, padding: '0 4px',
                        backgroundColor: 'var(--orange)', color: '#fff',
                      }}
                    >
                      {unreadMessages > 99 ? '99+' : unreadMessages}
                    </span>
                  )}
                  {item.to === '/notifications' && unreadCount > 0 && (
                    <span
                      className="flex items-center justify-center rounded-full text-[10px] font-bold"
                      style={{
                        minWidth: 18, height: 18, padding: '0 4px',
                        backgroundColor: 'var(--orange)', color: '#fff',
                      }}
                    >
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                  {item.to === '/admin' && pendingReports > 0 && (
                    <span
                      className="flex items-center justify-center rounded-full text-[10px] font-bold"
                      style={{
                        minWidth: 18, height: 18, padding: '0 4px',
                        backgroundColor: '#ef4444', color: '#fff',
                      }}
                    >
                      {pendingReports > 9 ? '9+' : pendingReports}
                    </span>
                  )}
                </NavLink>
                )}
              </li>
            ))}
          </ul>
        </nav>

        {/* User info */}
        {user && (
          <div
            className="px-4 pt-4 shrink-0"
            style={{
              borderTop: '1px solid var(--border)',
              paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center text-sm font-bold shrink-0"
                style={!user.avatarUrl ? { backgroundColor: 'var(--orange)', color: '#fff' } : undefined}
              >
                {user.avatarUrl
                  ? <img src={user.avatarUrl} alt={initials} className="w-full h-full object-cover" />
                  : initials
                }
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
                  {user.firstName && user.lastName
                    ? `${user.firstName} ${user.lastName}`
                    : user.email}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                    style={{
                      backgroundColor: user.role === 'ADMIN' ? '#ef4444' : 'rgba(246,166,35,0.15)',
                      color: user.role === 'ADMIN' ? '#fff' : 'var(--orange)',
                    }}
                  >
                    {ROLE_LABELS[user.role] ?? user.role}
                  </span>
                  {user.plan === 'PRO' && (
                    <span
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                      style={{ backgroundColor: 'rgba(246,166,35,0.2)', color: 'var(--orange)' }}
                    >
                      Pro
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
