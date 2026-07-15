import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Menu, X, Search, Bell, BellOff, Sun, Moon, LogOut, User,
  Lightbulb, Gift, Loader2,
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationsContext';
import { api } from '../../lib/api';
import { getNotifLink, relativeTime } from '../../lib/notif-utils';
import { NotifIcon } from '../ui/NotifIcon';
import Logo from '../Logo';

interface TopbarProps {
  onMenuClick: () => void;
  sidebarOpen?: boolean;
}

interface SearchResult {
  kind: 'idea' | 'user' | 'giveaway';
  id: string;
  label: string;
  sub?: string;
  role?: string;
}

interface SearchResponse {
  ideas: { id: string; title: string; category: string }[];
  users: { id: string; firstName: string; lastName: string; role: string }[];
  giveaways: { id: string; title: string }[];
}

const ROLE_LABELS: Record<string, string> = {
  ELEV: 'Elev', ANTREPRENOR: 'Antreprenor', ADMIN: 'Admin',
};

const KIND_LABELS: Record<string, string> = {
  idea: 'Idei', user: 'Utilizatori', giveaway: 'Giveaway-uri',
};

export default function Topbar({ onMenuClick, sidebarOpen }: TopbarProps) {
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { notifications, unreadCount, markOne } = useNotifications();

  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [hoveredIdx, setHoveredIdx] = useState(-1);
  const [notifsOpen, setNotifsOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [requestActions, setRequestActions] = useState<Record<string, string>>({});

  const userMenuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const notifsRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!searchOpen && !mobileSearchOpen) return;
    function handler(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
        setMobileSearchOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [searchOpen, mobileSearchOpen]);

  useEffect(() => {
    if (mobileSearchOpen) {
      setTimeout(() => mobileInputRef.current?.focus(), 50);
    }
  }, [mobileSearchOpen]);

  useEffect(() => {
    if (!notifsOpen) return;
    function handler(e: MouseEvent) {
      if (notifsRef.current && !notifsRef.current.contains(e.target as Node)) {
        setNotifsOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [notifsOpen]);

  const doSearch = useCallback(async (q: string) => {
    setSearchLoading(true);
    try {
      const { data } = await api.get<SearchResponse>(`/search?q=${encodeURIComponent(q)}`);
      const items: SearchResult[] = [
        ...data.ideas.map((i) => ({ kind: 'idea' as const, id: i.id, label: i.title, sub: i.category })),
        ...data.users.map((u) => ({ kind: 'user' as const, id: u.id, label: `${u.firstName} ${u.lastName}`, role: u.role })),
        ...data.giveaways.map((g) => ({ kind: 'giveaway' as const, id: g.id, label: g.title })),
      ];
      setSearchResults(items);
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setSearch(v);
    setActiveIdx(-1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!v.trim()) { setSearchResults([]); setSearchLoading(false); return; }
    setSearchLoading(true);
    debounceRef.current = setTimeout(() => void doSearch(v), 300);
  };

  const navigateToResult = (item: SearchResult) => {
    const path =
      item.kind === 'idea' ? `/idea/${item.id}` :
      item.kind === 'user' ? `/profile/${item.id}` :
      `/giveaways/${item.id}`;
    navigate(path);
    setSearch('');
    setSearchResults([]);
    setSearchOpen(false);
    setActiveIdx(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, searchResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault();
      const item = searchResults[activeIdx];
      if (item) navigateToResult(item);
    } else if (e.key === 'Escape') {
      setSearch('');
      setSearchResults([]);
      setSearchOpen(false);
      setMobileSearchOpen(false);
      setActiveIdx(-1);
      setHoveredIdx(-1);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleNotifClick = (id: string, type: string, data: Record<string, string>) => {
    markOne(id);
    api.patch(`/notifications/${id}/read`).catch(() => {});
    const link = getNotifLink({ type, data });
    if (link) navigate(link);
    setNotifsOpen(false);
  };

  const handleConnectionAction = async (notifId: string, requestId: string, action: 'ACCEPTED' | 'REFUSED') => {
    console.log('[ConnectionAction] notifId:', notifId, 'requestId:', requestId, 'action:', action);
    if (!requestId) {
      setRequestActions((prev) => ({ ...prev, [notifId]: 'err:ID cerere lipsă. Reîncarcă pagina.' }));
      return;
    }
    setRequestActions((prev) => ({ ...prev, [notifId]: 'loading' }));
    try {
      await api.patch(`/chat/requests/${requestId}`, { action });
      markOne(notifId);
      api.patch(`/notifications/${notifId}/read`).catch(() => {});
      setRequestActions((prev) => ({ ...prev, [notifId]: action === 'ACCEPTED' ? 'accepted' : 'refused' }));
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Eroare. Încearcă din nou.';
      console.error('[ConnectionAction] EROARE:', msg, err);
      setRequestActions((prev) => ({ ...prev, [notifId]: `err:${msg}` }));
    }
  };

  const showDropdown = searchOpen && search.trim().length >= 2;
  const initials = user
    ? (user.firstName?.[0] ?? user.email[0] ?? '?').toUpperCase() + (user.lastName?.[0] ?? '').toUpperCase()
    : '?';
  const roleLabel = ROLE_LABELS[user?.role ?? ''] ?? user?.role ?? '';
  const planLabel = user?.plan === 'PRO' ? 'Plan Pro' : '';
  const recentNotifs = notifications.slice(0, 10);

  const searchDropdown = showDropdown ? (
    <div
      className="absolute top-full left-0 right-0 mt-1 rounded-2xl shadow-xl z-50 overflow-hidden"
      style={{
        backgroundColor: 'var(--bg-2)',
        border: '1px solid var(--border)',
        maxHeight: 360,
        overflowY: 'auto',
      }}
    >
      {searchLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={20} className="animate-spin" style={{ color: 'var(--text-2)' }} />
        </div>
      ) : searchResults.length === 0 ? (
        <div className="py-8 text-center text-sm" style={{ color: 'var(--text-2)' }}>
          Niciun rezultat pentru „{search}"
        </div>
      ) : (
        searchResults.map((item, idx) => {
          const prevKind = idx > 0 ? searchResults[idx - 1]?.kind : null;
          const showHeader = item.kind !== prevKind;
          return (
            <div key={`${item.kind}-${item.id}`}>
              {showHeader && (
                <p className="px-4 pt-3 pb-1 text-xs font-semibold" style={{ color: 'var(--text-2)' }}>
                  {KIND_LABELS[item.kind]}
                </p>
              )}
              <button
                onMouseDown={(e) => { e.preventDefault(); navigateToResult(item); }}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(-1)}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left"
                style={{
                  backgroundColor: activeIdx === idx || hoveredIdx === idx ? 'var(--bg-3)' : 'transparent',
                  color: 'var(--text)',
                  cursor: 'pointer',
                }}
              >
                {item.kind === 'idea' && <Lightbulb size={14} style={{ color: 'var(--text-2)', flexShrink: 0 }} />}
                {item.kind === 'user' && <User size={14} style={{ color: 'var(--text-2)', flexShrink: 0 }} />}
                {item.kind === 'giveaway' && <Gift size={14} style={{ color: 'var(--text-2)', flexShrink: 0 }} />}
                <span className="truncate flex-1">{item.label}</span>
                {item.sub && (
                  <span className="text-xs shrink-0" style={{ color: 'var(--text-2)' }}>
                    {item.sub}
                  </span>
                )}
              </button>
            </div>
          );
        })
      )}
    </div>
  ) : null;

  return (
    <header
      className="fixed top-0 left-0 right-0 lg:left-60 z-10 flex items-center gap-3 px-4 lg:px-6"
      style={{
        height: 56,
        backgroundColor: 'var(--bg)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {mobileSearchOpen ? (
        /* ── Mobil: search fullscreen ── */
        <>
          <div ref={searchRef} className="flex-1 relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: 'var(--text-2)' }}
            />
            {searchLoading && showDropdown && (
              <Loader2
                size={14}
                className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin pointer-events-none"
                style={{ color: 'var(--text-2)' }}
              />
            )}
            <input
              ref={mobileInputRef}
              type="text"
              value={search}
              onChange={handleSearchChange}
              onKeyDown={handleKeyDown}
              placeholder="Caută idei, elevi, antreprenori..."
              className="w-full pl-9 pr-4 py-2 text-sm rounded-xl outline-none"
              style={{
                backgroundColor: 'var(--bg-3)',
                border: '1px solid var(--orange)',
                color: 'var(--text)',
              }}
              onFocus={() => setSearchOpen(true)}
            />
            {searchDropdown}
          </div>
          <button
            onClick={() => { setMobileSearchOpen(false); setSearch(''); setSearchResults([]); setSearchOpen(false); }}
            className="p-2 rounded-lg hover-nav-item shrink-0"
            style={{ color: 'var(--text-2)' }}
            aria-label="Închide căutare"
          >
            <X size={20} />
          </button>
        </>
      ) : (
        /* ── Normal header ── */
        <>
          {/* Burger — mobil */}
          <button
            onClick={onMenuClick}
            className="lg:hidden p-2 rounded-lg hover-nav-item"
            style={{ color: 'var(--text-2)' }}
            aria-label={sidebarOpen ? 'Închide meniu' : 'Deschide meniu'}
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          {/* Logo — mobil */}
          <Logo height={28} className="lg:hidden mr-2" />

          {/* Search — doar desktop */}
          <div ref={searchRef} className="hidden lg:flex flex-1 max-w-md relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: 'var(--text-2)' }}
            />
            {searchLoading && showDropdown && (
              <Loader2
                size={14}
                className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin pointer-events-none"
                style={{ color: 'var(--text-2)' }}
              />
            )}
            <input
              type="text"
              value={search}
              onChange={handleSearchChange}
              onKeyDown={handleKeyDown}
              placeholder="Caută idei, elevi, antreprenori..."
              className="w-full pl-9 pr-4 py-2 text-sm rounded-xl outline-none"
              style={{
                backgroundColor: 'var(--bg-3)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                transition: 'border-color 150ms ease-out',
              }}
              onFocus={(e) => { setSearchOpen(true); e.currentTarget.style.borderColor = 'var(--orange)'; }}
              onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
            />
            {searchDropdown}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {/* Search icon — doar mobil */}
            <button
              onClick={() => setMobileSearchOpen(true)}
              className="lg:hidden p-2 rounded-lg hover-nav-item"
              style={{ color: 'var(--text-2)' }}
              aria-label="Caută"
            >
              <Search size={20} />
            </button>

            {/* ── Notificări ── */}
            <div className="relative" ref={notifsRef}>
              <button
                onClick={() => setNotifsOpen((v) => !v)}
                className="relative p-2 rounded-xl hover-nav-item"
                style={{ color: 'var(--text-2)' }}
                aria-label="Notificări"
              >
                <Bell size={20} />
                {unreadCount > 0 && (
                  <span
                    className="absolute -top-0.5 -right-0.5 flex items-center justify-center rounded-full text-[10px] font-bold"
                    style={{
                      minWidth: 18,
                      height: 18,
                      padding: '0 4px',
                      backgroundColor: 'var(--orange)',
                      color: '#fff',
                      lineHeight: 1,
                    }}
                  >
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>

              {notifsOpen && (
                <div
                  className="absolute right-0 top-11 w-80 rounded-2xl shadow-xl z-50 flex flex-col"
                  style={{
                    backgroundColor: 'var(--bg-2)',
                    border: '1px solid var(--border)',
                    maxHeight: 420,
                  }}
                >
                  <div
                    className="flex items-center justify-between px-4 py-3 shrink-0"
                    style={{ borderBottom: '1px solid var(--border)' }}
                  >
                    <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Notificări</span>
                    {unreadCount > 0 && (
                      <span className="text-xs" style={{ color: 'var(--text-2)' }}>{unreadCount} necitite</span>
                    )}
                  </div>

                  <div className="overflow-y-auto flex-1">
                    {recentNotifs.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-10 gap-2">
                        <BellOff size={28} style={{ color: 'var(--text-2)', opacity: 0.3 }} />
                        <p className="text-xs" style={{ color: 'var(--text-2)' }}>Nicio notificare</p>
                      </div>
                    ) : (
                      recentNotifs.map((notif, i) => {
                        const isUnread = !notif.readAt;
                        const isConnReq = notif.type === 'CONNECTION_REQUEST';
                        const reqAction = requestActions[notif.id];
                        const borderStyle = i < recentNotifs.length - 1 ? '1px solid var(--border)' : 'none';
                        const bgColor = isUnread ? 'rgba(246,166,35,0.03)' : 'transparent';

                        if (isConnReq) {
                          const d = notif.data as Record<string, string | undefined>;
                          const fromName = d['fromName'] ?? 'Utilizator';
                          const fromAvatarUrl = d['fromAvatarUrl'] ?? '';
                          const requestId = d['requestId'] ?? '';
                          const requestStatus = d['requestStatus'] ?? 'PENDING';
                          const fromInitials = fromName.split(' ').filter(Boolean).map((n) => n[0]).join('').slice(0, 2).toUpperCase();

                          // statusul final: override local > status din DB
                          const resolvedAccepted = reqAction === 'accepted' || requestStatus === 'ACCEPTED';
                          const resolvedRefused  = reqAction === 'refused'  || requestStatus === 'REFUSED';
                          const isPending = !resolvedAccepted && !resolvedRefused && reqAction !== 'loading' && !reqAction?.startsWith('err:');

                          return (
                            <div key={notif.id} className="px-3 py-2.5" style={{ borderBottom: borderStyle, backgroundColor: bgColor }}>
                              <div className="flex items-start gap-2">
                                <div className="shrink-0 pt-3" style={{ width: 8 }}>
                                  {isUnread && <div className="rounded-full" style={{ width: 8, height: 8, backgroundColor: '#3b82f6' }} />}
                                </div>
                                <div
                                  className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center shrink-0 text-xs font-bold"
                                  style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
                                >
                                  {fromAvatarUrl
                                    ? <img src={fromAvatarUrl} alt={fromName} className="w-full h-full object-cover" />
                                    : fromInitials
                                  }
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold leading-snug" style={{ color: 'var(--text)', fontWeight: isUnread ? 600 : 500 }}>
                                    {fromName}
                                  </p>
                                  <p className="text-xs mt-0.5 leading-snug" style={{ color: 'var(--text-2)' }}>
                                    {notif.body || 'Vrea să se conecteze cu tine'}
                                  </p>
                                  <span className="text-[10px] mt-0.5 block" style={{ color: 'var(--text-2)', opacity: 0.7 }}>
                                    {relativeTime(notif.createdAt)}
                                  </span>
                                  {reqAction === 'loading' ? (
                                    <div className="flex items-center gap-1 mt-2">
                                      <Loader2 size={12} className="animate-spin" style={{ color: 'var(--text-2)' }} />
                                      <span className="text-xs" style={{ color: 'var(--text-2)' }}>Se procesează...</span>
                                    </div>
                                  ) : resolvedAccepted ? (
                                    <p className="text-xs mt-2 font-semibold" style={{ color: '#22c55e' }}>
                                      Cerere acceptată ✓
                                    </p>
                                  ) : resolvedRefused ? (
                                    <p className="text-xs mt-2" style={{ color: 'var(--text-2)' }}>Cerere refuzată</p>
                                  ) : reqAction?.startsWith('err:') ? (
                                    <p className="text-xs mt-2" style={{ color: '#ef4444' }}>
                                      {reqAction.replace('err:', '')}
                                    </p>
                                  ) : isPending ? (
                                    <div className="flex gap-2 mt-2">
                                      <button
                                        onClick={() => handleConnectionAction(notif.id, requestId, 'ACCEPTED')}
                                        className="flex-1 text-xs py-1 rounded-lg font-semibold"
                                        style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
                                      >
                                        Acceptă
                                      </button>
                                      <button
                                        onClick={() => handleConnectionAction(notif.id, requestId, 'REFUSED')}
                                        className="flex-1 text-xs py-1 rounded-lg font-semibold"
                                        style={{ backgroundColor: 'var(--bg-3)', color: 'var(--text-2)', border: '1px solid var(--border)' }}
                                      >
                                        Refuză
                                      </button>
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          );
                        }

                        const hasLink = !!getNotifLink(notif);
                        return (
                          <button
                            key={notif.id}
                            onClick={() => handleNotifClick(notif.id, notif.type, notif.data)}
                            disabled={!hasLink}
                            className="w-full flex items-start gap-2 px-3 py-2.5 text-left"
                            style={{
                              backgroundColor: bgColor,
                              borderBottom: borderStyle,
                              cursor: hasLink ? 'pointer' : 'default',
                            }}
                            onMouseEnter={(e) => {
                              if (hasLink) e.currentTarget.style.backgroundColor = isUnread ? 'rgba(246,166,35,0.08)' : 'var(--bg-3)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = bgColor;
                            }}
                          >
                            <div className="shrink-0 pt-3" style={{ width: 8 }}>
                              {isUnread && (
                                <div className="rounded-full" style={{ width: 8, height: 8, backgroundColor: '#3b82f6' }} />
                              )}
                            </div>
                            <NotifIcon type={notif.type} size={14} containerSize={30} />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold leading-snug" style={{ color: 'var(--text)', fontWeight: isUnread ? 600 : 500 }}>
                                {notif.title}
                              </p>
                              {notif.body && (
                                <p
                                  className="text-xs mt-0.5 leading-snug"
                                  style={{
                                    color: 'var(--text-2)',
                                    display: '-webkit-box',
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden',
                                  }}
                                >
                                  {notif.body}
                                </p>
                              )}
                              <span className="text-[10px] mt-0.5 block" style={{ color: 'var(--text-2)', opacity: 0.7 }}>
                                {relativeTime(notif.createdAt)}
                              </span>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>

                  <div className="px-4 py-2.5 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
                    <Link
                      to="/notifications"
                      onClick={() => setNotifsOpen(false)}
                      className="text-xs font-medium hover:underline"
                      style={{ color: 'var(--orange)' }}
                    >
                      Toate notificările →
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* ── User menu ── */}
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setUserMenuOpen((v) => !v)}
                className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center text-sm font-bold transition-opacity hover:opacity-90 shrink-0"
                style={!user?.avatarUrl ? { backgroundColor: 'var(--orange)', color: '#fff' } : undefined}
                aria-label="Meniu utilizator"
              >
                {user?.avatarUrl
                  ? <img src={user.avatarUrl} alt={initials} className="w-full h-full object-cover" />
                  : initials
                }
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
                    {(user?.firstName || user?.lastName) && (
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
                        {[user.firstName, user.lastName].filter(Boolean).join(' ')}
                      </p>
                    )}
                    <p className="text-xs truncate" style={{ color: 'var(--text-2)' }}>
                      {user?.email}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-2)' }}>
                      {roleLabel}{planLabel ? ` · ${planLabel}` : ''}
                    </p>
                  </div>

                  <button
                    onClick={() => { navigate('/profile/me'); setUserMenuOpen(false); }}
                    className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-left hover-nav-item"
                    style={{ color: 'var(--text)' }}
                  >
                    <User size={16} />
                    Profilul meu
                  </button>

                  <button
                    onClick={toggleTheme}
                    className="flex items-center justify-between w-full px-4 py-2.5 text-sm text-left hover-nav-item"
                    style={{ color: 'var(--text)' }}
                    aria-label={theme === 'dark' ? 'Activează light mode' : 'Activează dark mode'}
                  >
                    <span className="flex items-center gap-2">
                      {theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
                      {theme === 'dark' ? 'Dark mode' : 'Light mode'}
                    </span>
                    <span
                      className="relative inline-flex items-center shrink-0"
                      style={{ width: 36, height: 20 }}
                      aria-hidden="true"
                    >
                      <span
                        className="absolute inset-0 rounded-full transition-colors duration-200"
                        style={{ backgroundColor: theme === 'dark' ? 'var(--orange)' : 'var(--bg-4)' }}
                      />
                      <span
                        className="absolute rounded-full shadow transition-transform duration-200"
                        style={{
                          width: 14, height: 14,
                          top: 3, left: 3,
                          backgroundColor: '#fff',
                          transform: theme === 'dark' ? 'translateX(16px)' : 'translateX(0)',
                        }}
                      />
                    </span>
                  </button>

                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-left"
                    style={{ color: '#ef4444' }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.08)')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '')}
                  >
                    <LogOut size={16} />
                    Delogare
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </header>
  );
}
