import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Send, Paperclip, Flag, ArrowLeft, Loader2, MessageSquare, Handshake, CheckCircle2, Clock, TrendingUp, Trophy, Search, X, MoreVertical, BellOff, Bell, Check, CheckCheck, Users, Plus } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useNotifications } from '../../context/NotificationsContext';
import { useSocket } from '../../context/SocketContext';

interface ConversationItem {
  id: string;
  lastMessageAt: string | null;
  participantA: {
    id: string;
    role: string;
    profileElev: { firstName: string; lastName: string; avatarUrl: string | null } | null;
    profileAntreprenor: { firstName: string; lastName: string; company: string | null; avatarUrl: string | null } | null;
  };
  participantB: {
    id: string;
    role: string;
    profileElev: { firstName: string; lastName: string; avatarUrl: string | null } | null;
    profileAntreprenor: { firstName: string; lastName: string; company: string | null; avatarUrl: string | null } | null;
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
  readAt: string | null;
}

interface ConnectionRequest {
  id: string;
  status: string;
  createdAt: string;
  expiresAt: string;
  idea: { id: string; title: string } | null;
  fromUser: {
    id: string;
    role: string;
    profileElev: { firstName: string; lastName: string; avatarUrl: string | null } | null;
    profileAntreprenor: { firstName: string; lastName: string; company: string | null; avatarUrl: string | null } | null;
  };
}

interface Collaboration {
  id: string;
  confirmedByElev: boolean;
  confirmedByAntreprenor: boolean;
  confirmedAt: string | null;
  elev: { id: string };
  antreprenor: { id: string };
  idea: { id: string; title: string; category: string } | null;
}

interface Investment {
  id: string;
  status: 'NECONFIRMAT' | 'IN_NEGOCIERE' | 'ACTIV' | 'FINALIZAT';
  amountDescription: string;
  investmentType: string;
  idea: { id: string; title: string } | null;
  antreprenor: { id: string } | null;
}

// ─── Interfețe pentru grupuri ───────────────────────────────────────────────

interface GroupMemberUser {
  id: string;
  profileElev: { firstName: string; lastName: string; username: string | null; avatarUrl: string | null } | null;
  profileAntreprenor: { firstName: string; lastName: string; username: string | null; avatarUrl: string | null; company: string | null } | null;
}

interface GroupItem {
  id: string;
  name: string;
  createdAt: string;
  lastMessageAt: string | null;
  members: { user: GroupMemberUser }[];
  messages: { content: string | null; type: string; createdAt: string; senderId: string }[];
}

interface GroupMessage {
  id: string;
  content: string | null;
  type: string;
  fileUrl: string | null;
  createdAt: string;
  sender: GroupMemberUser;
}

interface UserSearchResult {
  id: string;
  role: string;
  username: string | null;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  subtitle: string;
  city: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────

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
  const { toast } = useToast();
  const { notifications, markConversation } = useNotifications();
  const { socket } = useSocket();

  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [chatSearch, setChatSearch] = useState('');
  const [requests, setRequests] = useState<ConnectionRequest[]>([]);
  const [collaborations, setCollaborations] = useState<Collaboration[]>([]);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);

  // State grupuri
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [groupMessages, setGroupMessages] = useState<GroupMessage[]>([]);
  const [loadingGroupMsgs, setLoadingGroupMsgs] = useState(false);
  const [groupText, setGroupText] = useState('');
  const [sendingGroup, setSendingGroup] = useState(false);

