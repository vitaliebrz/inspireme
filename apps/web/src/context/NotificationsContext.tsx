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
  unreadByConversation: Record<string, number>;
  unreadByGroup: Record<string, number>;
  unreadBySupport: Record<string, number>;
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
  unreadByConversation: {},
  unreadByGroup: {},
  unreadBySupport: {},
  markOne: () => {},
  markConversation: async () => {},
  markGroup: () => {},
  markSupport: () => {},
  refresh: async () => {},
});

interface NotifCounts {
  total: number;
  messages: number;
  byConversation: Record<string, number>;
  byGroup: Record<string, number>;
  bySupport: Record<string, number>;
}
const EMPTY_COUNTS: NotifCounts = { total: 0, messages: 0, byConversation: {}, byGroup: {}, bySupport: {} };

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [counts, setCounts] = useState<NotifCounts>(EMPTY_COUNTS);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Count-uri exacte din backend (lista e plafonată la 50, deci numerele nu se pot
  // calcula din ea când ai >50 notificări necitite).
  const fetchCounts = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await api.get<NotifCounts>('/notifications/counts');
      setCounts(data);
    } catch { /* silent */ }
  }, [user]);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    try {
      const [{ data }] = await Promise.all([
        api.get<{ notifications: Notification[] }>('/notifications'),
        fetchCounts(),
      ]);
      setNotifications(data.notifications);
    } catch {
      // silent — badge stays stale până la următoarea sincronizare
    }
  }, [user, fetchCounts]);

  // Reîmprospătare count-uri debounced — o rafală de mesaje → 1-2 fetch-uri, nu 100
  const countsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleCountsRefresh = useCallback(() => {
    if (countsDebounceRef.current) clearTimeout(countsDebounceRef.current);
    countsDebounceRef.current = setTimeout(() => { void fetchCounts(); }, 400);
  }, [fetchCounts]);

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
      scheduleCountsRefresh(); // count-urile se resincronizează din backend (debounced)
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

    // Dedup PER MESAJ (nu per conversație): previne sunet dublu când același mesaj vine
    // atât din camera conversației cât și din cea personală, dar lasă mesaje diferite
    // (chiar și rapide) să sune fiecare. Cheia = conversație + timestamp-ul mesajului.
    const recentlySounded = new Set<string>();

    const handleMessageNew = (data: { conversationId: string; message: { senderId: string; createdAt?: string } }) => {
      // Propriul mesaj (ecou din camera conversației) — fără sunet
      if (data.message.senderId === user?.id) return;
      // Dacă expeditorul e pe mute — fără sunet
      try {
        const muted: string[] = JSON.parse(localStorage.getItem('inspireme_muted_users') ?? '[]');
        if (muted.includes(data.message.senderId)) return;
      } catch { /* ignore */ }
      const key = `${data.conversationId}:${data.message.createdAt ?? ''}`;
      if (recentlySounded.has(key)) return;
      recentlySounded.add(key);
      setTimeout(() => recentlySounded.delete(key), 1000);
      // Sunet la orice mesaj primit — inclusiv când ești în chat (fără notificare persistentă)
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
  }, [socket, fetchNotifications, scheduleCountsRefresh, user?.id]);

  // Scădem badge-ul optimist, local, în loc să re-cerem count-urile de la server
  // imediat — un fetchCounts() aici ar putea ajunge înaintea PATCH-ului „citit"
  // (trimis separat, de la locul de apel), aducând înapoi vechiul count necitit
  // și lăsând badge-ul „agățat" pe o valoare greșită permanent.
  const markOne = useCallback((id: string) => {
    setNotifications((prev) => {
      const target = prev.find((n) => n.id === id);
      if (target && !target.readAt) {
        setCounts((c) => ({ ...c, total: Math.max(0, c.total - 1) }));
      }
      return prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n));
    });
  }, []);

  // Scade optimist necititele unei chei din count-uri (ex. la deschiderea unei conversații)
  const clearCountFor = (bucket: 'byConversation' | 'byGroup' | 'bySupport', key: string) => {
    setCounts((c) => {
      const n = c[bucket][key] ?? 0;
      if (n === 0) return c;
      const map = { ...c[bucket] };
      delete map[key];
      return { ...c, total: Math.max(0, c.total - n), messages: Math.max(0, c.messages - n), [bucket]: map };
    });
  };

  const markConversation = useCallback(async (conversationId: string) => {
    setNotifications((prev) =>
      prev.map((n) =>
        !n.readAt && n.type === 'MESSAGE_NEW' && (n.data as Record<string, string>)['conversationId'] === conversationId
          ? { ...n, readAt: new Date().toISOString() }
          : n,
      ),
    );
    clearCountFor('byConversation', conversationId);
    api.patch('/notifications/read-conversation', { conversationId }).then(() => fetchCounts()).catch(() => {});
  }, [fetchCounts]);

  const markGroup = useCallback((groupId: string) => {
    setNotifications((prev) =>
      prev.map((n) =>
        !n.readAt && n.type === 'GROUP_MESSAGE' && (n.data as Record<string, string>)['groupId'] === groupId
          ? { ...n, readAt: new Date().toISOString() }
          : n,
      ),
    );
    clearCountFor('byGroup', groupId);
    api.patch('/notifications/read-conversation', { groupId }).then(() => fetchCounts()).catch(() => {});
  }, [fetchCounts]);

  const markSupport = useCallback((ticketId: string) => {
    setNotifications((prev) =>
      prev.map((n) =>
        !n.readAt && n.type === 'SUPPORT_MESSAGE' && (n.data as Record<string, string>)['ticketId'] === ticketId
          ? { ...n, readAt: new Date().toISOString() }
          : n,
      ),
    );
    clearCountFor('bySupport', ticketId);
    api.patch('/notifications/read-support', { ticketId }).then(() => fetchCounts()).catch(() => {});
  }, [fetchCounts]);

  return (
    <NotificationsContext.Provider value={{
      notifications,
      unreadCount: counts.total,
      unreadMessages: counts.messages,
      unreadByConversation: counts.byConversation,
      unreadByGroup: counts.byGroup,
      unreadBySupport: counts.bySupport,
      markOne, markConversation, markGroup, markSupport, refresh: fetchNotifications,
    }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationsContext);
}
