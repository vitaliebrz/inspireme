import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { getAccessToken, refreshAccessToken } from '../lib/api';

const API_URL = (import.meta as unknown as { env: Record<string, string> }).env['VITE_API_URL']
  ?? `${window.location.protocol}//${window.location.hostname}:4000`;

interface SocketContextValue {
  socket: Socket | null;
  connected: boolean;
}

const SocketContext = createContext<SocketContextValue>({ socket: null, connected: false });

// O singură conexiune socket pentru tot site-ul (chat + notificări),
// deschisă cât timp userul e logat — nu câte una per pagină.
export function SocketProvider({ children }: { children: ReactNode }) {
  const { user, authReady } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // Așteptăm ca access token-ul (din memorie) să fie disponibil după boot (authReady)
    if (!user || !authReady) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setSocket(null);
      setConnected(false);
      return;
    }

    // auth ca funcție → la fiecare (re)conectare folosim access token-ul CURENT din memorie.
    // Dacă lipsește (ex. a expirat), îl reîmprospătăm prin cookie înainte de conectare.
    const s = io(API_URL, {
      auth: async (cb) => {
        let token = getAccessToken();
        if (!token) { try { token = await refreshAccessToken(); } catch { token = null; } }
        cb({ token: token ?? '' });
      },
      withCredentials: true,
    });
    socketRef.current = s;
    setSocket(s);

    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    s.on('connect_error', (err) => {
      console.error('[Socket] Eroare autentificare:', err.message);
      setConnected(false);
    });

    return () => {
      s.disconnect();
      socketRef.current = null;
    };
  }, [user?.id, authReady]);

  return (
    <SocketContext.Provider value={{ socket, connected }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket(): SocketContextValue {
  return useContext(SocketContext);
}
