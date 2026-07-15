import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock, CheckCheck, BellOff, Loader2, Settings, Bell, X,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useNotifications } from '../../context/NotificationsContext';
import { getNotifLink } from '../../lib/notif-utils';
import type { Notification } from '../../lib/notif-utils';
import { NotifIcon } from '../../components/ui/NotifIcon';
import {
  MESSAGE_SOUND_OPTIONS, NOTIF_SOUND_OPTIONS,
  getSoundPref, setSoundPref, previewSound,
} from '../../lib/sounds';

// ── Setări notificări (localStorage) ─────────────────────────────────────
interface NotifSettings {
  messages: boolean;
  ideaViews: boolean;
  giveaways: boolean;
  feedback: boolean;
  email: boolean;
}

const DEFAULT_SETTINGS: NotifSettings = {
  messages: true, ideaViews: true, giveaways: true, feedback: true, email: true,
};

function loadSettings(): NotifSettings {
  try {
    const raw = localStorage.getItem('inspireme_notif_settings');
    return raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<NotifSettings>) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

const SETTING_ROWS: { key: keyof NotifSettings; label: string }[] = [
  { key: 'messages',  label: 'Mesaje noi' },
  { key: 'ideaViews', label: 'Vizualizări idee' },
  { key: 'giveaways', label: 'Giveaway-uri' },
  { key: 'feedback',  label: 'Feedback primit' },
  { key: 'email',     label: 'Notificări email' },
];

// ── Filtre ────────────────────────────────────────────────────────────────
type FilterKey = 'all' | 'unread' | 'messages' | 'ideas' | 'giveaway';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all',      label: 'Toate' },
  { key: 'unread',   label: 'Necitite' },
  { key: 'messages', label: 'Mesaje' },
  { key: 'ideas',    label: 'Idei' },
  { key: 'giveaway', label: 'Giveaway' },
];

const IDEAS_TYPES = new Set(['IDEA_FEEDBACK', 'IDEA_STATUS_RESET', 'IDEA_PUBLISHED']);
const MESSAGE_TYPES = new Set(['MESSAGE_NEW', 'GROUP_MESSAGE', 'SUPPORT_MESSAGE', 'CONNECTION_REQUEST', 'CONNECTION_ACCEPTED']);

function matchesFilter(n: Notification, f: FilterKey): boolean {
  if (f === 'unread')   return !n.readAt;
  if (f === 'messages') return MESSAGE_TYPES.has(n.type);
  if (f === 'ideas')    return IDEAS_TYPES.has(n.type);
  if (f === 'giveaway') return n.type.startsWith('GIVEAWAY') || n.type.startsWith('COLLAB');
  return true;
}

// ── Grupare după dată ─────────────────────────────────────────────────────
const GROUP_ORDER = ['Azi', 'Ieri', 'Această săptămână', 'Anterior'];

function getGroup(dt: string): string {
  const d   = new Date(dt);
  const now  = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yday  = new Date(today.getTime() - 86_400_000);
  const nd    = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (nd.getTime() === today.getTime()) return 'Azi';
  if (nd.getTime() === yday.getTime())  return 'Ieri';
  if (nd >= new Date(today.getTime() - 7 * 86_400_000)) return 'Această săptămână';
  return 'Anterior';
}

function notifTime(dt: string): string {
  const d    = new Date(dt);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60)    return 'acum';
  if (diff < 3600)  return `acum ${Math.floor(diff / 60)} min`;
  if (diff < 86400) {
    const h = Math.floor(diff / 3600);
    return `acum ${h} ${h === 1 ? 'oră' : 'ore'}`;
  }
  const time  = d.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
  const today = new Date();
  const nd    = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const yday  = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (nd.getTime() === yday.getTime()) return `Ieri ${time}`;
  return d.toLocaleDateString('ro-RO', { day: '2-digit', month: 'short' }) + ' ' + time;
}

// ── Toggle component ──────────────────────────────────────────────────────
function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className="relative shrink-0 transition-colors"
      style={{ width: 40, height: 20, borderRadius: 9999, backgroundColor: on ? 'var(--orange)' : 'var(--bg-4)' }}
      role="switch"
      aria-checked={on}
    >
      <span
        className="absolute rounded-full transition-transform"
        style={{
          width: 16, height: 16, top: 2, left: 2,
          backgroundColor: '#fff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
          transform: on ? 'translateX(20px)' : 'translateX(0)',
        }}
      />
    </button>
  );
}

