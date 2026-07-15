import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { api } from '../lib/api';
import { useAuth } from './AuthContext';
import { useSocket } from './SocketContext';
import type { Notification } from '../lib/notif-utils';
import { playMessageSound, playNotificationSound } from '../lib/sounds';

interface NotificationsContextValue {
  notifications: Notification[];
  unreadCount: number;
  unreadMessages: number;
  markOne: (id: string) => void;
  markConversation: (conversationId: string) => Promise<void>;
  markGroup: (groupId: string) => void;
  markSupport: (ticketId: string) => void;
  refresh: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextValue>({
  notifications: [],
  unreadCount: 0,
  unreadMessages: 0,
  markOne: () => {},
  markConversation: async () => {},
  markGroup: () => {},
  markSupport: () => {},
  refresh: async () => {},
});

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await api.get<{ notifications: Notification[] }>('/notifications');
      setNotifications(data.notifications);
    } catch {
      // silent — badge stays stale până la următoarea sincronizare
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      return;
    }
    void fetchNotifications();
    // Fallback de siguranță — notificările sosesc prin push (socket),
    // polling-ul rar acoperă doar perioadele de deconectare
    intervalRef.current = setInterval(() => void fetchNotifications(), 5 * 60_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [user, fetchNotifications]);

  // Push real-time — server-ul emite 'notification:new' la fiecare createNotification()
  useEffect(() => {
    if (!socket) return;
    const handleNew = (notif: Notification) => {
      setNotifications((prev) => {
        const idx = prev.findIndex((n) => n.id === notif.id);
        if (idx !== -1) {
          const local = prev[idx];
          const updated = [...prev];
          // Dacă userul a citit deja notificarea local, nu o lăsăm să devină necitită
          // din cauza unui update de pe server generat dintr-un race condition (PATCH mark-as-read
          // nu a ajuns la server înainte ca mesajul nou să actualizeze notificarea veche).
          // Un mesaj real nou → crează notificare NOUĂ cu ID diferit, nu update pe cea citită.
          if (local.readAt && !notif.readAt) {
            updated[idx] = { ...notif, readAt: local.readAt };
          } else {
            updated[idx] = notif;
          }
          return updated;
        }
        // Sunet doar pentru notificări non-mesaj — mesajele sunt acoperite de message:new
        if (notif.type !== 'MESSAGE_NEW') playNotificationSound();
        // Auto-markare ca citit dacă userul e deja în acea conversație
        if (notif.type === 'MESSAGE_NEW') {
          const d = notif.data as Record<string, string>;
          const convId = d['conversationId'];
          if (convId && window.location.pathname === `/chat/${convId}`) {
            return [{ ...notif, readAt: new Date().toISOString() }, ...prev];
          }
        }
        return [notif, ...prev];
      });
    };

    // Debounce per conversație — previne sunet dublu când evenimentul vine atât
    // din conversation room cât și din personal room (după fix-ul backend)
    const recentlySounded = new Set<string>();

    const handleMessageNew = (data: { conversationId: string; message: { senderId: string } }) => {
      // Dacă userul e deja în conversația respectivă — fără sunet
      if (window.location.pathname === `/chat/${data.conversationId}`) return;
      // Dacă expeditorul e pe mute — fără sunet
      try {
        const muted: string[] = JSON.parse(localStorage.getItem('inspireme_muted_users') ?? '[]');
        if (muted.includes(data.message.senderId)) return;
      } catch { /* ignore */ }
      // Dedup: dacă am sunat deja pentru această conversație în ultimele 300ms, ignorăm
      if (recentlySounded.has(data.conversationId)) return;
      recentlySounded.add(data.conversationId);
      setTimeout(() => recentlySounded.delete(data.conversationId), 300);
      void playMessageSound();
    };

    socket.on('notification:new', handleNew);
    socket.on('message:new', handleMessageNew);
    // re-sincronizare la reconectare — am putut pierde evenimente cât am fost offline
    socket.on('connect', fetchNotifications);
    return () => {
      socket.off('notification:new', handleNew);
      socket.off('message:new', handleMessageNew);
      socket.off('connect', fetchNotifications);
    };
  }, [socket, fetchNotifications]);

  const markOne = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)),
    );
  }, []);

  const markConversation = useCallback(async (conversationId: string) => {
    setNotifications((prev) =>
      prev.map((n) =>
        !n.readAt && n.type === 'MESSAGE_NEW' && (n.data as Record<string, string>)['conversationId'] === conversationId
          ? { ...n, readAt: new Date().toISOString() }
          : n,
      ),
    );
    api.patch('/notifications/read-conversation', { conversationId }).catch(() => {});
  }, []);

  const markGroup = useCallback((groupId: string) => {
    setNotifications((prev) =>
      prev.map((n) =>
        !n.readAt && n.type === 'GROUP_MESSAGE' && (n.data as Record<string, string>)['groupId'] === groupId
          ? { ...n, readAt: new Date().toISOString() }
          : n,
      ),
    );
    api.patch('/notifications/read-conversation', { groupId }).catch(() => {});
  }, []);

  const markSupport = useCallback((ticketId: string) => {
    setNotifications((prev) =>
      prev.map((n) =>
        !n.readAt && n.type === 'SUPPORT_MESSAGE' && (n.data as Record<string, string>)['ticketId'] === ticketId
          ? { ...n, readAt: new Date().toISOString() }
          : n,
      ),
    );
    api.patch('/notifications/read-support', { ticketId }).catch(() => {});
  }, []);

  const unreadCount = notifications.filter((n) => !n.readAt).length;
  const unreadMessages = notifications.filter(
    (n) => !n.readAt && (n.type === 'MESSAGE_NEW' || n.type === 'GROUP_MESSAGE' || n.type === 'SUPPORT_MESSAGE'),
  ).length;

  return (
    <NotificationsContext.Provider value={{
      notifications, unreadCount, unreadMessages, markOne, markConversation, markGroup, markSupport, refresh: fetchNotifications,
    }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationsContext);
}
