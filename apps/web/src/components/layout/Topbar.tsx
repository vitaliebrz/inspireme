import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, X, Search, Bell, Sun, Moon, LogOut, User } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';

interface TopbarProps {
  onMenuClick: () => void;
  sidebarOpen?: boolean;
}

export default function Topbar({ onMenuClick, sidebarOpen }: TopbarProps) {
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Închide user menu la click în afară
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const initials = user ? (user.email[0] ?? '?').toUpperCase() : '?';

  return (
    <header
      className="fixed top-0 left-0 right-0 lg:left-60 z-10 flex items-center gap-3 px-4 lg:px-6"
      style={{
        height: 56,
        backgroundColor: 'var(--bg)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {/* Burger / X — mobil */}
      <button
        onClick={onMenuClick}
        className="lg:hidden p-2 rounded-lg transition-colors"
        style={{ color: 'var(--text-2)' }}
        aria-label={sidebarOpen ? 'Închide meniu' : 'Deschide meniu'}
      >
        {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Logo — vizibil pe mobile (sidebar-ul e ascuns) */}
      <span
        className="lg:hidden text-base font-extrabold tracking-tight mr-2"
        style={{ color: 'var(--orange)' }}
      >
        InspireMe
      </span>

      {/* Search */}
      <div className="flex-1 max-w-md relative">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: 'var(--text-2)' }}
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Caută idei, elevi, antreprenori..."
          className="w-full pl-9 pr-4 py-2 text-sm rounded-xl transition-all outline-none"
          style={{
            backgroundColor: 'var(--bg-3)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--orange)')}
          onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
        />
      </div>

      <div className="flex items-center gap-2 ml-auto">
        {/* Notificări */}
        <button
          onClick={() => navigate('/notifications')}
          className="relative p-2 rounded-xl transition-colors"
          style={{ color: 'var(--text-2)' }}
          aria-label="Notificări"
        >
          <Bell size={20} />
          {/* Badge notificări — va fi dinamic */}
          <span
            className="absolute top-1 right-1 w-2 h-2 rounded-full"
            style={{ backgroundColor: 'var(--orange)' }}
          />
        </button>

        {/* User menu */}
        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setUserMenuOpen((v) => !v)}
            className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
            aria-label="Meniu utilizator"
          >
            {initials}
          </button>

          {userMenuOpen && (
            <div
              className="absolute right-0 top-11 w-52 rounded-2xl shadow-xl py-2 z-50"
              style={{
                backgroundColor: 'var(--bg-2)',
                border: '1px solid var(--border)',
              }}
            >
              <div className="px-4 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
                <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
                  {user?.email}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-2)' }}>
                  {user?.role} · {user?.plan}
                </p>
              </div>

              <button
                onClick={() => { navigate('/profile/me'); setUserMenuOpen(false); }}
                className="flex items-center gap-2 w-full px-4 py-2.5 text-sm transition-colors text-left"
                style={{ color: 'var(--text)' }}
              >
                <User size={16} />
                Profilul meu
              </button>

              <button
                onClick={toggleTheme}
                className="flex items-center gap-2 w-full px-4 py-2.5 text-sm transition-colors text-left"
                style={{ color: 'var(--text)' }}
                aria-label={theme === 'dark' ? 'Activează light mode' : 'Activează dark mode'}
              >
                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                {theme === 'dark' ? 'Light mode' : 'Dark mode'}
              </button>

              <button
                onClick={handleLogout}
                className="flex items-center gap-2 w-full px-4 py-2.5 text-sm transition-colors text-left"
                style={{ color: '#ef4444' }}
              >
                <LogOut size={16} />
                Delogare
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