  // State modal creare grup
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupMemberSearch, setGroupMemberSearch] = useState('');
  const [groupMemberResults, setGroupMemberResults] = useState<UserSearchResult[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<UserSearchResult[]>([]);
  const [searchingMembers, setSearchingMembers] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirmingCollab, setConfirmingCollab] = useState(false);
  const [proposeDesc, setProposeDesc] = useState('');
  const [showProposeModal, setShowProposeModal] = useState(false);
  const [proposingInv, setProposingInv] = useState(false);
  const [confirmingInv, setConfirmingInv] = useState(false);
  const [text, setText] = useState('');
  const [sendErr, setSendErr] = useState('');
  const [msgLimitReached, setMsgLimitReached] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [showReport, setShowReport] = useState(false);
  const [showChatMenu, setShowChatMenu] = useState(false);
  const [mutedUsers, setMutedUsers] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('inspireme_muted_users');
      return new Set(saved ? (JSON.parse(saved) as string[]) : []);
    } catch {
      return new Set();
    }
  });

  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const chatMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const distFromBottomRef = useRef<number>(0);
  // true = prima încărcare a conversației → scroll instant; false = mesaj nou → scroll smooth
  const initialScrollRef = useRef(true);
  const awayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);


  const isElev = user?.role === 'ELEV';

  // Număr mesaje necitite per conversație — citit din data.count al notificării MESSAGE_NEW
  const unreadByConv = useMemo(() => {
    const map: Record<string, number> = {};
    for (const n of notifications) {
      if (n.type === 'MESSAGE_NEW' && !n.readAt) {
        const d = n.data as Record<string, string>;
        const convId = d['conversationId'];
        if (convId) map[convId] = parseInt(d['count'] ?? '1', 10);
      }
    }
    return map;
  }, [notifications]);

  function getOtherParty(conv: ConversationItem, myId: string) {
    const other = conv.participantA.id === myId ? conv.participantB : conv.participantA;
    const p = other.role === 'ELEV' ? other.profileElev : other.profileAntreprenor;
    const name = p ? `${p.firstName} ${p.lastName}` : 'Utilizator';
    const sub = other.role === 'ANTREPRENOR' && 'company' in (p ?? {})
      ? (p as { company: string | null }).company ?? ''
      : '';
    return {
      id: other.id,
      name,
      sub,
      avatar: p?.avatarUrl ?? null,
    };
  }

  const loadCollaborations = useCallback(() => {
    api.get<{ collaborations: Collaboration[] }>('/collaborations')
      .then(({ data }) => setCollaborations(data.collaborations))
      .catch(() => {});
    api.get<{ investments: Investment[] }>('/investments')
      .then(({ data }) => setInvestments(data.investments))
      .catch(() => {});
  }, []);

  const loadConvs = useCallback(async () => {
    const [convRes, reqRes] = await Promise.all([
      api.get<{ conversations: ConversationItem[] }>('/chat/conversations'),
      api.get<{ requests: ConnectionRequest[] }>('/chat/requests'),
    ]);
    setConversations(convRes.data.conversations);
    setRequests(reqRes.data.requests);
    loadCollaborations();
  }, [loadCollaborations]);

  useEffect(() => {
    loadConvs().finally(() => setLoadingConvs(false));
  }, [loadConvs]);

  // Încarcă lista de grupuri la mount
  useEffect(() => {
    api.get<{ groups: GroupItem[] }>('/groups')
      .then(({ data }) => setGroups(data.groups))
      .catch(() => {});
  }, []);

  // Debounce search membri pentru modalul de creare grup
  useEffect(() => {
    if (groupMemberSearch.trim().length < 2) {
      setGroupMemberResults([]);
      return;
    }
    setSearchingMembers(true);
    const excludeIds = selectedMembers.map((m) => m.id).join(',');
    const timer = setTimeout(() => {
      api.get<{ users: UserSearchResult[] }>(`/search/users?q=${encodeURIComponent(groupMemberSearch)}&exclude=${excludeIds}`)
        .then(({ data }) => setGroupMemberResults(data.users))
        .catch(() => {})
        .finally(() => setSearchingMembers(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [groupMemberSearch, selectedMembers]);

  // Când vine un mesaj în altă conversație decât cea deschisă, reîncarcă lista
  // ca să se actualizeze ultimul mesaj afișat și ordinea conversațiilor
  useEffect(() => {
    if (!socket) return;
    const handleNotif = (notif: { type?: string; data?: Record<string, string> }) => {
      if (notif.type === 'CONNECTION_REQUEST') {
        void loadConvs();
        return;
      }
      if (notif.type !== 'MESSAGE_NEW') return;
      const convId = notif.data?.['conversationId'];
      if (convId && convId !== conversationId) void loadConvs();
    };
    socket.on('notification:new', handleNotif);
    return () => socket.off('notification:new', handleNotif);
  }, [socket, conversationId, loadConvs]);

  // Listener typing — socket-ul e deja conectat global (SocketContext)
  useEffect(() => {
    if (!socket) return;
    const handleTypingStart = (data: { userId: string }) => {
      if (data.userId !== user?.id) setIsTyping(true);
    };
    const handleTypingStop = () => setIsTyping(false);
    socket.on('typing:start', handleTypingStart);
    socket.on('typing:stop', handleTypingStop);
    return () => {
      socket.off('typing:start', handleTypingStart);
      socket.off('typing:stop', handleTypingStop);
    };
  }, [socket, user?.id]);

  // Emite prezență online/offline în funcție de vizibilitatea tab-ului și focus-ul ferestrei
  useEffect(() => {
    if (!socket) return;

    const goActive = () => {
      if (awayTimerRef.current) { clearTimeout(awayTimerRef.current); awayTimerRef.current = null; }
      socket.emit('presence:active');
    };
    const goAway = () => {
      if (awayTimerRef.current) return;
      awayTimerRef.current = setTimeout(() => {
        awayTimerRef.current = null;
        socket.emit('presence:away');
      }, 500);
    };

    const onVisibility = () => (document.hidden ? goAway() : goActive());

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', goAway);
    window.addEventListener('focus', goActive);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', goAway);
      window.removeEventListener('focus', goActive);
      if (awayTimerRef.current) clearTimeout(awayTimerRef.current);
    };
  }, [socket]);

  // Join room + listener mesaje — se re-înregistrează la fiecare schimbare de conversație
  // și la fiecare reconectare socket (ex: restart server)
  useEffect(() => {
    if (!socket || !conversationId) return;

    const joinRoom = () => socket.emit('join:conversation', conversationId);
    joinRoom();
    socket.on('connect', joinRoom); // re-join după disconnect/reconnect

    const handleMessage = (data: { conversationId: string; message: Message }) => {
      // Filtrăm mesajele parțiale venite din personal room (au doar senderId, fără id/createdAt)
      if (data.conversationId !== conversationId || !data.message.id || !data.message.createdAt) return;
      setMessages((prev) => {
        // Dedup — mesajul poate sosi atât din conversation room cât și din personal room
        if (prev.some((m) => m.id === data.message.id)) return prev;
        return [...prev, data.message];
      });
      void markConversation(data.conversationId);
      // Marcăm mesajul ca citit imediat — userul îl vede în timp real
      api.patch(`/chat/conversations/${data.conversationId}/read`).catch(() => {});
    };

    // Când celălalt user citește mesajele noastre — actualizăm ✓✓
    const handleMessagesRead = (data: { conversationId: string; readAt: string }) => {
      if (data.conversationId !== conversationId) return;
      setMessages((prev) =>
        prev.map((msg) =>
          msg.senderId === user!.id && !msg.readAt
            ? { ...msg, readAt: data.readAt }
            : msg,
        ),
      );
    };

    socket.on('message:new', handleMessage);
    socket.on('messages:read', handleMessagesRead);
    return () => {
      socket.off('connect', joinRoom);
      socket.off('message:new', handleMessage);
      socket.off('messages:read', handleMessagesRead);
      socket.emit('leave:conversation', conversationId);
    };
  }, [socket, conversationId, markConversation, user]);

  // Socket handler pentru mesaje grup real-time
  useEffect(() => {
    if (!socket || !activeGroupId) return;

    const joinRoom = () => socket.emit('join:group', activeGroupId);
    joinRoom();
    socket.on('connect', joinRoom);

    const handleGroupMessage = (data: { groupId: string; message: GroupMessage }) => {
      if (data.groupId !== activeGroupId) {
        // Mesaj într-un alt grup — actualizăm lista de grupuri
        setGroups((prev) =>
          prev.map((g) =>
            g.id === data.groupId
              ? {
                  ...g,
                  lastMessageAt: data.message.createdAt,
                  messages: [{ content: data.message.content, type: data.message.type, createdAt: data.message.createdAt, senderId: data.message.sender.id }],
                }
              : g,
          ),
        );
        return;
      }
      setGroupMessages((prev) => {
        if (prev.some((m) => m.id === data.message.id)) return prev;
        return [...prev, data.message];
      });
    };

    socket.on('group:message:new', handleGroupMessage);
    return () => {
      socket.off('connect', joinRoom);
      socket.off('group:message:new', handleGroupMessage);
      socket.emit('leave:group', activeGroupId);
    };
  }, [socket, activeGroupId]);

  // Load group messages când se selectează un grup
  useEffect(() => {
    if (!activeGroupId) { setGroupMessages([]); return; }
    setLoadingGroupMsgs(true);
    api.get<{ items: GroupMessage[] }>(`/groups/${activeGroupId}/messages`)
      .then(({ data }) => setGroupMessages(data.items))
      .catch(() => {})
      .finally(() => setLoadingGroupMsgs(false));
  }, [activeGroupId]);

  // Load messages + marchează ca citite imediat după load
  useEffect(() => {
    if (!conversationId) { setMessages([]); return; }
    initialScrollRef.current = true;
    setMessages([]);
    setLoadingMsgs(true);
    api.get<{ items: Message[] }>(`/chat/conversations/${conversationId}/messages`)
      .then(({ data }) => {
        setMessages(data.items);
        api.patch(`/chat/conversations/${conversationId}/read`).catch(() => {});
      })
      .finally(() => setLoadingMsgs(false));
  }, [conversationId]);

  // Marchează notificările MESSAGE_NEW ca citite când conversația e deschisă
  useEffect(() => {
    if (conversationId) void markConversation(conversationId);
  }, [conversationId, markConversation]);

  // Abonare la prezența tuturor partenerilor din lista de conversații
  useEffect(() => {
    if (!socket || conversations.length === 0 || !user) return;

    const partnerIds = conversations.map((conv) =>
      conv.participantA.id === user.id ? conv.participantB.id : conv.participantA.id,
    );
    partnerIds.forEach((id) => socket.emit('presence:subscribe', id));

    const handleStatus = (data: { userId: string; status: string }) => {
      setOnlineUsers((prev) => {
        const next = new Set(prev);
        if (data.status === 'online') next.add(data.userId);
        else next.delete(data.userId);
        return next;
      });
    };
    socket.on('user:status', handleStatus);

    return () => {
      partnerIds.forEach((id) => socket.emit('presence:unsubscribe', id));
      socket.off('user:status', handleStatus);
    };
  }, [socket, conversations, user]);

  // Scroll smooth pentru mesaje noi în timp real (după load inițial)
  useEffect(() => {
    if (messages.length === 0 || initialScrollRef.current) return;
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Când tastatuta apare pe mobil (visualViewport se micșorează), restaurăm
  // aceeași distanță față de ultimul mesaj vizibil — indiferent de unde era scroll-ul.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      requestAnimationFrame(() => {
        const el = messagesContainerRef.current;
        if (!el) return;
        const target = el.scrollHeight - el.clientHeight - distFromBottomRef.current;
        el.scrollTop = Math.max(0, target);
      });
    };
    vv.addEventListener('resize', onResize);
    return () => vv.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!showChatMenu) return;
    const handler = (e: MouseEvent) => {
      if (chatMenuRef.current && !chatMenuRef.current.contains(e.target as Node)) {
        setShowChatMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showChatMenu]);

  const toggleMute = (userId: string) => {
    setMutedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      localStorage.setItem('inspireme_muted_users', JSON.stringify([...next]));
      return next;
    });
    setShowChatMenu(false);
  };

  // Trimitere mesaj în grup
  const handleGroupSend = async (e: FormEvent) => {
    e.preventDefault();
    if (!groupText.trim() || !activeGroupId || sendingGroup) return;
    setSendingGroup(true);
    const content = groupText.trim();
    setGroupText('');
    try {
      const { data } = await api.post<GroupMessage>(`/groups/${activeGroupId}/messages`, { content });
      setGroupMessages((prev) => [...prev, data]);
      socket?.emit('group:message:send', { groupId: activeGroupId, message: data });
      // Actualizăm lastMessageAt în lista de grupuri
      setGroups((prev) =>
        prev.map((g) =>
          g.id === activeGroupId
            ? { ...g, lastMessageAt: data.createdAt, messages: [{ content: data.content, type: data.type, createdAt: data.createdAt, senderId: data.sender.id }] }
            : g,
        ),
      );
    } catch {
      toast('Eroare la trimitere mesaj grup.', 'error');
      setGroupText(content);
    } finally {
      setSendingGroup(false);
    }
  };

  // Creare grup nou
  const handleCreateGroup = async () => {
    if (!groupName.trim() || selectedMembers.length === 0 || creatingGroup) return;
    setCreatingGroup(true);
    try {
      const { data } = await api.post<{ group: GroupItem }>('/groups', {
        name: groupName.trim(),
        memberIds: selectedMembers.map((m) => m.id),
      });
      setGroups((prev) => [data.group, ...prev]);
      setShowCreateGroup(false);
      setGroupName('');
      setSelectedMembers([]);
      setGroupMemberSearch('');
      setActiveGroupId(data.group.id);
      toast('Grup creat cu succes!', 'success');
    } catch {
      toast('Eroare la crearea grupului.', 'error');
    } finally {
      setCreatingGroup(false);
    }
  };

  // Obținem numele afișabil dintr-un user de grup
  function getGroupUserName(u: GroupMemberUser): string {
    const p = u.profileElev ?? u.profileAntreprenor;
    return p ? `${p.firstName} ${p.lastName}` : 'Utilizator';
  }

  function getGroupUserAvatar(u: GroupMemberUser): string | null {
    const p = u.profileElev ?? u.profileAntreprenor;
    return p?.avatarUrl ?? null;
  }

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !conversationId || sending) return;
    setSending(true);
    const content = text.trim();
    setText('');
    try {
      const { data } = await api.post<Message>(`/chat/conversations/${conversationId}/messages`, { content });
      setSendErr('');
      setMessages((prev) => [...prev, data]);
      socket?.emit('message:send', { conversationId, message: data });
    } catch (err) {
      const status = (err as ApiError).response?.status;
      const msg = (err as ApiError).response?.data?.error ?? 'Eroare la trimitere.';
      if (status === 429) {
        setMsgLimitReached(true);
      } else {
        setSendErr(msg);
        toast(msg, 'error');
        setText(content);
      }
    } finally {
      setSending(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!conversationId) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const { data } = await api.post<Message>(`/chat/conversations/${conversationId}/upload`, formData);
      setMessages((prev) => [...prev, data]);
      socket?.emit('message:send', { conversationId, message: data });
    } catch {
      toast('Eroare la upload fișier.', 'error');
    }
  };

  const handleTyping = () => {
    if (!conversationId) return;
    socket?.emit('typing:start', conversationId);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      socket?.emit('typing:stop', conversationId);
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
    toast('Raportul a fost trimis. Mulțumim!', 'success');
  };

  const activeConv = conversations.find((c) => c.id === conversationId);

  const otherOnline = activeConv
    ? onlineUsers.has(
        activeConv.participantA.id === user!.id
          ? activeConv.participantB.id
          : activeConv.participantA.id,
      )
    : false;

  // Scroll instant la load inițial — înainte de paint, fără flash.
  // Urmărim activeConv?.id ȘI messages.length: oricare sosește ultimul declanșează scroll-ul.
  // (mesajele pot sosi înainte ca lista de conversații să fie gata → containerul nu exista încă)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (!activeConv?.id || messages.length === 0 || !initialScrollRef.current) return;
    const container = messagesContainerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
    initialScrollRef.current = false;
  }, [activeConv?.id, messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const pairCollabs = activeConv
    ? collaborations.filter((c) => {
        const ids = new Set([activeConv.participantA.id, activeConv.participantB.id]);
        return ids.has(c.elev.id) && ids.has(c.antreprenor.id);
      })
    : [];
  // Prioritate: prima neconfirmată (de afișat în banner), fallback ultima confirmată
  const activeCollab = pairCollabs.find((c) => !c.confirmedAt) ?? pairCollabs[0] ?? null;

  const handleConfirmCollab = async () => {
    if (!activeCollab) return;
    setConfirmingCollab(true);
    try {
      const { data } = await api.post<{ collaboration: Collaboration }>(`/collaborations/${activeCollab.id}/confirm`);
      setCollaborations((prev) => prev.map((c) => c.id === data.collaboration.id ? { ...c, ...data.collaboration } : c));
      toast('Colaborare confirmată!', 'success');
    } catch (err) {
      toast((err as ApiError).response?.data?.error ?? 'Eroare.', 'error');
    } finally {
      setConfirmingCollab(false);
    }
  };

  const activeInvestment = activeCollab?.idea
    ? investments.find((inv) => {
        const ids = new Set([activeConv?.participantA.id, activeConv?.participantB.id]);
        return inv.idea?.id === activeCollab.idea!.id && inv.antreprenor && ids.has(inv.antreprenor.id);
      }) ?? null
    : null;

  const handleProposeInvestment = async () => {
    if (!activeCollab?.idea || !proposeDesc.trim()) return;
    setProposingInv(true);
    try {
      const { data } = await api.post<{ investment: Investment }>('/investments', {
        ideaId: activeCollab.idea.id,
        amountDescription: proposeDesc.trim(),
        collaborationId: activeCollab.id,
      });
      setInvestments((prev) => [...prev, data.investment]);
      setShowProposeModal(false);
      setProposeDesc('');
      toast('Investiție propusă! Elevul trebuie să confirme.', 'success');
    } catch (err) {
      toast((err as ApiError).response?.data?.error ?? 'Eroare.', 'error');
    } finally {
      setProposingInv(false);
    }
  };

  const handleConfirmInvestment = async () => {
    if (!activeInvestment) return;
    setConfirmingInv(true);
    try {
      await api.post(`/investments/${activeInvestment.id}/confirm`);
      setInvestments((prev) =>
        prev.map((inv) => inv.id === activeInvestment.id ? { ...inv, status: 'ACTIV' } : inv),
      );
      toast('Investiție confirmată! Ideea este marcată ca realizată. 🏆', 'success');
    } catch (err) {
      toast((err as ApiError).response?.data?.error ?? 'Eroare.', 'error');
    } finally {
      setConfirmingInv(false);
    }
  };

  const handleInitiateCollab = async () => {
    if (!conversationId) return;
    setConfirmingCollab(true);
    try {
      const { data } = await api.post<{ collaboration: Collaboration }>(`/collaborations/initiate/${conversationId}`);
      setCollaborations((prev) => [...prev, data.collaboration]);
      toast('Colaborarea a fost inițiată. Confirmați ambii!', 'success');
    } catch (err) {
      toast((err as ApiError).response?.data?.error ?? 'Eroare.', 'error');
    } finally {
      setConfirmingCollab(false);
    }
  };

  return (
    <div
      className="flex h-full overflow-hidden"
      style={{ border: '1px solid var(--border)' }}
    >

      {/* ── Sidebar — pe mobil ascuns când e conversație sau grup activ ── */}
      <div className={`${(conversationId || activeGroupId) ? 'hidden lg:flex' : 'flex w-full'} lg:w-72 flex-col shrink-0`}
        style={{ backgroundColor: 'var(--bg-2)', borderRight: '1px solid var(--border)' }}>

        <div className="px-4 pt-4 pb-3 shrink-0 flex flex-col gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>Chat</p>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-2)' }} />
            <input
              type="text"
              value={chatSearch}
              onChange={(e) => setChatSearch(e.target.value)}
              placeholder="Caută conversație..."
              className="w-full pl-8 pr-3 py-2 text-xs rounded-xl outline-none"
              style={{
                backgroundColor: 'var(--bg-3)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--orange)')}
              onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
            />
            {chatSearch && (
              <button
                onClick={() => setChatSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--text-2)' }}
                aria-label="Șterge căutare"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Cereri pending */}
          {requests.length > 0 && (
            <div className="p-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-2)' }}>
                Cereri ({requests.length})
              </p>
              {requests.map((req) => {
                const isFromElev = req.fromUser.role === 'ELEV';
                const p = isFromElev ? req.fromUser.profileElev : req.fromUser.profileAntreprenor;
                const name = p ? `${p.firstName} ${p.lastName}` : 'Utilizator';
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
          ) : (() => {
            const filteredConversations = chatSearch.trim()
              ? conversations.filter((conv) =>
                  getOtherParty(conv, user!.id).name.toLowerCase().includes(chatSearch.toLowerCase()),
                )
              : conversations;
            return filteredConversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-8">
                <Search size={20} style={{ color: 'var(--text-2)' }} />
                <p className="text-xs" style={{ color: 'var(--text-2)' }}>Niciun rezultat</p>
              </div>
            ) : (
              <div className="p-2 space-y-0.5">
                {filteredConversations.map((conv, idx) => {
                const other = getOtherParty(conv, user!.id);
                const lastMsg = conv.messages[0];
                const active = conv.id === conversationId;
                const unread = unreadByConv[conv.id] ?? 0;
                const isMine = lastMsg?.senderId === user?.id;
                // Mesaj primit necitit → text evidențiat
                const msgHighlight = unread > 0 && !isMine;

                return (
                  <div key={conv.id}>
                  <button
                    onClick={() => navigate(`/chat/${conv.id}`)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-colors"
                    style={{
                      backgroundColor: active
                        ? 'rgba(246,166,35,0.1)'
                        : unread > 0
                          ? 'rgba(246,166,35,0.05)'
                          : 'transparent',
                      border: `1px solid ${
                        active
                          ? 'rgba(246,166,35,0.3)'
                          : unread > 0
                            ? 'rgba(246,166,35,0.18)'
                            : 'transparent'
                      }`,
                    }}>
                    {/* Avatar */}
                    <div className="relative shrink-0">
                      {other.avatar
                        ? <img src={other.avatar} alt={other.name} className="w-9 h-9 rounded-full object-cover" loading="lazy" />
                        : <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold"
                            style={{ backgroundColor: 'var(--bg-4)', color: 'var(--text-2)' }}>{initials(other.name)}</div>
                      }
                      {/* Prezență dot — verde=online, gri=offline */}
                      <div
                        className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 transition-colors duration-300"
                        style={{
                          backgroundColor: onlineUsers.has(other.id) ? '#22c55e' : 'var(--bg-4)',
                          borderColor: active ? 'rgba(246,166,35,0.15)' : 'var(--bg-2)',
                        }}
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Rândul 1: nume + timp + badge */}
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1 min-w-0">
                          <p className="text-xs truncate"
                            style={{
                              color: active ? 'var(--orange)' : 'var(--text)',
                              fontWeight: unread > 0 ? 700 : 600,
                            }}>
                            {other.name}
                          </p>
                          {mutedUsers.has(other.id) && (
                            <BellOff size={10} className="shrink-0" style={{ color: 'var(--text-2)' }} />
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {conv.lastMessageAt && (
                            <span className="text-[10px]"
                              style={{ color: unread > 0 ? 'var(--orange)' : 'var(--text-2)' }}>
                              {relativeTime(conv.lastMessageAt)}
                            </span>
                          )}
                          {unread > 0 && (
                            <span
                              className="flex items-center justify-center rounded-full text-[10px] font-bold"
                              style={{
                                minWidth: 18, height: 18, padding: '0 4px',
                                backgroundColor: 'var(--orange)', color: '#fff',
                              }}>
                              {unread > 99 ? '99+' : unread}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Rândul 2: ultimul mesaj cu prefix expeditor */}
                      {lastMsg && (
                        <div className="flex items-baseline gap-1 mt-0.5 min-w-0 overflow-hidden">
                          {isMine && (
                            <span className="text-[10px] shrink-0 font-medium" style={{ color: 'var(--text-2)' }}>Tu:</span>
                          )}
                          <p className="text-xs truncate"
                            style={{
                              color: msgHighlight ? 'var(--text)' : 'var(--text-2)',
                              fontWeight: msgHighlight ? 600 : 400,
                            }}>
                            {lastMsg.type === 'TEXT' ? lastMsg.content : '📎 Fișier'}
                          </p>
                        </div>
                      )}
                    </div>
                  </button>
                  {idx < filteredConversations.length - 1 && (
                    <div style={{ height: 1, backgroundColor: 'var(--border)', margin: '0 12px' }} />
                  )}
                  </div>
                );
              })}
              </div>
            );
          })()}
          {/* ── Secțiunea Grupuri în sidebar ── */}
          <div style={{ borderTop: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-2)' }}>
                Grupuri ({groups.length})
              </p>
              <button
                onClick={() => { setShowCreateGroup(true); setActiveGroupId(null); }}
                className="p-1 rounded-lg transition-colors"
                style={{ color: 'var(--text-2)' }}
                aria-label="Grup nou"
                title="Creează grup"
              >
                <Plus size={14} />
              </button>
            </div>
            {groups.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-1 py-4">
                <Users size={20} style={{ color: 'var(--text-2)', opacity: 0.4 }} />
                <p className="text-xs" style={{ color: 'var(--text-2)' }}>Niciun grup</p>
              </div>
            ) : (
              <div className="px-2 pb-2 space-y-0.5">
                {groups.map((g) => {
                  const isActive = g.id === activeGroupId;
                  const lastMsg = g.messages[0];
                  // Avatarele primilor 3 membri (fără userul curent)
                  const previewMembers = g.members.filter((m) => m.user.id !== user!.id).slice(0, 3);
                  return (
                    <button
                      key={g.id}
                      onClick={() => { setActiveGroupId(g.id); navigate('/chat'); }}
                      className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-colors"
                      style={{
                        backgroundColor: isActive ? 'rgba(246,166,35,0.1)' : 'transparent',
                        border: `1px solid ${isActive ? 'rgba(246,166,35,0.3)' : 'transparent'}`,
                      }}
                    >
                      {/* Mini avatare grup */}
                      <div className="relative w-9 h-9 shrink-0">
                        {previewMembers.slice(0, 2).map((m, idx) => {
                          const av = getGroupUserAvatar(m.user);
                          const nm = getGroupUserName(m.user);
                          return av ? (
                            <img key={idx} src={av} alt={nm}
                              className="absolute rounded-full object-cover border"
                              style={{
                                width: 22, height: 22,
                                top: idx === 0 ? 0 : 'auto',
                                bottom: idx === 1 ? 0 : 'auto',
                                left: idx === 0 ? 0 : 'auto',
                                right: idx === 1 ? 0 : 'auto',
                                borderColor: 'var(--bg-2)',
                              }}
                              loading="lazy"
                            />
                          ) : (
                            <div key={idx} className="absolute rounded-full flex items-center justify-center text-[9px] font-bold border"
                              style={{
                                width: 22, height: 22,
                                top: idx === 0 ? 0 : 'auto',
                                bottom: idx === 1 ? 0 : 'auto',
                                left: idx === 0 ? 0 : 'auto',
                                right: idx === 1 ? 0 : 'auto',
                                backgroundColor: 'var(--bg-4)',
                                color: 'var(--text-2)',
                                borderColor: 'var(--bg-2)',
                              }}
                            >
                              {initials(nm)}
                            </div>
                          );
                        })}
                        {previewMembers.length === 0 && (
                          <div className="w-9 h-9 rounded-full flex items-center justify-center"
                            style={{ backgroundColor: 'var(--bg-4)' }}>
                            <Users size={14} style={{ color: 'var(--text-2)' }} />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <p className="text-xs truncate font-semibold"
                            style={{ color: isActive ? 'var(--orange)' : 'var(--text)' }}>
                            {g.name}
                          </p>
                          {g.lastMessageAt && (
                            <span className="text-[10px] shrink-0" style={{ color: 'var(--text-2)' }}>
                              {relativeTime(g.lastMessageAt)}
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
      </div>

      {/* ── Group chat panel ── */}
      {activeGroupId && !conversationId ? (() => {
        const activeGroup = groups.find((g) => g.id === activeGroupId);
        if (!activeGroup) return null;
        return (
          <div className="flex-1 flex flex-col min-w-0" style={{ backgroundColor: 'var(--bg)' }}>
            {/* Header grup */}
            <div className="flex items-center gap-3 px-4 py-3 shrink-0"
              style={{ backgroundColor: 'var(--bg-2)', borderBottom: '1px solid var(--border)' }}>
              <button onClick={() => setActiveGroupId(null)} style={{ color: 'var(--text-2)' }}>
                <ArrowLeft size={18} />
              </button>
              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                style={{ backgroundColor: 'var(--bg-3)' }}>
                <Users size={14} style={{ color: 'var(--text-2)' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{activeGroup.name}</p>
                <p className="text-xs" style={{ color: 'var(--text-2)' }}>
                  {activeGroup.members.length} {activeGroup.members.length === 1 ? 'membru' : 'membri'}
                </p>
              </div>
            </div>

            {/* Mesaje grup */}
            <div ref={messagesContainerRef} className="flex-1 overflow-y-auto flex flex-col"
              style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
              <div className="flex-1 p-4 space-y-3">
                {loadingGroupMsgs ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 size={24} className="animate-spin" style={{ color: 'var(--text-2)' }} />
                  </div>
                ) : groupMessages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-2 opacity-40">
                    <MessageSquare size={32} style={{ color: 'var(--text-2)' }} />
                    <p className="text-sm" style={{ color: 'var(--text-2)' }}>Niciun mesaj în grup</p>
                  </div>
                ) : (
                  groupMessages.map((msg) => {
                    const mine = msg.sender.id === user?.id;
                    const senderName = getGroupUserName(msg.sender);
                    const senderAvatar = getGroupUserAvatar(msg.sender);
                    return (
                      <div key={msg.id} className={`flex gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
                        {!mine && (
                          senderAvatar
                            ? <img src={senderAvatar} alt={senderName} className="w-6 h-6 rounded-full object-cover shrink-0 mt-1" loading="lazy" />
                            : <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 mt-1"
                                style={{ backgroundColor: 'var(--bg-4)', color: 'var(--text-2)' }}>
                                {initials(senderName)}
                              </div>
                        )}
                        <div className="max-w-xs lg:max-w-sm">
                          {!mine && (
                            <p className="text-[10px] font-medium mb-0.5 px-1" style={{ color: 'var(--text-2)' }}>
                              {senderName}
                            </p>
                          )}
                          <div className="px-4 py-2.5 text-sm"
                            style={{
                              backgroundColor: mine ? 'var(--orange)' : 'var(--bg-2)',
                              color: mine ? '#fff' : 'var(--text)',
                              borderRadius: mine ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                            }}>
                            {msg.type === 'TEXT'
                              ? <p className="whitespace-pre-wrap wrap-break-word">{msg.content}</p>
                              : <a href={msg.fileUrl ?? '#'} target="_blank" rel="noopener noreferrer"
                                  className="flex items-center gap-2 underline">📎 Fișier</a>
                            }
                            <p className="text-xs mt-1 text-right"
                              style={{ color: mine ? 'rgba(255,255,255,0.65)' : 'var(--text-2)' }}>
                              {relativeTime(msg.createdAt)}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input grup */}
              <form onSubmit={(e) => void handleGroupSend(e)}
                className="sticky bottom-0 flex items-end gap-2 px-4 pt-4 shrink-0"
                style={{
                  borderTop: '1px solid var(--border)',
                  backgroundColor: 'var(--bg)',
                  paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
                }}>
                <textarea
                  value={groupText}
                  onChange={(e) => setGroupText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleGroupSend(e as unknown as FormEvent); }
                  }}
                  placeholder="Scrie un mesaj în grup..."
                  rows={1}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none resize-none"
                  style={{
                    backgroundColor: 'var(--bg-3)',
                    border: '1px solid var(--border)',
                    color: 'var(--text)',
                    maxHeight: 120,
                  }}
                />
                <button type="submit" disabled={!groupText.trim() || sendingGroup}
                  className="p-2.5 rounded-xl shrink-0 disabled:opacity-40"
                  style={{ backgroundColor: 'var(--orange)', color: '#fff' }}>
                  {sendingGroup ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                </button>
              </form>
            </div>
          </div>
        );
      })() : null}

      {/* ── Chat panel — pe mobil apare doar când e conversație deschisă ── */}
      {conversationId && activeConv ? (() => {
        const other = getOtherParty(activeConv, user!.id);
        const isElevToElev = activeConv.participantA.role === 'ELEV' && activeConv.participantB.role === 'ELEV';
        return (
          <div className="flex-1 flex flex-col min-w-0" style={{ backgroundColor: 'var(--bg)' }}>
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 shrink-0"
              style={{ backgroundColor: 'var(--bg-2)', borderBottom: '1px solid var(--border)' }}>
              <button onClick={() => navigate('/chat')} style={{ color: 'var(--text-2)' }}>
                <ArrowLeft size={18} />
              </button>
              {other.avatar
                ? <img src={other.avatar} alt={other.name} className="w-9 h-9 rounded-full object-cover" loading="lazy" />
                : <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ backgroundColor: 'var(--bg-4)', color: 'var(--text-2)' }}>{initials(other.name)}</div>
              }
              <div className="flex-1 min-w-0">
                {/* Mobil: nume + companie pe același rând, status dedesubt */}
                <div className="flex items-baseline gap-1.5 min-w-0 lg:hidden">
                  <p className="text-sm font-semibold shrink-0 max-w-35 truncate" style={{ color: 'var(--text)' }}>{other.name}</p>
                  {other.sub && (
                    <>
                      <span className="text-xs shrink-0" style={{ color: 'var(--text-2)' }}>·</span>
                      <span className="text-xs truncate" style={{ color: 'var(--text-2)' }}>{other.sub}</span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-1 lg:hidden">
                  <div className="w-1.5 h-1.5 rounded-full shrink-0 transition-colors"
                    style={{ backgroundColor: otherOnline ? '#22c55e' : 'var(--text-2)' }} />
                  <span className="text-xs" style={{ color: otherOnline ? '#22c55e' : 'var(--text-2)' }}>
                    {otherOnline ? 'Online' : 'Offline'}
                  </span>
                </div>

                {/* Desktop: nume pe linia 1, status + companie pe linia 2 */}
                <p className="hidden lg:block text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{other.name}</p>
                <div className="hidden lg:flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full shrink-0 transition-colors"
                    style={{ backgroundColor: otherOnline ? '#22c55e' : 'var(--text-2)' }} />
                  <span className="text-xs" style={{ color: otherOnline ? '#22c55e' : 'var(--text-2)' }}>
                    {otherOnline ? 'Online' : 'Offline'}
                  </span>
                  {other.sub && (
                    <>
                      <span className="text-xs" style={{ color: 'var(--text-2)' }}>·</span>
                      <span className="text-xs truncate" style={{ color: 'var(--text-2)' }}>{other.sub}</span>
                    </>
                  )}
                </div>
              </div>
              <div ref={chatMenuRef} className="relative shrink-0">
                <button
                  onClick={() => setShowChatMenu((v) => !v)}
                  className="p-2 rounded-xl transition-colors"
                  style={{
                    color: 'var(--text-2)',
                    backgroundColor: showChatMenu ? 'var(--bg-3)' : 'transparent',
                  }}
                  aria-label="Mai multe opțiuni"
                >
                  <MoreVertical size={18} />
                </button>
                {showChatMenu && (
                  <div
                    className="absolute right-0 top-full mt-1 rounded-xl overflow-hidden"
                    style={{
                      backgroundColor: 'var(--bg-2)',
                      border: '1px solid var(--border)',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
                      minWidth: 190,
                      zIndex: 50,
                    }}
                  >
                    <button
                      onClick={() => { setShowReport(true); setShowChatMenu(false); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left"
                      style={{ color: 'var(--text)' }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-3)')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <Flag size={14} style={{ color: '#ef4444' }} />
                      Raportează
                    </button>
                    <div style={{ height: 1, backgroundColor: 'var(--border)' }} />
                    <button
                      onClick={() => toggleMute(other.id)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left"
                      style={{ color: 'var(--text)' }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-3)')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      {mutedUsers.has(other.id) ? (
                        <><Bell size={14} style={{ color: 'var(--orange)' }} /> Activează notificări</>
                      ) : (
                        <><BellOff size={14} style={{ color: 'var(--text-2)' }} /> Silențios</>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Banner colaborare — doar pentru conversații elev-antreprenor */}
            {!isElevToElev && activeCollab ? (() => {
              const iConfirmed = isElev ? activeCollab.confirmedByElev : activeCollab.confirmedByAntreprenor;
              const otherConfirmed = isElev ? activeCollab.confirmedByAntreprenor : activeCollab.confirmedByElev;

              if (activeCollab.confirmedAt) {
                return (
                  <div className="flex items-center gap-2 px-4 py-2 text-xs"
                    style={{ backgroundColor: 'rgba(34,197,94,0.08)', borderBottom: '1px solid rgba(34,197,94,0.15)', color: '#22c55e' }}>
                    <CheckCircle2 size={13} />
                    <span className="font-medium">Colaborare confirmată</span>
                    {activeCollab.idea && <span style={{ color: 'var(--text-2)' }}>&nbsp;— {activeCollab.idea.title}</span>}
                  </div>
                );
              }

              if (iConfirmed) {
                return (
                  <div className="flex items-center gap-2 px-4 py-2 text-xs"
                    style={{ backgroundColor: 'rgba(246,166,35,0.06)', borderBottom: '1px solid rgba(246,166,35,0.15)', color: 'var(--text-2)' }}>
                    <Clock size={13} />
                    <span>Ai confirmat colaborarea. Aștepți confirmarea celeilalte părți.</span>
                  </div>
                );
              }

              return (
                <div className="flex items-center gap-3 px-4 py-2 text-xs"
                  style={{ backgroundColor: 'rgba(246,166,35,0.06)', borderBottom: '1px solid rgba(246,166,35,0.15)' }}>
                  <Handshake size={14} style={{ color: 'var(--orange)', flexShrink: 0 }} />
                  <span className="flex-1" style={{ color: 'var(--text-2)' }}>
                    {otherConfirmed
                      ? 'Cealaltă parte a confirmat colaborarea. Confirmă și tu!'
                      : 'Confirmă colaborarea pentru a o înregistra oficial.'}
                    {activeCollab.idea && <span className="font-medium" style={{ color: 'var(--text)' }}>&nbsp;— {activeCollab.idea.title}</span>}
                  </span>
                  <button
                    onClick={() => void handleConfirmCollab()}
                    disabled={confirmingCollab}
                    className="shrink-0 px-3 py-1 rounded-lg text-xs font-semibold disabled:opacity-50"
                    style={{ backgroundColor: 'var(--orange)', color: '#fff' }}>
                    {confirmingCollab ? <Loader2 size={12} className="animate-spin" /> : 'Confirmă'}
                  </button>
                </div>
              );
            })() : !isElevToElev ? (
              <div className="flex items-center gap-3 px-4 py-2 text-xs"
                style={{ borderBottom: '1px solid var(--border)' }}>
                <Handshake size={14} style={{ color: 'var(--text-2)', flexShrink: 0 }} />
                <span className="flex-1" style={{ color: 'var(--text-2)' }}>
                  Propune o colaborare oficială cu această persoană.
                </span>
                <button
                  onClick={() => void handleInitiateCollab()}
                  disabled={confirmingCollab}
                  className="shrink-0 px-3 py-1 rounded-lg text-xs font-semibold disabled:opacity-50"
                  style={{ backgroundColor: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                  {confirmingCollab ? <Loader2 size={12} className="animate-spin" /> : 'Propune colaborare'}
                </button>
              </div>
            ) : null}

            {/* Banner investiție — doar elev-antreprenor, după ce colaborarea e confirmată */}
            {!isElevToElev && activeCollab?.confirmedAt && (() => {
              const isAntreprenor = !isElev;

              if (activeInvestment?.status === 'ACTIV') {
                return (
                  <div className="flex items-center gap-2 px-4 py-2 text-xs"
                    style={{ backgroundColor: 'rgba(34,197,94,0.06)', borderBottom: '1px solid rgba(34,197,94,0.12)', color: '#22c55e' }}>
                    <Trophy size={13} />
                    <span className="font-medium">Investiție confirmată — proiect realizat!</span>
                    {activeInvestment.amountDescription && (
                      <span style={{ color: 'var(--text-2)' }}>&nbsp;· {activeInvestment.amountDescription}</span>
                    )}
                  </div>
                );
              }

              if (activeInvestment?.status === 'NECONFIRMAT') {
                if (isElev) {
                  return (
                    <div className="flex items-center gap-3 px-4 py-2 text-xs"
                      style={{ backgroundColor: 'rgba(99,102,241,0.06)', borderBottom: '1px solid rgba(99,102,241,0.15)' }}>
                      <TrendingUp size={14} style={{ color: '#6366f1', flexShrink: 0 }} />
                      <span className="flex-1" style={{ color: 'var(--text-2)' }}>
                        Antreprenorul a propus o investiție:{' '}
                        <span className="font-medium" style={{ color: 'var(--text)' }}>{activeInvestment.amountDescription}</span>
                      </span>
                      <button
                        onClick={() => void handleConfirmInvestment()}
                        disabled={confirmingInv}
                        className="shrink-0 px-3 py-1 rounded-lg text-xs font-semibold disabled:opacity-50"
                        style={{ backgroundColor: '#6366f1', color: '#fff' }}>
                        {confirmingInv ? <Loader2 size={12} className="animate-spin" /> : 'Confirmă investiția'}
                      </button>
                    </div>
                  );
                }
                return (
                  <div className="flex items-center gap-2 px-4 py-2 text-xs"
                    style={{ backgroundColor: 'rgba(99,102,241,0.06)', borderBottom: '1px solid rgba(99,102,241,0.12)', color: 'var(--text-2)' }}>
                    <Clock size={13} />
                    <span>Investiție propusă. Aștepți confirmarea elevului.</span>
                    <span className="font-medium" style={{ color: 'var(--text)' }}>&nbsp;· {activeInvestment.amountDescription}</span>
                  </div>
                );
              }

              // Nicio investiție propusă încă — antreprenorul poate propune
              if (isAntreprenor && activeCollab.idea) {
                return (
                  <div className="flex items-center gap-3 px-4 py-2 text-xs"
                    style={{ borderBottom: '1px solid var(--border)' }}>
                    <TrendingUp size={14} style={{ color: 'var(--text-2)', flexShrink: 0 }} />
                    <span className="flex-1" style={{ color: 'var(--text-2)' }}>
                      Colaborarea e confirmată. Poți propune o investiție oficială.
                    </span>
                    <button
                      onClick={() => setShowProposeModal(true)}
                      className="shrink-0 px-3 py-1 rounded-lg text-xs font-semibold"
                      style={{ backgroundColor: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                      Propune investiție
                    </button>
                  </div>
                );
              }

              return null;
            })()}

            {/* Zona de scroll — conține mesajele + inputul sticky
                iOS scrollează ACEST div, nu body-ul → topbar rămâne pe loc */}
            <div ref={messagesContainerRef} className="flex-1 overflow-y-auto flex flex-col" style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>

              {/* Mesaje — flex-1 împinge form-ul la fund când sunt puține mesaje */}
              <div className="flex-1 p-4 space-y-3">
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
                          <div className="flex items-center justify-end gap-1 mt-1">
                            <span className="text-xs" style={{ color: mine ? 'rgba(255,255,255,0.65)' : 'var(--text-2)' }}>
                              {relativeTime(msg.createdAt)}
                            </span>
                            {mine && (
                              msg.readAt
                                ? <CheckCheck size={13} style={{ color: 'rgba(255,255,255,0.95)', flexShrink: 0 }} />
                                : <Check size={13} style={{ color: 'rgba(255,255,255,0.5)', flexShrink: 0 }} />
                            )}
                          </div>
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

              {/* Input — sticky la fundul zonei de scroll */}
              {msgLimitReached ? (
                <div
                  className="sticky bottom-0 shrink-0 flex flex-col items-center gap-2 px-4 py-4"
                  style={{
                    borderTop: '1px solid var(--border)',
                    backgroundColor: 'var(--bg)',
                    paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
                  }}
                >
                  <div className="w-full rounded-2xl px-4 py-3 flex flex-col gap-1"
                    style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                    <p className="text-sm font-semibold" style={{ color: '#ef4444' }}>
                      Ai atins limita zilnică de mesaje
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-2)' }}>
                      Planul Gratuit permite 5 mesaje pe zi. Revino mâine sau upgradează la Pro pentru mesaje nelimitate.
                    </p>
                  </div>
                  <button
                    className="w-full py-2.5 rounded-xl text-sm font-semibold"
                    style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
                    onClick={() => navigate('/subscriptions')}
                  >
                    Upgradează la Pro
                  </button>
                </div>
              ) : (
                <>
                  {sendErr && (
                    <div className="px-4 py-2 text-xs font-medium shrink-0"
                      style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                      ⚠ {sendErr}
                    </div>
                  )}
                  <form onSubmit={(e) => void handleSend(e)}
                    className="sticky bottom-0 flex items-end gap-2 px-4 pt-4 shrink-0"
                    style={{
                      borderTop: '1px solid var(--border)',
                      backgroundColor: 'var(--bg)',
                      paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
                    }}>
                    <input
                      ref={fileInputRef} type="file" className="hidden"
                      tabIndex={-1}
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
                      onFocus={() => {
                        const el = messagesContainerRef.current;
                        if (!el) return;
                        distFromBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight;
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
                </>
              )}
            </div>
          </div>
        );
      })() : (
        <div className="hidden lg:flex flex-1 flex-col items-center justify-center gap-3" style={{ backgroundColor: 'var(--bg)' }}>
          <MessageSquare size={48} style={{ color: 'var(--text-2)', opacity: 0.25 }} />
          <p className="text-sm" style={{ color: 'var(--text-2)' }}>Selectează o conversație</p>
        </div>
      )}

      {/* Modal creare grup */}
      {showCreateGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-md rounded-2xl p-6"
            style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}>
            <h3 className="text-base font-bold mb-4" style={{ color: 'var(--text)' }}>
              Grup nou
            </h3>

            {/* Numele grupului */}
            <div className="mb-4">
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-2)' }}>
                Numele grupului
              </label>
              <input
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Ex: Proiect Eco-Tech..."
                maxLength={50}
                className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                style={{ backgroundColor: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)' }}
              />
            </div>

            {/* Search membri */}
            <div className="mb-3">
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-2)' }}>
                Adaugă membri
              </label>
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: 'var(--text-2)' }} />
                <input
                  type="text"
                  value={groupMemberSearch}
                  onChange={(e) => setGroupMemberSearch(e.target.value)}
                  placeholder="Caută după nume sau @username..."
                  className="w-full pl-8 pr-3 py-2 text-xs rounded-xl outline-none"
                  style={{ backgroundColor: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)' }}
                />
              </div>

              {/* Rezultate search */}
              {(groupMemberResults.length > 0 || searchingMembers) && (
                <div className="mt-1 rounded-xl overflow-hidden"
                  style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-3)' }}>
                  {searchingMembers ? (
                    <div className="flex items-center justify-center py-3">
                      <Loader2 size={14} className="animate-spin" style={{ color: 'var(--text-2)' }} />
                    </div>
                  ) : groupMemberResults.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => {
                        setSelectedMembers((prev) => [...prev, u]);
                        setGroupMemberResults((prev) => prev.filter((r) => r.id !== u.id));
                        setGroupMemberSearch('');
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
                      style={{ borderBottom: '1px solid var(--border)' }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-4)')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      {u.avatarUrl
                        ? <img src={u.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" loading="lazy" />
                        : <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                            style={{ backgroundColor: 'var(--bg-4)', color: 'var(--text-2)' }}>
                            {initials(`${u.firstName} ${u.lastName}`)}
                          </div>
                      }
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-1.5">
                          <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
                            {u.firstName} {u.lastName}
                          </p>
                          {u.username && (
                            <span className="text-xs shrink-0" style={{ color: 'var(--text-2)' }}>@{u.username}</span>
                          )}
                        </div>
                        <p className="text-xs truncate" style={{ color: 'var(--text-2)' }}>
                          {u.subtitle}{u.city ? ` · ${u.city}` : ''}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Membri selectați */}
            {selectedMembers.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {selectedMembers.map((m) => (
                  <div key={m.id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                    style={{ backgroundColor: 'rgba(246,166,35,0.12)', color: 'var(--orange)', border: '1px solid rgba(246,166,35,0.25)' }}>
                    {m.firstName} {m.lastName}
                    <button
                      type="button"
                      onClick={() => setSelectedMembers((prev) => prev.filter((s) => s.id !== m.id))}
                      className="ml-0.5"
                      aria-label={`Elimină ${m.firstName}`}
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setShowCreateGroup(false); setGroupName(''); setSelectedMembers([]); setGroupMemberSearch(''); }}
                className="flex-1 py-2 rounded-xl text-sm font-medium"
                style={{ backgroundColor: 'var(--bg-3)', color: 'var(--text-2)' }}>
                Anulează
              </button>
              <button
                type="button"
                onClick={() => void handleCreateGroup()}
                disabled={!groupName.trim() || selectedMembers.length === 0 || creatingGroup}
                className="flex-1 py-2 rounded-xl text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
                style={{ backgroundColor: 'var(--orange)', color: '#fff' }}>
                {creatingGroup ? <Loader2 size={14} className="animate-spin" /> : <Users size={14} />}
                Creează grup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal propune investiție */}
      {showProposeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-sm rounded-2xl p-6"
            style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}>
            <h3 className="text-base font-bold mb-1" style={{ color: 'var(--text)' }}>Propune investiție</h3>
            <p className="text-xs mb-4" style={{ color: 'var(--text-2)' }}>
              Descrie ce investiție propui. Elevul va trebui să confirme.
            </p>
            <textarea
              value={proposeDesc}
              onChange={(e) => setProposeDesc(e.target.value)}
              rows={3}
              placeholder="Ex: Finanțare 5000 lei pentru prototip + mentorat 6 luni..."
              className="w-full px-4 py-3 rounded-xl text-sm outline-none resize-none"
              style={{ backgroundColor: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
            <p className="text-xs mt-1 text-right" style={{ color: 'var(--text-2)' }}>{proposeDesc.length}/500</p>
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => { setShowProposeModal(false); setProposeDesc(''); }}
                className="flex-1 py-2 rounded-xl text-sm font-medium"
                style={{ backgroundColor: 'var(--bg-3)', color: 'var(--text-2)' }}>
                Anulează
              </button>
              <button
                onClick={() => void handleProposeInvestment()}
                disabled={proposeDesc.trim().length < 5 || proposingInv}
                className="flex-1 py-2 rounded-xl text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
                style={{ backgroundColor: '#6366f1', color: '#fff' }}>
                {proposingInv ? <Loader2 size={14} className="animate-spin" /> : <TrendingUp size={14} />}
                Trimite propunerea
              </button>
            </div>
          </div>
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
