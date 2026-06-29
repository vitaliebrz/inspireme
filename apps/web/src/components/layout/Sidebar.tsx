import { NavLink } from 'react-router-dom';
import {
  LayoutGrid, MessageSquare, Gift, CreditCard,
  User, Bell, ShieldCheck, Lightbulb, X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
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
  { to: '/subscriptions', label: 'Abonament',     icon: <CreditCard size={18} /> },
  { to: '/notifications', label: 'Notificări',    icon: <Bell size={18} /> },
  { to: '/profile/me',    label: 'Profilul meu',  icon: <User size={18} /> },
  { to: '/admin',         label: 'Admin',         icon: <ShieldCheck size={18} />, roles: ['ADMIN'] },
];

export default function Sidebar({ open, onClose }: SidebarProps) {
  const { user } = useAuth();

  const initials = user
    ? (user.email[0] ?? '?').toUpperCase()
    : '?';

  const visibleItems = navItems.filter(
    (item) => !item.roles || (user && item.roles.includes(user.role)),
  );

  return (
    <>
      {/* Overlay mobil */}
      {open && (
        <div
          className="fixed inset-0 z-20 lg:hidden"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed top-0 left-0 z-30 h-screen flex flex-col transition-transform duration-300 lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{
          width: 240,
          backgroundColor: 'var(--bg-2)',
          borderRight: '1px solid var(--border)',
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
            className="lg:hidden p-1 rounded-lg transition-colors"
            style={{ color: 'var(--text-2)' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-3">
          <ul className="space-y-1">
            {visibleItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      isActive ? 'active-nav' : ''
                    }`
                  }
                  style={({ isActive }) => ({
                    backgroundColor: isActive ? 'rgba(246,166,35,0.12)' : 'transparent',
                    color: isActive ? 'var(--orange)' : 'var(--text-2)',
                  })}
                >
                  {item.icon}
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {/* User info */}
        {user && (
          <div
            className="px-4 py-4 shrink-0"
            style={{ borderTop: '1px solid var(--border)' }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
              >
                {initials}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
                  {user.email}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                    style={{
                      backgroundColor: user.role === 'ADMIN' ? '#ef4444' : 'rgba(246,166,35,0.15)',
                      color: user.role === 'ADMIN' ? '#fff' : 'var(--orange)',
                    }}
                  >
                    {user.role}
                  </span>
                  {user.plan === 'PRO' && (
                    <span
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                      style={{ backgroundColor: 'rgba(246,166,35,0.2)', color: 'var(--orange)' }}
                    >
                      PRO
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
