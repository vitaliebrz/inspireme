import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, BellOff, CheckCheck, Loader2 } from 'lucide-react';
import { api } from '../../lib/api';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, string>;
  createdAt: string;
  readAt: string | null;
}

const TYPE_ICONS: Record<string, string> = {
  CONNECTION_REQUEST: '🤝',
  CONNECTION_ACCEPTED: '✅',
  MESSAGE_NEW: '💬',
  IDEA_FEEDBACK: '⭐',
  GIVEAWAY_NEW: '🎁',
  GIVEAWAY_WON: '🏆',
  GIVEAWAY_RESULT: '🎯',
  COLLAB_CONFIRM: '🤔',
  COLLAB_CONFIRMED: '🎉',
  IDEA_STATUS_RESET: '🔄',
  SUBSCRIPTION_EXPIRING: '💳',
  ACCOUNT_WARNING: '⚠️',
  SYSTEM: 'ℹ️',
};

function getNotifLink(notif: Notification): string | null {
  const d = notif.data;
  if (notif.type === 'CONNECTION_REQUEST' || notif.type === 'CONNECTION_ACCEPTED') return '/chat';
  if (notif.type === 'MESSAGE_NEW' && d['conversationId']) return `/chat/${d['conversationId']}`;
  if (notif.type === 'IDEA_FEEDBACK' && d['ideaId']) return `/idea/${d['ideaId']}`;
  if (notif.type.startsWith('GIVEAWAY') && d['giveawayId']) return `/giveaways/${d['giveawayId']}`;
  if (notif.type.startsWith('COLLAB') && d['ideaId']) return `/idea/${d['ideaId']}`;
  if (notif.type === 'SUBSCRIPTION_EXPIRING') return '/subscriptions';
  return null;
}

function relativeTime(dt: string) {
  const diff = (Date.now() - new Date(dt).getTime()) / 1000;
  if (diff < 60) return 'acum';
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}z`;
  return new Date(dt).toLocaleDateString('ro-RO', { day: '2-digit', month: 'short' });
}

export default function NotificationsPage() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  useEffect(() => {
    setLoading(true);
    const q = filter === 'unread' ? '?unread=true' : '';
    api.get<{ notifications: Notification[] }>(`/notifications${q}`)
      .then(({ data }) => setNotifications(data.notifications))
      .finally(() => setLoading(false));
  }, [filter]);

  const handleRead = async (notif: Notification) => {
    if (!notif.readAt) {
      await api.patch(`/notifications/${notif.id}/read`);
      setNotifications((prev) =>
        prev.map((n) => n.id === notif.id ? { ...n, readAt: new Date().toISOString() } : n),
      );
    }
    const link = getNotifLink(notif);
    if (link) navigate(link);
  };

  const handleMarkAll = async () => {
    setMarkingAll(true);
    await api.patch('/notifications/read-all');
    setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    setMarkingAll(false);
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Notificări</h1>
          {unreadCount > 0 && (
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-2)' }}>{unreadCount} necitite</p>
          )}
        </div>
        {unreadCount > 0 && (
          <button onClick={() => void handleMarkAll()} disabled={markingAll}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium disabled:opacity-50"
            style={{ backgroundColor: 'var(--bg-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
            {markingAll ? <Loader2 size={13} className="animate-spin" /> : <CheckCheck size={13} />}
            Marchează toate citite
          </button>
        )}
      </div>

      {/* Filtru */}
      <div className="flex gap-2 mb-4">
        {(['all', 'unread'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
            style={{
              backgroundColor: filter === f ? 'rgba(246,166,35,0.12)' : 'var(--bg-2)',
              border: `1.5px solid ${filter === f ? 'var(--orange)' : 'var(--border)'}`,
              color: filter === f ? 'var(--orange)' : 'var(--text-2)',
            }}>
            {f === 'all' ? 'Toate' : 'Necitite'}
          </button>
        ))}
      </div>

      {/* Lista */}
      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-14 rounded-xl" />)}
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <BellOff size={32} style={{ color: 'var(--text-2)', opacity: 0.3 }} />
            <p className="text-sm" style={{ color: 'var(--text-2)' }}>
              {filter === 'unread' ? 'Nicio notificare necitită' : 'Nicio notificare'}
            </p>
          </div>
        ) : (
          <div>
            {notifications.map((notif, i) => {
              const isUnread = !notif.readAt;
              const link = getNotifLink(notif);
              const icon = TYPE_ICONS[notif.type] ?? '🔔';
              return (
                <button
                  key={notif.id}
                  onClick={() => void handleRead(notif)}
                  className="w-full flex items-start gap-3 px-4 py-4 text-left transition-colors"
                  style={{
                    backgroundColor: isUnread ? 'rgba(246,166,35,0.05)' : 'var(--bg-2)',
                    borderBottom: i < notifications.length - 1 ? '1px solid var(--border)' : 'none',
                    cursor: link ? 'pointer' : 'default',
                  }}>
                  {/* Icon + unread dot */}
                  <div className="relative shrink-0">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg"
                      style={{ backgroundColor: 'var(--bg-3)' }}>
                      {icon}
                    </div>
                    {isUnread && (
                      <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: 'var(--orange)' }} />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{notif.title}</p>
                    <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--text-2)' }}>{notif.body}</p>
                  </div>

                  <span className="text-xs shrink-0 ml-2 mt-0.5" style={{ color: 'var(--text-2)' }}>
                    {relativeTime(notif.createdAt)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {notifications.length > 0 && !loading && (
        <p className="text-center text-xs mt-4" style={{ color: 'var(--text-2)' }}>
          <Bell size={11} className="inline mr-1" />
          Notificările sunt păstrate 90 de zile
        </p>
      )}
    </div>
  );
}
