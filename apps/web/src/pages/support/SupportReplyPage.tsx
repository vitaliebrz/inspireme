import { useState, useEffect, useLayoutEffect, useRef, FormEvent } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Send, Loader2, HeadphonesIcon, CheckCheck, AlertCircle } from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { api } from '../../lib/api';

const API_URL = (import.meta as unknown as { env: Record<string, string> }).env['VITE_API_URL']
  ?? `${window.location.protocol}//${window.location.hostname}:4000`;

interface PublicMsg {
  id: string;
  content: string;
  isAdmin: boolean;
  createdAt: string;
}

interface PublicTicket {
  id: string;
  name: string;
  email: string;
  status: string;
  createdAt: string;
  messages: PublicMsg[];
}

export default function SupportReplyPage() {
  const [params] = useSearchParams();
  const tid = params.get('tid') ?? '';
  const name = params.get('name') ?? '';
  const email = params.get('email') ?? '';

  const [ticket, setTicket] = useState<PublicTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const initialScrollDoneRef = useRef(false);

  // Încarcă conversația
  useEffect(() => {
    if (!tid) { setLoading(false); setError('Link invalid.'); return; }
    api.get<{ ticket: PublicTicket }>(`/support/public/${tid}`)
      .then(({ data }) => setTicket(data.ticket))
      .catch(() => setError('Conversația nu a putut fi încărcată.'))
      .finally(() => setLoading(false));
  }, [tid]);

  // Scroll instant la load inițial
  useLayoutEffect(() => {
    if (loading || !ticket || initialScrollDoneRef.current) return;
    const el = messagesRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    initialScrollDoneRef.current = true;
  }, [loading, ticket?.messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll smooth la mesaje noi (după render)
  useEffect(() => {
    if (!initialScrollDoneRef.current) return;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [ticket?.messages.length]);

  // Socket.io — conexiune anonimă, re-join după restart server
  useEffect(() => {
    if (!tid) return;

    const s = io(API_URL, {
      auth: { token: '' },
      withCredentials: true,
    });
    socketRef.current = s;

    const joinRoom = () => s.emit('support:join', tid);
    s.on('connect', joinRoom);

    s.on('support:message:new', (msg: PublicMsg) => {
      // Ignoră propriile mesaje (non-admin) — deja adăugate optimistic
      if (!msg.isAdmin) return;
      setTicket((prev) => prev ? { ...prev, messages: [...prev.messages, msg] } : prev);
    });

    return () => {
      s.emit('support:leave', tid);
      s.disconnect();
      socketRef.current = null;
    };
  }, [tid]);

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    const content = text.trim();
    if (!content || sending || !ticket) return;

    setSending(true);
    setText('');
    try {
      const { data } = await api.post<{ ticketId: string; message: PublicMsg }>(
        `/support/public/${tid}/reply`,
        { email, content },
      );
      // Adaugă optimistic — scroll vine din useEffect
      setTicket((prev) => prev ? { ...prev, messages: [...prev.messages, data.message] } : prev);
    } catch {
      setError('Nu s-a putut trimite mesajul. Încearcă din nou.');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  const isClosed = ticket?.status === 'CLOSED';

  return (
    <div className="min-h-screen flex flex-col items-center justify-start py-10 px-4"
      style={{ backgroundColor: 'var(--bg)' }}>
      {/* Logo */}
      <Link to="/login" className="mb-6 flex items-center gap-2 no-underline">
        <span className="text-xl font-extrabold" style={{ color: 'var(--orange)' }}>InspireMe</span>
      </Link>

      <div className="w-full max-w-2xl flex flex-col gap-4">
        {/* Header */}
        <div className="rounded-2xl p-4 flex items-center gap-3"
          style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: 'rgba(246,166,35,0.12)' }}>
            <HeadphonesIcon size={20} style={{ color: 'var(--orange)' }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm" style={{ color: 'var(--text)' }}>
              Conversație suport — {name || ticket?.name || email}
            </p>
            <p className="text-xs" style={{ color: 'var(--text-2)' }}>{email || ticket?.email}</p>
          </div>
          {isClosed && (
            <span className="text-xs px-2 py-1 rounded-full shrink-0"
              style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
              Închis
            </span>
          )}
        </div>

        {/* Mesaje */}
        <div
          ref={messagesRef}
          className="rounded-2xl p-4 space-y-3 overflow-y-auto"
          style={{ minHeight: 300, maxHeight: '60vh', backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}
        >
          {loading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={24} className="animate-spin" style={{ color: 'var(--orange)' }} />
            </div>
          )}

          {!loading && error && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <AlertCircle size={32} style={{ color: '#ef4444' }} />
              <p className="text-sm" style={{ color: 'var(--text-2)' }}>{error}</p>
            </div>
          )}

          {!loading && !error && ticket?.messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <HeadphonesIcon size={40} style={{ color: 'var(--text-2)', opacity: 0.2 }} />
              <p className="text-sm" style={{ color: 'var(--text-2)' }}>Niciun mesaj. Scrie mai jos pentru a continua.</p>
            </div>
          )}

          {ticket?.messages.map((msg) => {
            const isMe = !msg.isAdmin;
            return (
              <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                {!isMe && (
                  <div className="w-7 h-7 rounded-full flex items-center justify-center mr-2 shrink-0 self-end"
                    style={{ backgroundColor: 'rgba(246,166,35,0.12)' }}>
                    <HeadphonesIcon size={13} style={{ color: 'var(--orange)' }} />
                  </div>
                )}
                <div className="max-w-xs lg:max-w-md">
                  <div
                    className="px-3.5 py-2.5 rounded-2xl text-sm whitespace-pre-wrap"
                    style={isMe ? {
                      backgroundColor: 'var(--orange)', color: '#fff',
                      borderBottomRightRadius: 6,
                    } : {
                      backgroundColor: 'var(--bg-3)',
                      color: 'var(--text)',
                      borderBottomLeftRadius: 6,
                    }}
                  >
                    {msg.content}
                  </div>
                  <p className={`text-[10px] mt-1 ${isMe ? 'text-right' : 'text-left'}`}
                    style={{ color: 'var(--text-2)' }}>
                    {new Date(msg.createdAt).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })}
                    {isMe && <CheckCheck size={11} className="inline ml-1" />}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        {isClosed ? (
          <div className="rounded-2xl p-4 text-center text-sm"
            style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
            Această conversație a fost închisă de admin.
          </div>
        ) : !loading && !error ? (
          <form onSubmit={(e) => void handleSubmit(e)}
            className="flex items-end gap-2 rounded-2xl p-3"
            style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Scrie un mesaj... (Enter pentru trimitere)"
              rows={1}
              className="flex-1 px-3 py-2 rounded-xl text-sm outline-none resize-none"
              style={{
                backgroundColor: 'var(--bg-3)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                maxHeight: 120,
                lineHeight: '1.5',
              }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = 'auto';
                el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--orange)')}
              onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
            />
            <button
              type="submit"
              disabled={sending || !text.trim()}
              className="flex items-center justify-center w-10 h-10 rounded-xl cursor-pointer hover:opacity-90 disabled:opacity-40 shrink-0 transition-opacity"
              style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
            >
              {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </form>
        ) : null}

        {/* Link spre login */}
        <p className="text-center text-xs" style={{ color: 'var(--text-2)' }}>
          Ai un cont?{' '}
          <Link to="/login" style={{ color: 'var(--orange)' }}>
            Intră în cont →
          </Link>
        </p>
      </div>
    </div>
  );
}