// ── Pagina ────────────────────────────────────────────────────────────────
export default function NotificationsPage() {
  const navigate = useNavigate();
  const { notifications: ctxNotifications, markOne: ctxMarkOne, refresh } = useNotifications();
  const [notifications, setNotifications] = useState<Notification[]>(ctxNotifications);
  const [loading, setLoading] = useState(ctxNotifications.length === 0);
  const [markingAll, setMarkingAll] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<NotifSettings>(loadSettings);
  const [msgSound, setMsgSound]     = useState(() => getSoundPref('message'));
  const [notifSound, setNotifSound] = useState(() => getSoundPref('notification'));
  const [requestActions, setRequestActions] = useState<Record<string, string>>({});

  // Sincronizează cu context-ul (include notificările noi venite prin socket)
  useEffect(() => {
    setNotifications(ctxNotifications);
    if (ctxNotifications.length > 0) setLoading(false);
  }, [ctxNotifications]);

  // Fetch inițial dacă context-ul e gol (prima încărcare)
  useEffect(() => {
    if (ctxNotifications.length === 0) {
      setLoading(true);
      refresh().finally(() => setLoading(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.readAt).length, [notifications]);
  const filtered    = useMemo(() => notifications.filter((n) => matchesFilter(n, filter)), [notifications, filter]);
  const grouped     = useMemo(() => {
    const map = new Map<string, Notification[]>();
    for (const n of filtered) {
      const g = getGroup(n.createdAt);
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(n);
    }
    return GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({ label: g, items: map.get(g)! }));
  }, [filtered]);

  const updateSetting = (key: keyof NotifSettings, value: boolean) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    localStorage.setItem('inspireme_notif_settings', JSON.stringify(next));
  };

  const handleRead = async (notif: Notification) => {
    if (!notif.readAt) {
      api.patch(`/notifications/${notif.id}/read`).catch(() => {});
      ctxMarkOne(notif.id); // actualizează context → pagina se re-randează automat
    }
    const link = getNotifLink(notif);
    if (link) navigate(link);
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
      api.patch(`/notifications/${notifId}/read`).catch(() => {});
      ctxMarkOne(notifId);
      setRequestActions((prev) => ({ ...prev, [notifId]: action === 'ACCEPTED' ? 'accepted' : 'refused' }));
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Eroare. Încearcă din nou.';
      console.error('[ConnectionAction] EROARE:', msg, err);
      setRequestActions((prev) => ({ ...prev, [notifId]: `err:${msg}` }));
    }
  };

  const handleMarkAll = async () => {
    if (!unreadCount || markingAll) return;
    setMarkingAll(true);
    await api.patch('/notifications/read-all');
    await refresh();
    setMarkingAll(false);
  };

  return (
    <div className="max-w-2xl">
      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold" style={{ color: 'var(--text)' }}>Notificări</h1>
          {unreadCount > 0 && (
            <p className="text-sm mt-0.5" style={{ color: 'var(--orange)' }}>
              ({unreadCount} necitite)
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <button
            onClick={() => void handleMarkAll()}
            disabled={!unreadCount || markingAll}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors disabled:opacity-40"
            style={{ backgroundColor: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text-2)' }}
            onMouseEnter={(e) => { if (unreadCount && !markingAll) e.currentTarget.style.backgroundColor = 'var(--bg-4)'; }}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-3)')}
          >
            {markingAll ? <Loader2 size={12} className="animate-spin" /> : <CheckCheck size={12} />}
            Marchează toate
          </button>
          <button
            onClick={() => setShowSettings((v) => !v)}
            className="p-2 rounded-xl transition-colors"
            style={{
              color: showSettings ? 'var(--orange)' : 'var(--text-2)',
              backgroundColor: showSettings ? 'rgba(246,166,35,0.1)' : 'var(--bg-3)',
            }}
            aria-label="Setări notificări"
          >
            {showSettings ? <X size={16} /> : <Settings size={16} />}
          </button>
        </div>
      </div>

      {/* ── Panou setări ── */}
      {showSettings && (
        <div
          className="rounded-2xl p-4 mb-4"
          style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Bell size={14} style={{ color: 'var(--orange)' }} />
            <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>Setări notificări</p>
          </div>
          <div className="space-y-0">
            {SETTING_ROWS.map(({ key, label }, i) => (
              <div
                key={key}
                className="flex items-center justify-between py-2.5"
                style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}
              >
                <span className="text-sm" style={{ color: 'var(--text-2)' }}>{label}</span>
                <Toggle on={settings[key]} onChange={(v) => updateSetting(key, v)} />
              </div>
            ))}
          </div>

          {/* ── Sunete ── */}
          <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
            <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Sunete
            </p>

            {/* Sunet mesaje */}
            <div className="mb-3">
              <p className="text-sm mb-2" style={{ color: 'var(--text)' }}>Mesaje noi</p>
              <div className="flex flex-wrap gap-1.5">
                {MESSAGE_SOUND_OPTIONS.map((opt) => {
                  const active = msgSound === opt.id;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => {
                        setMsgSound(opt.id);
                        setSoundPref('message', opt.id);
                        void previewSound('message', opt.id);
                      }}
                      className="px-3 py-1 rounded-full text-xs font-medium transition-colors"
                      style={{
                        backgroundColor: active ? 'var(--orange)' : 'var(--bg-3)',
                        color: active ? '#fff' : 'var(--text-2)',
                        border: `1px solid ${active ? 'var(--orange)' : 'var(--border)'}`,
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Sunet notificări */}
            <div>
              <p className="text-sm mb-2" style={{ color: 'var(--text)' }}>Alte notificări</p>
              <div className="flex flex-wrap gap-1.5">
                {NOTIF_SOUND_OPTIONS.map((opt) => {
                  const active = notifSound === opt.id;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => {
                        setNotifSound(opt.id);
                        setSoundPref('notification', opt.id);
                        void previewSound('notification', opt.id);
                      }}
                      className="px-3 py-1 rounded-full text-xs font-medium transition-colors"
                      style={{
                        backgroundColor: active ? 'var(--orange)' : 'var(--bg-3)',
                        color: active ? '#fff' : 'var(--text-2)',
                        border: `1px solid ${active ? 'var(--orange)' : 'var(--border)'}`,
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Filtre pill ── */}
      <div className="flex flex-wrap gap-2 mb-4">
        {FILTERS.map(({ key, label }) => {
          const active = filter === key;
          return (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors"
              style={{
                backgroundColor: active ? 'var(--orange)' : 'var(--bg-3)',
                border: `1px solid ${active ? 'var(--orange)' : 'var(--border)'}`,
                color: active ? '#fff' : 'var(--text-2)',
              }}
            >
              {label}
              {key === 'unread' && unreadCount > 0 && (
                <span
                  className="px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                  style={{
                    backgroundColor: active ? 'rgba(255,255,255,0.25)' : 'var(--orange)',
                    color: '#fff',
                  }}
                >
                  {unreadCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Lista ── */}
      <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}>
        {loading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-start gap-3 px-2 py-1">
                <div className="skeleton w-9 h-9 rounded-xl shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-3.5 rounded w-3/4" />
                  <div className="skeleton h-3 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <BellOff size={32} style={{ color: 'var(--text-2)', opacity: 0.3 }} />
            <p className="text-sm" style={{ color: 'var(--text-2)' }}>
              {filter === 'unread' ? 'Nicio notificare necitită' : 'Nicio notificare'}
            </p>
          </div>
        ) : (
          grouped.map((group, gi) => (
            <div key={group.label}>
              {/* Section header */}
              <div
                className="px-4 py-2.5"
                style={{
                  backgroundColor: 'var(--bg-3)',
                  borderBottom: '1px solid var(--border)',
                  borderTop: gi > 0 ? '1px solid var(--border)' : 'none',
                }}
              >
                <p className="text-xs font-semibold" style={{ color: 'var(--text-2)' }}>{group.label}</p>
              </div>

              {group.items.map((notif, i) => {
                const isUnread   = !notif.readAt;
                const link       = getNotifLink(notif);
                const isConnReq  = notif.type === 'CONNECTION_REQUEST';
                const reqAction  = requestActions[notif.id];
                const borderStyle = { borderBottom: i < group.items.length - 1 ? '1px solid var(--border)' : 'none' };
                const bgColor     = isUnread ? 'rgba(246,166,35,0.03)' : 'transparent';

                if (isConnReq) {
                  const d = notif.data as Record<string, string | undefined>;
                  const fromName      = d['fromName'] ?? 'Utilizator';
                  const fromAvatarUrl = d['fromAvatarUrl'] ?? '';
                  const requestId     = d['requestId'] ?? '';
                  const requestStatus = d['requestStatus'] ?? 'PENDING';
                  const fromInitials  = fromName.split(' ').filter(Boolean).map((n) => n[0]).join('').slice(0, 2).toUpperCase();

                  const resolvedAccepted = reqAction === 'accepted' || requestStatus === 'ACCEPTED';
                  const resolvedRefused  = reqAction === 'refused'  || requestStatus === 'REFUSED';
                  const isPending = !resolvedAccepted && !resolvedRefused && reqAction !== 'loading' && !reqAction?.startsWith('err:');

                  return (
                    <div key={notif.id} className="px-4 py-3" style={{ ...borderStyle, backgroundColor: bgColor }}>
                      <div className="flex items-start gap-3">
                        <div className="shrink-0 pt-3.5" style={{ width: 8 }}>
                          {isUnread && <div className="rounded-full" style={{ width: 8, height: 8, backgroundColor: '#3b82f6' }} />}
                        </div>
                        <div
                          className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center shrink-0 text-sm font-bold"
                          style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
                        >
                          {fromAvatarUrl
                            ? <img src={fromAvatarUrl} alt={fromName} className="w-full h-full object-cover" />
                            : fromInitials
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm leading-snug" style={{ color: 'var(--text)', fontWeight: isUnread ? 600 : 500 }}>
                            {fromName}
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--text-2)' }}>
                            {notif.body || 'Vrea să se conecteze cu tine'}
                          </p>
                          <div className="flex items-center gap-1 mt-1">
                            <Clock size={10} style={{ color: 'var(--text-2)', opacity: 0.6 }} />
                            <span className="text-[11px]" style={{ color: 'var(--text-2)', opacity: 0.7 }}>
                              {notifTime(notif.createdAt)}
                            </span>
                          </div>
                          {reqAction === 'loading' ? (
                            <div className="flex items-center gap-1.5 mt-2.5">
                              <Loader2 size={13} className="animate-spin" style={{ color: 'var(--text-2)' }} />
                              <span className="text-xs" style={{ color: 'var(--text-2)' }}>Se procesează...</span>
                            </div>
                          ) : resolvedAccepted ? (
                            <p className="text-xs mt-2.5 font-semibold" style={{ color: '#22c55e' }}>
                              Cerere acceptată ✓
                            </p>
                          ) : resolvedRefused ? (
                            <p className="text-xs mt-2.5" style={{ color: 'var(--text-2)' }}>Cerere refuzată</p>
                          ) : reqAction?.startsWith('err:') ? (
                            <p className="text-xs mt-2.5" style={{ color: '#ef4444' }}>
                              {reqAction.replace('err:', '')}
                            </p>
                          ) : isPending ? (
                            <div className="flex gap-2 mt-2.5">
                              <button
                                onClick={() => handleConnectionAction(notif.id, requestId, 'ACCEPTED')}
                                className="px-4 py-1.5 rounded-xl text-xs font-semibold"
                                style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
                              >
                                Acceptă
                              </button>
                              <button
                                onClick={() => handleConnectionAction(notif.id, requestId, 'REFUSED')}
                                className="px-4 py-1.5 rounded-xl text-xs font-semibold"
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

                return (
                  <button
                    key={notif.id}
                    onClick={() => void handleRead(notif)}
                    className="w-full flex items-start gap-3 px-4 py-3 text-left transition-colors"
                    style={{
                      backgroundColor: bgColor,
                      ...borderStyle,
                      cursor: link ? 'pointer' : 'default',
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.backgroundColor = isUnread ? 'rgba(246,166,35,0.08)' : 'var(--bg-3)')
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.backgroundColor = bgColor)
                    }
                  >
                    <div className="shrink-0 pt-3.5" style={{ width: 8 }}>
                      {isUnread && (
                        <div className="rounded-full" style={{ width: 8, height: 8, backgroundColor: '#3b82f6' }} />
                      )}
                    </div>
                    <NotifIcon type={notif.type} size={16} containerSize={36} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm leading-snug" style={{ color: 'var(--text)', fontWeight: isUnread ? 600 : 500 }}>
                        {notif.title}
                      </p>
                      {notif.body && (
                        // Notificările cu link sunt un preview (se trunchiază); cele fără link
                        // (ex. „categorie eliminată") sunt informative — afișăm mesajul întreg.
                        <p
                          className={`text-xs mt-0.5 ${link ? 'truncate' : 'whitespace-pre-line'}`}
                          style={{ color: 'var(--text-2)' }}
                        >
                          {notif.body}
                        </p>
                      )}
                      <div className="flex items-center gap-1 mt-1">
                        <Clock size={10} style={{ color: 'var(--text-2)', opacity: 0.6 }} />
                        <span className="text-[11px]" style={{ color: 'var(--text-2)', opacity: 0.7 }}>
                          {notifTime(notif.createdAt)}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>

      {!loading && notifications.length > 0 && (
        <p className="text-center text-xs mt-4" style={{ color: 'var(--text-2)', opacity: 0.5 }}>
          Notificările sunt păstrate 90 de zile
        </p>
      )}
    </div>
  );
}
