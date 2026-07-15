import { useState, useEffect, useLayoutEffect, useRef, FormEvent } from 'react';
import { Send, Loader2, MessageCircleQuestion, CheckCheck, HeadphonesIcon } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';

interface SupportMessage {
  id: string;
  content: string;
  isAdmin: boolean;
  senderId: string | null;
  createdAt: string;
}

interface SupportTicket {
  id: string;
  status: string;
  createdAt: string;
  messages: SupportMessage[];
}

export default function SupportChatPage() {
  const { user } = useAuth();
  const { socket } = useSocket();

  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const initialScrollDoneRef = useRef(false);

  // Încarcă sau creează conversația
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const { data } = await api.get<{ ticket: SupportTicket | null }>('/support/me');
        if (data.ticket) {
          setTicket(data.ticket);
        } else {
          await api.post('/support/me/init', {
            name: user?.firstName && user?.lastName
              ? `${user.firstName} ${user.lastName}`
              : user?.email ?? 'Utilizator',
            email: user?.email ?? '',
          });
          const { data: fresh } = await api.get<{ ticket: SupportTicket | null }>('/support/me');
          setTicket(fresh.ticket);
        }
      } finally {
        setLoading(false);
      }
    };
    void init();
  }, [user]);

  // Scroll instant la load inițial — după paint, ca în ChatPage
  useLayoutEffect(() => {
    if (loading || !ticket || initialScrollDoneRef.current) return;
    const el = messagesRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    initialScrollDoneRef.current = true;
  }, [loading, ticket?.messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll smooth la mesaje noi — același pattern ca ChatPage
  useEffect(() => {
    if (!initialScrollDoneRef.current) return;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [ticket?.messages.length]);

  // Socket — join room + re-join după restart server (ca în ChatPage)
  useEffect(() => {
    if (!ticket?.id || !socket) return;

    const joinRoom = () => socket.emit('support:join', ticket.id);
    joinRoom();
    socket.on('connect', joinRoom); // re-join după disconnect/reconnect

    const handleNew = (msg: SupportMessage) => {
      // Ignoră propriile mesaje — deja adăugate optimistic în handleSubmit
      if (msg.senderId === user?.id) return;
      setTicket((prev) => prev ? { ...prev, messages: [...prev.messages, msg] } : prev);
    };
    socket.on('support:message:new', handleNew);

    return () => {
      socket.off('connect', joinRoom);
      socket.off('support:message:new', handleNew);
      socket.emit('support:leave', ticket.id);
    };
  }, [ticket?.id, socket, user?.id]);

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    const content = text.trim();
    if (!content || sending || !ticket) return;

    setSending(true);
    setText('');
    try {
      const { data } = await api.post<{ ticketId: string; message: SupportMessage }>('/support/me/message', { content });
      // Adaugă optimistic — scroll vine din useEffect pe messages.length
      setTicket((prev) => prev ? { ...prev, messages: [...prev.messages, data.message] } : prev);
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--orange)' }} />
      </div>
    );
  }

  const isClosed = ticket?.status === 'CLOSED';

  return (
    <div className="max-w-2xl mx-auto flex flex-col" style={{ height: 'calc(100vh - 120px)' }}>
      {/* Header */}
      <div className="rounded-2xl mb-4 p-4 flex items-center gap-3 shrink-0"
        style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: 'rgba(246,166,35,0.12)' }}>
          <HeadphonesIcon size={20} style={{ color: 'var(--orange)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm" style={{ color: 'var(--text)' }}>Suport InspireMe</p>
          <p className="text-xs" style={{ color: 'var(--text-2)' }}>
            Scrie-ne orice întrebare sau problemă. Răspundem în cel mai scurt timp.
          </p>
        </div>
        {isClosed && (
          <span className="text-xs px-2 py-1 rounded-full shrink-0"
            style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
            Închis
          </span>
        )}
      </div>

      {/* Mesaje — scrollable */}
      <div
        ref={messagesRef}
        className="flex-1 overflow-y-auto rounded-2xl p-4 space-y-3 mb-4"
        style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}
      >
        {ticket?.messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <MessageCircleQuestion size={40} style={{ color: 'var(--text-2)', opacity: 0.3 }} />
            <p className="text-sm" style={{ color: 'var(--text-2)' }}>
              Salut! Cum te putem ajuta?<br />
              Scrie primul tău mesaj mai jos.
            </p>
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
        <div className="rounded-2xl p-4 text-center text-sm shrink-0"
          style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
          Această conversație a fost închisă de admin.
        </div>
      ) : (
        <form onSubmit={(e) => void handleSubmit(e)}
          className="flex items-end gap-2 rounded-2xl p-3 shrink-0"
          style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}>
          <textarea
            ref={textareaRef}
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
      )}
    </div>
  );
}
