import { useState, useEffect, useRef, useCallback, FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Send, Paperclip, Flag, ArrowLeft, Loader2, MessageSquare } from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

const API_URL = (import.meta as unknown as { env: Record<string, string> }).env['VITE_API_URL'] ?? 'http://localhost:4000';

interface ConversationItem {
  id: string;
  lastMessageAt: string | null;
  elev: {
    id: string;
    profileElev: { firstName: string; lastName: string; avatarUrl: string | null } | null;
  };
  antreprenor: {
    id: string;
    profileAntreprenor: {
      firstName: string; lastName: string; company: string | null; avatarUrl: string | null;
    } | null;
  };
  messages: { id: string; content: string; type: string; createdAt: string; senderId: string }[];
}

interface Message {
  id: string;
  content: string;
  type: string;
  fileUrl: string | null;
  createdAt: string;
  senderId: string;
}

interface ConnectionRequest {
  id: string;
  status: string;
  createdAt: string;
  expiresAt: string;
  idea: { id: string; title: string } | null;
  fromUser: {
    id: string;
    profileAntreprenor: {
      firstName: string; lastName: string; company: string | null; avatarUrl: string | null;
    } | null;
  };
}

function initials(name: string) {
  return name.split(' ').map((w) => w[0] ?? '').join('').toUpperCase().slice(0, 2);
}

function relativeTime(dt: string) {
  const diff = (Date.now() - new Date(dt).getTime()) / 1000;
  if (diff < 60) return 'acum';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return new Date(dt).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
  return new Date(dt).toLocaleDateString('ro-RO', { day: '2-digit', month: 'short' });
}

type ApiError = { response?: { data?: { error?: string } } };

export default function ChatPage() {
  const { conversationId } = useParams<{ conversationId?: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [requests, setRequests] = useState<ConnectionRequest[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [showReport, setShowReport] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const joinedConvId = useRef<string | undefined>(undefined);

  const isElev = user?.role === 'ELEV';

  function getOtherParty(conv: ConversationItem) {
    if (isElev) {
      const p = conv.antreprenor.profileAntreprenor;
      return {
        id: conv.antreprenor.id,
        name: p ? `${p.firstName} ${p.lastName}` : 'Antreprenor',
        sub: p?.company ?? '',
        avatar: p?.avatarUrl ?? null,
      };
    }
    const p = conv.elev.profileElev;
    return {
      id: conv.elev.id,
      name: p ? `${p.firstName} ${p.lastName}` : 'Elev',
      sub: '',
      avatar: p?.avatarUrl ?? null,
    };
  }

  const loadConvs = useCallback(async () => {
    const [convRes, reqRes] = await Promise.all([
      api.get<{ conversations: ConversationItem[] }>('/chat/conversations'),
      api.get<{ requests: ConnectionRequest[] }>('/chat/requests'),
    ]);
    setConversations(convRes.data.conversations);
    setRequests(reqRes.data.requests);
  }, []);

  useEffect(() => {
    loadConvs().finally(() => setLoadingConvs(false));
  }, [loadConvs]);

  // Socket setup
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) return;

    const socket = io(API_URL, { auth: { token }, transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('message:new', (data: { conversationId: string }) => {
      if (data.conversationId === conversationId) {
        api.get<{ items: Message[] }>(`/chat/conversations/${conversationId}/messages`)
          .then(({ data: d }) => setMessages(d.items));
      }
    });

    socket.on('typing:start', (data: { userId: string }) => {
      if (data.userId !== user?.id) setIsTyping(true);
    });
    socket.on('typing:stop', () => setIsTyping(false));

    return () => { socket.disconnect(); socketRef.current = null; };
  // one-time setup — intentionally empty deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Join/leave conversation room
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;
    if (joinedConvId.current) socket.emit('leave:conversation', joinedConvId.current);
    if (conversationId) {
      socket.emit('join:conversation', conversationId);
      joinedConvId.current = conversationId;
    }
  }, [conversationId]);

  // Load messages
  useEffect(() => {
    if (!conversationId) { setMessages([]); return; }
    setLoadingMsgs(true);
    api.get<{ items: Message[] }>(`/chat/conversations/${conversationId}/messages`)
      .then(({ data }) => setMessages(data.items))
      .finally(() => setLoadingMsgs(false));
  }, [conversationId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !conversationId || sending) return;
    setSending(true);
    const content = text.trim();
    setText('');
    try {
      const { data } = await api.post<Message>(`/chat/conversations/${conversationId}/messages`, { content });
      setMessages((prev) => [...prev, data]);
      socketRef.current?.emit('message:send', { conversationId, messageId: data.id });
    } catch (err) {
      const msg = (err as ApiError).response?.data?.error ?? 'Eroare la trimitere.';
      alert(msg);
      setText(content);
    } finally {
      setSending(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!conversationId) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const { data } = await api.post<Message>(`/chat/conversations/${conversationId}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setMessages((prev) => [...prev, data]);
      socketRef.current?.emit('message:send', { conversationId, messageId: data.id });
    } catch {
      alert('Eroare la upload fișier.');
    }
  };

  const handleTyping = () => {
    if (!conversationId) return;
    socketRef.current?.emit('typing:start', conversationId);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      socketRef.current?.emit('typing:stop', conversationId);
    }, 1500);
  };

  const handleRequest = async (id: string, action: 'ACCEPTED' | 'REFUSED') => {
    await api.patch(`/chat/requests/${id}`, { action });
    setRequests((prev) => prev.filter((r) => r.id !== id));
    if (action === 'ACCEPTED') await loadConvs();
  };

  const handleReport = async () => {
    if (!conversationId || reportReason.trim().length < 10) return;
    await api.post('/chat/report', { contentType: 'USER', contentId: conversationId, reason: reportReason });
    setShowReport(false);
    setReportReason('');
    alert('Raportul a fost trimis. Mulțumim!');
  };

  const activeConv = conversations.find((c) => c.id === conversationId);

  return (
    <div className="flex h-[calc(100vh-80px)] rounded-2xl overflow-hidden"
      style={{ border: '1px solid var(--border)' }}>

      {/* ── Sidebar ── */}
      <div className="w-72 flex flex-col shrink-0"
        style={{ backgroundColor: 'var(--bg-2)', borderRight: '1px solid var(--border)' }}>

        <div className="p-4 shrink-0 text-sm font-bold" style={{ borderBottom: '1px solid var(--border)', color: 'var(--text)' }}>
          Chat
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Cereri pending */}
          {requests.length > 0 && (
            <div className="p-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-2)' }}>
                Cereri ({requests.length})
              </p>
              {requests.map((req) => {
                const p = req.fromUser.profileAntreprenor;
                const name = p ? `${p.firstName} ${p.lastName}` : 'Antreprenor';
                return (
                  <div key={req.id} className="rounded-xl p-3 mb-2" style={{ backgroundColor: 'var(--bg-3)' }}>
                    <div className="flex items-center gap-2 mb-2">
                      {p?.avatarUrl
                        ? <img src={p.avatarUrl} alt={name} className="w-7 h-7 rounded-full object-cover" loading="lazy" />
                        : <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                            style={{ backgroundColor: 'var(--orange)', color: '#fff' }}>{initials(name)}</div>
                      }
                      <div className="min-w-0">
                        <p className="text-xs font-semibold truncate" style={{ color: 'var(--text)' }}>{name}</p>
                        {req.idea && <p className="text-xs truncate" style={{ color: 'var(--text-2)' }}>{req.idea.title}</p>}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => void handleRequest(req.id, 'ACCEPTED')}
                        className="flex-1 py-1 rounded-lg text-xs font-semibold"
                        style={{ backgroundColor: 'var(--orange)', color: '#fff' }}>
                        Accept
                      </button>
                      <button onClick={() => void handleRequest(req.id, 'REFUSED')}
                        className="flex-1 py-1 rounded-lg text-xs font-semibold"
                        style={{ backgroundColor: 'var(--bg-4)', color: 'var(--text-2)' }}>
                        Refuz
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Lista conversații */}
          {loadingConvs ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map((i) => <div key={i} className="skeleton h-14 rounded-xl" />)}
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2">
              <MessageSquare size={24} style={{ color: 'var(--text-2)' }} />
              <p className="text-xs" style={{ color: 'var(--text-2)' }}>Nicio conversație</p>
            </div>
          ) : (
            <div className="p-2 space-y-0.5">
              {conversations.map((conv) => {
                const other = getOtherParty(conv);
                const lastMsg = conv.messages[0];
                const active = conv.id === conversationId;
                return (
                  <button
                    key={conv.id}
                    onClick={() => navigate(`/chat/${conv.id}`)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-colors"
                    style={{
                      backgroundColor: active ? 'rgba(246,166,35,0.1)' : 'transparent',
                      border: `1px solid ${active ? 'rgba(246,166,35,0.3)' : 'transparent'}`,
                    }}>
                    {other.avatar
                      ? <img src={other.avatar} alt={other.name} className="w-9 h-9 rounded-full object-cover shrink-0" loading="lazy" />
                      : <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                          style={{ backgroundColor: 'var(--bg-4)', color: 'var(--text-2)' }}>{initials(other.name)}</div>
                    }
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold truncate"
                          style={{ color: active ? 'var(--orange)' : 'var(--text)' }}>
                          {other.name}
                        </p>
                        {conv.lastMessageAt && (
                          <span className="text-xs shrink-0 ml-1" style={{ color: 'var(--text-2)' }}>
                            {relativeTime(conv.lastMessageAt)}
                          </span>
                        )}
                      </div>
                      {lastMsg && (
                        <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-2)' }}>
                          {lastMsg.type === 'TEXT' ? lastMsg.content : '📎 Fișier'}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Chat panel ── */}
      {conversationId && activeConv ? (() => {
        const other = getOtherParty(activeConv);
        return (
          <div className="flex-1 flex flex-col" style={{ backgroundColor: 'var(--bg)' }}>
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 shrink-0"
              style={{ backgroundColor: 'var(--bg-2)', borderBottom: '1px solid var(--border)' }}>
              <button onClick={() => navigate('/chat')} className="lg:hidden" style={{ color: 'var(--text-2)' }}>
                <ArrowLeft size={18} />
              </button>
              {other.avatar
                ? <img src={other.avatar} alt={other.name} className="w-9 h-9 rounded-full object-cover" loading="lazy" />
                : <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ backgroundColor: 'var(--bg-4)', color: 'var(--text-2)' }}>{initials(other.name)}</div>
              }
              <div className="flex-1">
                <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{other.name}</p>
                {other.sub && <p className="text-xs" style={{ color: 'var(--text-2)' }}>{other.sub}</p>}
              </div>
              <button
                onClick={() => setShowReport(true)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl transition-colors"
                style={{ color: 'var(--text-2)', border: '1px solid var(--border)' }}>
                <Flag size={13} /> Raportează
              </button>
            </div>

            {/* Mesaje */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loadingMsgs ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 size={24} className="animate-spin" style={{ color: 'var(--text-2)' }} />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-2 opacity-40">
                  <MessageSquare size={32} style={{ color: 'var(--text-2)' }} />
                  <p className="text-sm" style={{ color: 'var(--text-2)' }}>Niciun mesaj încă</p>
                </div>
              ) : (
                messages.map((msg) => {
                  const mine = msg.senderId === user?.id;
                  return (
                    <div key={msg.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div className="max-w-xs lg:max-w-sm px-4 py-2.5 text-sm"
                        style={{
                          backgroundColor: mine ? 'var(--orange)' : 'var(--bg-2)',
                          color: mine ? '#fff' : 'var(--text)',
                          borderRadius: mine ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                        }}>
                        {msg.type === 'TEXT'
                          ? <p className="whitespace-pre-wrap wrap-break-word">{msg.content}</p>
                          : <a href={msg.fileUrl ?? '#'} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-2 underline">
                              📎 {msg.content}
                            </a>
                        }
                        <p className="text-xs mt-1"
                          style={{ color: mine ? 'rgba(255,255,255,0.65)' : 'var(--text-2)' }}>
                          {relativeTime(msg.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}

              {isTyping && (
                <div className="flex justify-start">
                  <div className="px-4 py-2.5 rounded-2xl text-xs animate-pulse"
                    style={{ backgroundColor: 'var(--bg-2)', color: 'var(--text-2)' }}>
                    scrie...
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form onSubmit={(e) => void handleSend(e)}
              className="flex items-end gap-2 p-4 shrink-0"
              style={{ borderTop: '1px solid var(--border)' }}>
              <input
                ref={fileInputRef} type="file" className="hidden"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFileUpload(f); e.target.value = ''; }}
              />
              <button type="button" onClick={() => fileInputRef.current?.click()}
                className="p-2.5 rounded-xl shrink-0"
                style={{ backgroundColor: 'var(--bg-3)', color: 'var(--text-2)' }}>
                <Paperclip size={18} />
              </button>

              <textarea
                value={text}
                onChange={(e) => { setText(e.target.value); handleTyping(); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend(e as unknown as FormEvent); }
                }}
                placeholder="Scrie un mesaj..."
                rows={1}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none resize-none"
                style={{
                  backgroundColor: 'var(--bg-3)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  maxHeight: 120,
                }}
              />

              <button type="submit" disabled={!text.trim() || sending}
                className="p-2.5 rounded-xl shrink-0 disabled:opacity-40"
                style={{ backgroundColor: 'var(--orange)', color: '#fff' }}>
                {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              </button>
            </form>
          </div>
        );
      })() : (
        <div className="flex-1 flex flex-col items-center justify-center gap-3" style={{ backgroundColor: 'var(--bg)' }}>
          <MessageSquare size={48} style={{ color: 'var(--text-2)', opacity: 0.25 }} />
          <p className="text-sm" style={{ color: 'var(--text-2)' }}>Selectează o conversație</p>
        </div>
      )}

      {/* Modal raportare */}
      {showReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-sm rounded-2xl p-6"
            style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}>
            <h3 className="text-base font-bold mb-3" style={{ color: 'var(--text)' }}>Raportează conversația</h3>
            <textarea
              value={reportReason} onChange={(e) => setReportReason(e.target.value)}
              rows={4} placeholder="Descrie motivul (minim 10 caractere)..."
              className="w-full px-4 py-3 rounded-xl text-sm outline-none resize-none"
              style={{ backgroundColor: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
            <div className="flex gap-3 mt-4">
              <button onClick={() => { setShowReport(false); setReportReason(''); }}
                className="flex-1 py-2 rounded-xl text-sm font-medium"
                style={{ backgroundColor: 'var(--bg-3)', color: 'var(--text-2)' }}>
                Anulează
              </button>
              <button onClick={() => void handleReport()} disabled={reportReason.trim().length < 10}
                className="flex-1 py-2 rounded-xl text-sm font-semibold disabled:opacity-40"
                style={{ backgroundColor: '#ef4444', color: '#fff' }}>
                Trimite
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
