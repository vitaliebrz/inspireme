import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Send, Paperclip, Flag, ArrowLeft, Loader2, MessageSquare, Handshake, CheckCircle2, Clock, TrendingUp, Trophy, Search, X, MoreVertical, BellOff, Bell, Check, CheckCheck, Users, UserPlus, Pencil, SquarePen, CornerUpLeft, ArrowDown, Camera, HeadphonesIcon, Lightbulb } from 'lucide-react';
import { api } from '../../lib/api';
import { playMessageSound } from '../../lib/sounds';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useNotifications } from '../../context/NotificationsContext';
import { useSocket } from '../../context/SocketContext';

interface ConversationItem {
  id: string;
  lastMessageAt: string | null;
  originIdeaId: string | null;
  originIdea: { id: string; title: string } | null;
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

interface ReplyInfo {
  id: string;
  content: string | null;
  type: string;
  sender: {
    profileElev: { firstName: string; lastName: string } | null;
    profileAntreprenor: { firstName: string; lastName: string } | null;
  };
}

interface Message {
  id: string;
  content: string;
  type: string;
  fileUrl: string | null;
  createdAt: string;
  senderId: string;
  readAt: string | null;
  ideaId: string | null;
  idea: { id: string; title: string } | null;
  replyTo: ReplyInfo | null;
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

interface PairIdea {
  idea: { id: string; title: string; category: string };
  collaboration: { id: string; ideaId: string; confirmedByElev: boolean; confirmedByAntreprenor: boolean; confirmedAt: string | null } | null;
  investment: { id: string; ideaId: string; status: string; amountDescription: string } | null;
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
  avatarUrl: string | null;
  createdAt: string;
  lastMessageAt: string | null;
  createdById: string;
  members: { role: string; user: GroupMemberUser }[];
  messages: { content: string | null; type: string; createdAt: string; senderId: string }[];
}

interface GroupMessage {
  id: string;
  content: string | null;
  type: string;
  fileUrl: string | null;
  createdAt: string;
  sender: GroupMemberUser;
  replyTo: ReplyInfo | null;
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

interface SupportMsg {
  id: string;
  content: string;
  isAdmin: boolean;
  senderId: string | null;
  createdAt: string;
}

interface SupportTicketState {
  id: string;
  status: string;
  messages: SupportMsg[];
}

interface AdminTicketItem {
  id: string;
  name: string;
  email: string;
  status: string;
  user: {
    id: string;
    role: string;
    profileElev: { firstName: string; lastName: string; avatarUrl: string | null } | null;
    profileAntreprenor: { firstName: string; lastName: string; avatarUrl: string | null } | null;
  } | null;
  messages: SupportMsg[];
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
  const location = useLocation();
  const { toast } = useToast();
  const { notifications, markConversation, markGroup, markSupport } = useNotifications();
  const { socket } = useSocket();

  // ideaId din URL (?ideaId=xxx) — setat când antreprenorul vine din pagina unei idei
  const activeIdeaId = useMemo(() => new URLSearchParams(location.search).get('ideaId'), [location.search]);

  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [chatSearch, setChatSearch] = useState('');
  const [requests, setRequests] = useState<ConnectionRequest[]>([]);
  const [collaborations, setCollaborations] = useState<Collaboration[]>([]);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [pairIdeas, setPairIdeas] = useState<PairIdea[]>([]);
  const [proposeInvIdeaId, setProposeInvIdeaId] = useState<string | null>(null);

  // State grupuri
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  // Contor local de mesaje necitite per grup — actualizat direct din socket, nu din notificări
  const [groupUnreadLocal, setGroupUnreadLocal] = useState<Record<string, number>>({});
  // Contor local de mesaje necitite per conversație 1-1 — actualizat direct din socket
  const [convUnreadLocal, setConvUnreadLocal] = useState<Record<string, number>>({});
  const [groupMsgLimitReached, setGroupMsgLimitReached] = useState(false);
  const [groupMessages, setGroupMessages] = useState<GroupMessage[]>([]);
  const [loadingGroupMsgs, setLoadingGroupMsgs] = useState(false);
  const [groupText, setGroupText] = useState('');
  const [sendingGroup, setSendingGroup] = useState(false);
  const [replyingToChat, setReplyingToChat] = useState<{ id: string; senderName: string; content: string | null; type: string } | null>(null);
  const [replyingToGroup, setReplyingToGroup] = useState<{ id: string; senderName: string; content: string | null; type: string } | null>(null);
  const [newChatMsgs, setNewChatMsgs] = useState(0);
  const [newGroupMsgs, setNewGroupMsgs] = useState(0);

  // State modal creare grup
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupMemberSearch, setGroupMemberSearch] = useState('');
  const [groupMemberResults, setGroupMemberResults] = useState<UserSearchResult[]>([]);
  const [groupMemberSuggestions, setGroupMemberSuggestions] = useState<UserSearchResult[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<UserSearchResult[]>([]);
  const [searchingMembers, setSearchingMembers] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);

  // State modal membri grup (cu sub-view adăugare + redenumire + avatar)
  const [showGroupMembers, setShowGroupMembers] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [editingGroupName, setEditingGroupName] = useState(false);
  const [groupNewName, setGroupNewName] = useState('');
  const [savingGroupName, setSavingGroupName] = useState(false);
  const [uploadingGroupAvatar, setUploadingGroupAvatar] = useState(false);
  const groupAvatarInputRef = useRef<HTMLInputElement>(null);
  const [addMemberSearch, setAddMemberSearch] = useState('');
  const [addMemberResults, setAddMemberResults] = useState<UserSearchResult[]>([]);
  const [addMemberSuggestions, setAddMemberSuggestions] = useState<UserSearchResult[]>([]);
  const [searchingAddMember, setSearchingAddMember] = useState(false);
  const [addingMember, setAddingMember] = useState(false);
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
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  // ─── Support ─────────────────────────────────────────────────────────────
  // activeSupportId: null = inactiv, 'me' = ticketul propriu, UUID = ticket admin
  const [activeSupportId, setActiveSupportId] = useState<string | null>(null);
  const [supportTicket, setSupportTicket] = useState<SupportTicketState | null>(null);
  const [adminSupportTickets, setAdminSupportTickets] = useState<AdminTicketItem[]>([]);
  const [loadingSupport, setLoadingSupport] = useState(false);
  const [supportText, setSupportText] = useState('');
  const [sendingSupport, setSendingSupport] = useState(false);
  const supportBottomRef = useRef<HTMLDivElement>(null);
  const supportMsgsRef = useRef<HTMLDivElement>(null);
  const supportInitialScrollDoneRef = useRef(false);
  const supportPrevMsgCountRef = useRef(0);
  // ─────────────────────────────────────────────────────────────────────────

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const chatMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const distFromBottomRef = useRef<number>(0);
  // true = prima încărcare a conversației → scroll instant; false = mesaj nou → scroll smooth
  const initialScrollRef = useRef(true);
  const awayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  // Dedup pentru mesaje grup — previne procesarea dublă (emitToGroup + emitToUser pot sosi amândouă)
  const groupMsgSeen = useRef(new Set<string>());
  const groupInputRef = useRef<HTMLTextAreaElement>(null);
  const isNearBottomRef = useRef(true);
  const groupInitialScrollDoneRef = useRef(false);
  const swipingRef = useRef<{
    startX: number; startY: number; currentX: number;
    dirLocked: 'h' | 'v' | null;
    mine: boolean;
    swipeTarget: HTMLElement | null;
    iconEl: HTMLElement | null;
    triggerReply: () => void;
    inputWasFocused: boolean;
  } | null>(null);

  const isElev = user?.role === 'ELEV';

  // Refocus input automat după ce se setează un reply (indiferent de cum — buton sau swipe)
  useEffect(() => {
    if (replyingToChat) setTimeout(() => chatInputRef.current?.focus(), 80);
  }, [replyingToChat]);
  useEffect(() => {
    if (replyingToGroup) setTimeout(() => groupInputRef.current?.focus(), 80);
  }, [replyingToGroup]);

  // Listă unificată conversații + grupuri sortate după ultimul mesaj (ca Telegram/Instagram)
  const allChats = useMemo(() => {
    const convItems = conversations.map((c) => ({
      kind: 'conv' as const,
      id: c.id,
      sortTime: c.lastMessageAt ? new Date(c.lastMessageAt).getTime() : 0,
      data: c,
    }));
    const groupItems = groups.map((g) => ({
      kind: 'group' as const,
      id: g.id,
      sortTime: g.lastMessageAt ? new Date(g.lastMessageAt).getTime() : 0,
      data: g,
    }));
    return [...convItems, ...groupItems].sort((a, b) => b.sortTime - a.sortTime);
  }, [conversations, groups]);

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

  // Număr mesaje necitite suport per ticket — din notificări SUPPORT_MESSAGE
  const unreadBySupport = useMemo(() => {
    const map: Record<string, number> = {};
    for (const n of notifications) {
      if (n.type === 'SUPPORT_MESSAGE' && !n.readAt) {
        const d = n.data as Record<string, string>;
        const ticketId = d['ticketId'];
        if (ticketId) map[ticketId] = (map[ticketId] ?? 0) + 1;
      }
    }
    return map;
  }, [notifications]);
  const totalSupportUnread = Object.values(unreadBySupport).reduce((a, b) => a + b, 0);

  // Tickete suport sortate: cu necitite primul, apoi după ultimul mesaj DESC
  const sortedAdminTickets = useMemo(() => {
    return [...adminSupportTickets].sort((a, b) => {
      const aUnread = unreadBySupport[a.id] ?? 0;
      const bUnread = unreadBySupport[b.id] ?? 0;
      if (aUnread > 0 && bUnread === 0) return -1;
      if (bUnread > 0 && aUnread === 0) return 1;
      const aTime = a.messages[0] ? new Date(a.messages[0].createdAt).getTime() : 0;
      const bTime = b.messages[0] ? new Date(b.messages[0].createdAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [adminSupportTickets, unreadBySupport]);

  // Număr mesaje necitite per grup din notificări (persistente după refresh)
  const unreadByGroup = useMemo(() => {
    const map: Record<string, number> = {};
    for (const n of notifications) {
      if (n.type === 'GROUP_MESSAGE' && !n.readAt) {
        const d = n.data as Record<string, string>;
        const gId = d['groupId'];
        if (gId) map[gId] = parseInt(d['count'] ?? '1', 10);
      }
    }
    return map;
  }, [notifications]);

  // Merge: contorul local (real-time via socket) + notificări (persistente)
  const effectiveGroupUnread = useMemo(() => {
    const merged: Record<string, number> = { ...unreadByGroup };
    for (const [gId, count] of Object.entries(groupUnreadLocal)) {
      merged[gId] = Math.max(merged[gId] ?? 0, count);
    }
    return merged;
  }, [unreadByGroup, groupUnreadLocal]);

  // Merge: contor local conversații 1-1 (real-time) + notificări (persistente după refresh)
  const effectiveConvUnread = useMemo(() => {
    const merged: Record<string, number> = { ...unreadByConv };
    for (const [cId, count] of Object.entries(convUnreadLocal)) {
      merged[cId] = Math.max(merged[cId] ?? 0, count);
    }
    return merged;
  }, [unreadByConv, convUnreadLocal]);

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

  const loadPairIdeas = useCallback(async (convId: string) => {
    try {
      const { data } = await api.get<{ ideas: PairIdea[] }>(`/collaborations/ideas/${convId}`);
      setPairIdeas(data.ideas);
    } catch {
      setPairIdeas([]);
    }
  }, []);

  useEffect(() => {
    if (!conversationId) { setPairIdeas([]); return; }
    void loadPairIdeas(conversationId);
  }, [conversationId, loadPairIdeas]);

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

  // Încarcă lista de tickete suport pentru admin la mount
  const isAdmin = user?.role === 'ADMIN';
  useEffect(() => {
    if (!isAdmin) return;
    api.get<{ tickets: AdminTicketItem[] }>('/support/admin')
      .then(({ data }) => setAdminSupportTickets(data.tickets))
      .catch(() => {});
  }, [isAdmin]);

  // Deschide panoul de suport + încarcă mesajele
  const openSupport = useCallback(async (id: 'me' | string) => {
    if (activeSupportId === id && supportTicket) return; // deja deschis
    setActiveSupportId(id);
    setActiveGroupId(null);
    navigate('/chat');
    supportInitialScrollDoneRef.current = false;
    supportPrevMsgCountRef.current = 0;
    setLoadingSupport(true);
    try {
      if (id === 'me') {
        let { data } = await api.get<{ ticket: SupportTicketState | null }>('/support/me');
        if (!data.ticket) {
          await api.post('/support/me/init', {
            name: user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : user?.email ?? 'Utilizator',
            email: user?.email ?? '',
          });
          const fresh = await api.get<{ ticket: SupportTicketState | null }>('/support/me');
          data = fresh.data;
        }
        if (data.ticket) {
          setSupportTicket(data.ticket);
          markSupport(data.ticket.id);
        }
      } else {
        const { data } = await api.get<{ ticket: SupportTicketState & { name: string; email: string } }>(`/support/admin/${id}/messages`);
        setSupportTicket({ id: data.ticket.id, status: data.ticket.status, messages: data.ticket.messages });
        markSupport(id);
        // Actualizează preview-ul din sidebar
        setAdminSupportTickets((prev) => prev.map((t) => t.id === id ? { ...t, messages: data.ticket.messages.slice(-1) } : t));
      }
    } finally {
      setLoadingSupport(false);
    }
  }, [activeSupportId, supportTicket, user, navigate, markSupport]);

  // Curăță activeSupportId când userul navighează la o conversație sau grup
  useEffect(() => { if (conversationId) setActiveSupportId(null); }, [conversationId]);
  useEffect(() => { if (activeGroupId) setActiveSupportId(null); }, [activeGroupId]);

  // Socket pentru camera de suport — re-join după restart server
  useEffect(() => {
    if (!activeSupportId || !socket || !supportTicket?.id) return;
    const roomId = supportTicket.id;
    const joinRoom = () => socket.emit('support:join', roomId);
    joinRoom();
    socket.on('connect', joinRoom);

    const handleNew = (msg: SupportMsg) => {
      const isOwn = activeSupportId === 'me' ? msg.senderId === user?.id : msg.isAdmin;
      if (isOwn) return;
      setSupportTicket((prev) => prev ? { ...prev, messages: [...prev.messages, msg] } : prev);
      // Actualizează preview în lista admin
      if (isAdmin) {
        setAdminSupportTickets((prev) => prev.map((t) => t.id === supportTicket.id ? { ...t, messages: [msg] } : t));
      }
      // Dacă panoul e deschis, marchează ca citit imediat
      markSupport(roomId);
    };
    socket.on('support:message:new', handleNew);

    return () => {
      socket.off('connect', joinRoom);
      socket.off('support:message:new', handleNew);
      socket.emit('support:leave', roomId);
    };
  }, [activeSupportId, supportTicket?.id, socket, user?.id, isAdmin, markSupport]);

  // Scroll pentru support — inițial instant, nou smooth
  useLayoutEffect(() => {
    if (!supportTicket || supportInitialScrollDoneRef.current) return;
    const el = supportMsgsRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    supportInitialScrollDoneRef.current = true;
  }, [supportTicket?.messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const count = supportTicket?.messages.length ?? 0;
    if (supportPrevMsgCountRef.current > 0 && count > supportPrevMsgCountRef.current) {
      supportBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    supportPrevMsgCountRef.current = count;
  }, [supportTicket?.messages.length]);

  const handleSupportSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const content = supportText.trim();
    if (!content || sendingSupport || !supportTicket) return;
    setSendingSupport(true);
    setSupportText('');
    try {
      if (activeSupportId === 'me') {
        const { data } = await api.post<{ ticketId: string; message: SupportMsg }>('/support/me/message', { content });
        setSupportTicket((prev) => prev ? { ...prev, messages: [...prev.messages, data.message] } : prev);
      } else if (activeSupportId) {
        const { data } = await api.post<{ message: SupportMsg }>(`/support/admin/${activeSupportId}/message`, { content });
        setSupportTicket((prev) => prev ? { ...prev, messages: [...prev.messages, data.message] } : prev);
      }
    } finally {
      setSendingSupport(false);
    }
  };

  // La deschiderea modalului, încarcă sugestii din conversații (elevi cu care am interacționat)
  useEffect(() => {
    if (!showCreateGroup) return;
    const excludeIds = selectedMembers.map((m) => m.id).join(',');
    api.get<{ users: UserSearchResult[] }>(`/search/users/suggestions?exclude=${excludeIds}`)
      .then(({ data }) => setGroupMemberSuggestions(data.users))
      .catch(() => {});
  }, [showCreateGroup, selectedMembers]);

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

  // Sugestii și debounce search pentru modalul de adăugare membri în grup existent
  useEffect(() => {
    if (!showAddMember || !activeGroupId) return;
    const existingIds = groups.find((g) => g.id === activeGroupId)?.members.map((m) => m.user.id).join(',') ?? '';
    api.get<{ users: UserSearchResult[] }>(`/search/users/suggestions?exclude=${existingIds}`)
      .then(({ data }) => setAddMemberSuggestions(data.users))
      .catch(() => {});
  }, [showAddMember, activeGroupId, groups]);

  useEffect(() => {
    if (addMemberSearch.trim().length < 2) {
      setAddMemberResults([]);
      return;
    }
    setSearchingAddMember(true);
    const existingIds = groups.find((g) => g.id === activeGroupId)?.members.map((m) => m.user.id).join(',') ?? '';
    const timer = setTimeout(() => {
      api.get<{ users: UserSearchResult[] }>(`/search/users?q=${encodeURIComponent(addMemberSearch)}&exclude=${existingIds}`)
        .then(({ data }) => setAddMemberResults(data.users))
        .catch(() => {})
        .finally(() => setSearchingAddMember(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [addMemberSearch, activeGroupId, groups]);

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

  // Actualizare preview sidebar + contor local pentru mesaje în conversații inactive
  // Ascultă global message:new — independent de conversația deschisă
  useEffect(() => {
    if (!socket) return;
    const handleMsgPreview = (data: {
      conversationId: string;
      message: { senderId: string; content?: string; type?: string; createdAt?: string; id?: string };
    }) => {
      if (data.message.senderId === user?.id) return; // mesajele proprii nu afectează preview-ul sau contorul
      // Actualizăm preview-ul conversației în sidebar dacă avem date complete
      if (data.message.content && data.message.type && data.message.createdAt) {
        setConversations((prev) =>
          prev.map((c) =>
            c.id === data.conversationId
              ? {
                  ...c,
                  lastMessageAt: data.message.createdAt!,
                  messages: [{ id: data.message.id ?? '', content: data.message.content!, type: data.message.type!, createdAt: data.message.createdAt!, senderId: data.message.senderId }],
                }
              : c,
          ),
        );
      }
      // Incrementăm contorul local doar pentru conversații inactive (nu cea deschisă)
      if (data.conversationId !== conversationId) {
        setConvUnreadLocal((prev) => ({ ...prev, [data.conversationId]: (prev[data.conversationId] ?? 0) + 1 }));
      }
    };
    socket.on('message:new', handleMsgPreview);
    return () => socket.off('message:new', handleMsgPreview);
  }, [socket, conversationId, user?.id]);

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
      const isOwn = data.message.senderId === user?.id;
      setMessages((prev) => {
        // Dedup — mesajul poate sosi atât din conversation room cât și din personal room
        if (prev.some((m) => m.id === data.message.id)) return prev;
        return [...prev, data.message];
      });
      if (isOwn) {
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 0);
      } else if (!isNearBottomRef.current) {
        setNewChatMsgs((c) => c + 1);
      }
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

  // Handler GLOBAL group:message:new — rulează indiferent dacă un grup e activ sau nu.
  // Prinde mesaje via personal room (emitToUser) pentru toate grupurile, inclusiv când
  // userul se află pe feed sau pe o conversație 1-1 și activeGroupId este null.
  useEffect(() => {
    if (!socket) return;
    const handleGroupMsgGlobal = (data: { groupId: string; message: GroupMessage }) => {
      // Dedup: emitToGroup + emitToUser pot livra același mesaj de două ori
      const key = data.message.id;
      if (groupMsgSeen.current.has(key)) return;
      groupMsgSeen.current.add(key);
      setTimeout(() => groupMsgSeen.current.delete(key), 500);

      // Actualizăm preview-ul din sidebar pentru orice grup (EVENT-urile nu apar în preview)
      if (data.message.type !== 'EVENT') {
        setGroups((prev) =>
          prev.map((g) =>
            g.id === data.groupId
              ? { ...g, lastMessageAt: data.message.createdAt, messages: [{ content: data.message.content, type: data.message.type, createdAt: data.message.createdAt, senderId: data.message.sender.id }] }
              : g,
          ),
        );
      }

      // Sunet + contor local pentru grupuri inactive și mesaje de la alții
      if (data.groupId !== activeGroupId && data.message.type !== 'EVENT' && data.message.sender.id !== user?.id) {
        void playMessageSound();
        setGroupUnreadLocal((prev) => ({ ...prev, [data.groupId]: (prev[data.groupId] ?? 0) + 1 }));
      }

      // Dacă grupul e activ — adăugăm mesajul în chat și marcăm ca citit
      if (data.groupId === activeGroupId) {
        markGroup(data.groupId);
        const isOwn = data.message.sender.id === user?.id;
        setGroupMessages((prev) => {
          if (prev.some((m) => m.id === data.message.id)) return prev;
          return [...prev, data.message];
        });
        if (isOwn) {
          setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 0);
        } else if (!isNearBottomRef.current) {
          setNewGroupMsgs((c) => c + 1);
        }
      }
    };
    socket.on('group:message:new', handleGroupMsgGlobal);
    return () => socket.off('group:message:new', handleGroupMsgGlobal);
  }, [socket, activeGroupId, markGroup, user?.id]);

  // Join/leave group room + actualizări metadata grup (redenumire, avatar, membri)
  useEffect(() => {
    if (!socket || !activeGroupId) return;

    const joinRoom = () => socket.emit('join:group', activeGroupId);
    joinRoom();
    socket.on('connect', joinRoom);

    const handleGroupUpdated = (data: { groupId: string; name?: string; avatarUrl?: string | null }) => {
      setGroups((prev) => prev.map((g) =>
        g.id === data.groupId ? { ...g, ...(data.name !== undefined && { name: data.name }), ...(data.avatarUrl !== undefined && { avatarUrl: data.avatarUrl }) } : g,
      ));
    };

    const handleGroupMemberAdded = (data: { groupId: string; member: { role: string; user: GroupMemberUser } }) => {
      setGroups((prev) => prev.map((g) =>
        g.id === data.groupId && !g.members.some((m) => m.user.id === data.member.user.id)
          ? { ...g, members: [...g.members, data.member] }
          : g,
      ));
    };

    socket.on('group:updated', handleGroupUpdated);
    socket.on('group:member:added', handleGroupMemberAdded);
    return () => {
      socket.off('connect', joinRoom);
      socket.off('group:updated', handleGroupUpdated);
      socket.off('group:member:added', handleGroupMemberAdded);
      socket.emit('leave:group', activeGroupId);
    };
  }, [socket, activeGroupId]);

  // Load group messages când se selectează un grup
  useEffect(() => {
    if (!activeGroupId) { setGroupMessages([]); return; }
    groupInitialScrollDoneRef.current = false;
    isNearBottomRef.current = true;
    setNewGroupMsgs(0);
    setGroupMsgLimitReached(false);
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
    isNearBottomRef.current = true;
    setNewChatMsgs(0);
    setMsgLimitReached(false);
    setMessages([]);
    setLoadingMsgs(true);
    api.get<{ items: Message[] }>(`/chat/conversations/${conversationId}/messages`)
      .then(({ data }) => {
        setMessages(data.items);
        api.patch(`/chat/conversations/${conversationId}/read`).catch(() => {});
      })
      .finally(() => setLoadingMsgs(false));
  }, [conversationId]);

  // Marchează notificările ca citite și resetează contorul local când conversația e deschisă
  useEffect(() => {
    if (!conversationId) return;
    void markConversation(conversationId);
    setConvUnreadLocal((prev) => {
      if (!prev[conversationId]) return prev;
      const next = { ...prev };
      delete next[conversationId];
      return next;
    });
  }, [conversationId, markConversation]);

  useEffect(() => {
    if (!activeGroupId) return;
    markGroup(activeGroupId);
    setGroupUnreadLocal((prev) => {
      if (!prev[activeGroupId]) return prev;
      const next = { ...prev };
      delete next[activeGroupId];
      return next;
    });
  }, [activeGroupId, markGroup]);

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

  // Scroll smooth pentru mesaje noi în timp real — doar dacă userul e aproape de fund
  useEffect(() => {
    if (messages.length === 0 || initialScrollRef.current) return;
    if (isNearBottomRef.current) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Scroll la ultimul mesaj la deschiderea unui grup
  useLayoutEffect(() => {
    if (!activeGroupId || groupMessages.length === 0 || groupInitialScrollDoneRef.current) return;
    const container = messagesContainerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
    groupInitialScrollDoneRef.current = true;
  }, [activeGroupId, groupMessages.length]);

  // Scroll smooth la mesaje noi în grup — doar dacă userul e aproape de fund
  useEffect(() => {
    if (!groupInitialScrollDoneRef.current || groupMessages.length === 0) return;
    if (isNearBottomRef.current) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [groupMessages]);

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

  // Restaurează modalul de grup dacă userul vine înapoi cu back de la profilul unui membru.
  // window.history.replaceState injectează _groupModal în intrarea curentă de history
  // înainte de navigare, iar la back React Router citește acea stare prin location.state.
  useEffect(() => {
    const state = location.state as { _groupModal?: string } | null;
    if (state?._groupModal) {
      setActiveGroupId(state._groupModal);
      setShowGroupMembers(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deschide grupul indicat de ?groupId= (venit dintr-o notificare de mesaj nou din grup)
  useEffect(() => {
    const gId = new URLSearchParams(location.search).get('groupId');
    if (!gId || groups.length === 0) return;
    if (groups.some((g) => g.id === gId)) {
      setActiveGroupId(gId);
      navigate('/chat', { replace: true });
    }
  }, [location.search, groups, navigate]);

  // Previne scroll orizontal al paginii în timp ce se face swipe pe un mesaj.
  // React atașează onTouchMove ca listener pasiv (nu poate chema preventDefault),
  // deci atașăm manual cu { passive: false } pe document.
  useEffect(() => {
    const prevent = (e: TouchEvent) => {
      if (swipingRef.current?.dirLocked === 'h') e.preventDefault();
    };
    document.addEventListener('touchmove', prevent, { passive: false });
    return () => document.removeEventListener('touchmove', prevent);
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
  const handleGroupSend = async (e?: FormEvent | React.KeyboardEvent) => {
    e?.preventDefault();
    if (!groupText.trim() || !activeGroupId || sendingGroup) return;
    // Focus sincron — iOS keyboard requirement
    groupInputRef.current?.focus();
    setSendingGroup(true);
    const content = groupText.trim();
    const replyToId = replyingToGroup?.id;
    setGroupText('');
    setReplyingToGroup(null);
    try {
      const { data } = await api.post<GroupMessage>(`/groups/${activeGroupId}/messages`, { content, replyToId });
      setGroupMessages((prev) => prev.some((m) => m.id === data.id) ? prev : [...prev, data]);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 0);
      // Livrare în timp real: server-side (emitToGroup în sendGroupMessage).
      setGroups((prev) =>
        prev.map((g) =>
          g.id === activeGroupId
            ? { ...g, lastMessageAt: data.createdAt, messages: [{ content: data.content, type: data.type, createdAt: data.createdAt, senderId: data.sender.id }] }
            : g,
        ),
      );
    } catch (err) {
      const status = (err as { response?: { status?: number } }).response?.status;
      if (status === 429) {
        setGroupMsgLimitReached(true);
      } else {
        toast('Eroare la trimitere mesaj grup.', 'error');
        setGroupText(content);
      }
    } finally {
      setSendingGroup(false);
    }
  };

  // Creare grup nou
  const handleCreateGroup = async () => {
    if (!groupName.trim() || creatingGroup) return;
    setCreatingGroup(true);
    try {
      const { data } = await api.post<{ group: GroupItem }>('/groups', {
        name: groupName.trim(),
        memberIds: selectedMembers.map((m) => m.id),
      });
      setGroups((prev) => [{ ...data.group, messages: [] }, ...prev]);
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

  // Redenumește grupul activ
  const handleRenameGroup = async () => {
    if (!activeGroupId || !groupNewName.trim() || savingGroupName) return;
    setSavingGroupName(true);
    try {
      const { data } = await api.patch<{ id: string; name: string }>(`/groups/${activeGroupId}`, { name: groupNewName.trim() });
      setGroups((prev) => prev.map((g) => g.id === data.id ? { ...g, name: data.name } : g));
      setEditingGroupName(false);
      toast('Denumirea grupului a fost actualizată.', 'success');
    } catch (err) {
      toast((err as ApiError).response?.data?.error ?? 'Eroare la redenumire.', 'error');
    } finally {
      setSavingGroupName(false);
    }
  };

  // Upload poză grup
  const handleGroupAvatarUpload = async (file: File) => {
    if (!activeGroupId || uploadingGroupAvatar) return;
    setUploadingGroupAvatar(true);
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      const { data } = await api.post<{ id: string; name: string; avatarUrl: string }>(`/groups/${activeGroupId}/avatar`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setGroups((prev) => prev.map((g) => g.id === data.id ? { ...g, avatarUrl: data.avatarUrl } : g));
      toast('Poza grupului a fost actualizată.', 'success');
    } catch (err) {
      toast((err as ApiError).response?.data?.error ?? 'Eroare la upload.', 'error');
    } finally {
      setUploadingGroupAvatar(false);
    }
  };

  // Adaugă un utilizator în grupul activ
  const handleAddMember = async (u: UserSearchResult) => {
    if (!activeGroupId || addingMember) return;
    setAddingMember(true);
    try {
      await api.post(`/groups/${activeGroupId}/members`, { userId: u.id });
      // Actualizează lista de membri în state (adaugă fără re-fetch)
      setGroups((prev) => prev.map((g) => {
        if (g.id !== activeGroupId) return g;
        const newMember: GroupMemberUser = {
          id: u.id,
          profileElev: u.role === 'ELEV' ? { firstName: u.firstName, lastName: u.lastName, username: u.username, avatarUrl: u.avatarUrl } : null,
          profileAntreprenor: u.role === 'ANTREPRENOR' ? { firstName: u.firstName, lastName: u.lastName, username: u.username, avatarUrl: u.avatarUrl, company: u.subtitle || null } : null,
        };
        return { ...g, members: [...g.members, { role: 'MEMBER', user: newMember }] };
      }));
      toast(`${u.firstName} ${u.lastName} a fost adăugat în grup.`, 'success');
      setShowAddMember(false);
      setAddMemberSearch('');
      setAddMemberResults([]);
      // Rămânem în modalul cu membri ca să se vadă lista actualizată
    } catch (err) {
      toast((err as ApiError).response?.data?.error ?? 'Eroare la adăugarea membrului.', 'error');
    } finally {
      setAddingMember(false);
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

  function getReplyInfoSenderName(r: ReplyInfo): string {
    const p = r.sender.profileElev ?? r.sender.profileAntreprenor;
    return p ? `${p.firstName} ${p.lastName}` : 'Utilizator';
  }

  // ── Swipe-to-reply (stânga) pe mobile ────────────────────────────────────
  const handleMsgSwipeStart = useCallback((
    e: React.TouchEvent<HTMLElement>,
    triggerReply: () => void,
    mine: boolean,
  ) => {
    const wrapper = e.currentTarget;
    swipingRef.current = {
      startX: e.touches[0].clientX,
      startY: e.touches[0].clientY,
      currentX: e.touches[0].clientX,
      dirLocked: null,
      mine,
      swipeTarget: wrapper.querySelector<HTMLElement>('[data-srow]'),
      iconEl: wrapper.querySelector<HTMLElement>('[data-ricon]'),
      triggerReply,
      inputWasFocused:
        document.activeElement === chatInputRef.current ||
        document.activeElement === groupInputRef.current,
    };
  }, []);

  const handleMsgSwipeMove = useCallback((e: React.TouchEvent) => {
    const s = swipingRef.current;
    if (!s) return;
    const touch = e.touches[0];
    s.currentX = touch.clientX;
    const rawDx = s.startX - touch.clientX; // pozitiv = swipe stânga
    // normalizăm: pozitiv = direcția corectă (stânga pt mesajele mele, dreapta pt celelalte)
    const dx = s.mine ? rawDx : -rawDx;
    const dy = Math.abs(touch.clientY - s.startY);
    if (s.dirLocked === null && (Math.abs(rawDx) > 8 || dy > 8)) {
      s.dirLocked = Math.abs(rawDx) > dy ? 'h' : 'v';
    }
    if (s.dirLocked !== 'h' || dx <= 0) return;
    const capped = Math.min(dx, 64);
    const progress = capped / 64;
    const dir = s.mine ? -1 : 1; // mine → slideaza stânga; altul → dreapta
    if (s.swipeTarget) s.swipeTarget.style.transform = `translateX(${(dir * capped * 0.55).toFixed(1)}px)`;
    if (s.iconEl) {
      s.iconEl.style.opacity = String(progress.toFixed(2));
      s.iconEl.style.transform = `translateY(-50%) scale(${(0.5 + progress * 0.5).toFixed(2)})`;
    }
  }, []);

  const handleMsgSwipeEnd = useCallback(() => {
    const s = swipingRef.current;
    if (!s) return;
    swipingRef.current = null;
    const rawDx = s.startX - s.currentX;
    const dx = s.mine ? rawDx : -rawDx; // normalizat: pozitiv = direcția corectă
    if (s.swipeTarget) {
      s.swipeTarget.style.transition = 'transform 0.18s cubic-bezier(0.25,0.46,0.45,0.94)';
      s.swipeTarget.style.transform = '';
      setTimeout(() => { if (s.swipeTarget) s.swipeTarget.style.transition = ''; }, 200);
    }
    if (s.iconEl) {
      s.iconEl.style.opacity = '0';
      s.iconEl.style.transform = 'translateY(-50%) scale(0.6)';
    }
    if (s.dirLocked === 'h' && dx >= 50) {
      // Focus SINCRON în touch handler — iOS permite keyboard show doar din user interaction
      (chatInputRef.current ?? groupInputRef.current)?.focus();
      s.triggerReply();
    } else if (s.inputWasFocused) {
      setTimeout(() => (chatInputRef.current ?? groupInputRef.current)?.focus(), 50);
    }
  }, []);

  const handleSend = async (e?: FormEvent | React.KeyboardEvent) => {
    e?.preventDefault();
    if (!text.trim() || !conversationId || sending) return;
    // Focus sincron — pe iOS tastatura rămâne vizibilă doar dacă focus e chemat
    // în interiorul user-interaction handler, înainte de orice await
    chatInputRef.current?.focus();
    setSending(true);
    const content = text.trim();
    const replyToId = replyingToChat?.id;
    setText('');
    setReplyingToChat(null);
    try {
      const { data } = await api.post<Message>(`/chat/conversations/${conversationId}/messages`, { content, replyToId, ...(activeIdeaId ? { ideaId: activeIdeaId } : {}) });
      setSendErr('');
      setMessages((prev) => prev.some((m) => m.id === data.id) ? prev : [...prev, data]);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 0);
      // Livrarea în timp real către celălalt participant se face server-side
      // (emitToConversation în sendMessage), nu prin retransmitere de la client.
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
      setMessages((prev) => prev.some((m) => m.id === data.id) ? prev : [...prev, data]);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 0);
      // Livrare în timp real: server-side (emitToConversation în sendMessage).
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

  const handleConfirmCollab = async (collab?: Collaboration) => {
    const target = collab ?? activeCollab;
    if (!target) return;
    setConfirmingCollab(true);
    try {
      const { data } = await api.post<{ collaboration: Collaboration }>(`/collaborations/${target.id}/confirm`);
      setCollaborations((prev) => prev.map((c) => c.id === data.collaboration.id ? { ...c, ...data.collaboration } : c));
      if (conversationId) await loadPairIdeas(conversationId);
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
    const targetIdeaId = proposeInvIdeaId ?? activeCollab?.idea?.id;
    if (!targetIdeaId || !proposeDesc.trim()) return;
    const targetCollab = pairIdeas.find((pi) => pi.idea.id === targetIdeaId)?.collaboration ?? activeCollab;
    setProposingInv(true);
    try {
      const { data } = await api.post<{ investment: Investment }>('/investments', {
        ideaId: targetIdeaId,
        amountDescription: proposeDesc.trim(),
        ...(targetCollab ? { collaborationId: targetCollab.id } : {}),
      });
      setInvestments((prev) => [...prev, data.investment]);
      setShowProposeModal(false);
      setProposeDesc('');
      setProposeInvIdeaId(null);
      if (conversationId) await loadPairIdeas(conversationId);
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

  const handleInitiateCollab = async (ideaId?: string) => {
    if (!conversationId) return;
    setConfirmingCollab(true);
    try {
      const { data } = await api.post<{ collaboration: Collaboration }>(
        `/collaborations/initiate/${conversationId}`,
        ideaId ? { ideaId } : {},
      );
      setCollaborations((prev) => [...prev, data.collaboration]);
      await loadPairIdeas(conversationId);
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
      <div className={`${(conversationId || activeGroupId || activeSupportId) ? 'hidden lg:flex' : 'flex w-full'} lg:w-72 flex-col shrink-0`}
        style={{ backgroundColor: 'var(--bg-2)', borderRight: '1px solid var(--border)' }}>

        <div className="px-4 pt-4 pb-3 shrink-0 flex flex-col gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>Chat</p>
            {user?.role === 'ELEV' && (
              <button
                onClick={() => { setShowCreateGroup(true); setActiveGroupId(null); }}
                className="p-1.5 rounded-lg transition-colors"
                style={{ color: 'var(--text-2)' }}
                aria-label="Grup nou"
                title="Creează grup nou"
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--orange)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-2)')}
              >
                <SquarePen size={15} />
              </button>
            )}
          </div>
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

          {/* Listă unificată conversații + grupuri */}
          {loadingConvs ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map((i) => <div key={i} className="skeleton h-14 rounded-xl" />)}
            </div>
          ) : allChats.length === 0 && (!isAdmin || sortedAdminTickets.length === 0) ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2">
              <MessageSquare size={24} style={{ color: 'var(--text-2)' }} />
              <p className="text-xs" style={{ color: 'var(--text-2)' }}>Nicio conversație</p>
            </div>
          ) : (() => {
            const q = chatSearch.trim().toLowerCase();
            const filtered = q
              ? allChats.filter((item) => {
                  if (item.kind === 'conv') {
                    return getOtherParty(item.data, user!.id).name.toLowerCase().includes(q);
                  }
                  return item.data.name.toLowerCase().includes(q);
                })
              : allChats;
            return filtered.length === 0 && !isAdmin ? (
              <div className="flex flex-col items-center justify-center gap-2 py-8">
                <Search size={20} style={{ color: 'var(--text-2)' }} />
                <p className="text-xs" style={{ color: 'var(--text-2)' }}>Niciun rezultat</p>
              </div>
            ) : (
              <div className="p-2 space-y-0.5">
                {filtered.map((item) => {
                  if (item.kind === 'conv') {
                    const conv = item.data;
                    const other = getOtherParty(conv, user!.id);
                    const lastMsg = conv.messages[0];
                    const active = conv.id === conversationId;
                    const unread = effectiveConvUnread[conv.id] ?? 0;
                    const isMine = lastMsg?.senderId === user?.id;
                    const msgHighlight = unread > 0 && !isMine;
                    return (
                      <button
                        key={`conv-${conv.id}`}
                        onClick={() => { setActiveGroupId(null); navigate(`/chat/${conv.id}`); }}
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
                        <div className="relative shrink-0">
                          {other.avatar
                            ? <img src={other.avatar} alt={other.name} className="w-9 h-9 rounded-full object-cover" loading="lazy" />
                            : <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold"
                                style={{ backgroundColor: 'var(--bg-4)', color: 'var(--text-2)' }}>{initials(other.name)}</div>
                          }
                          <div
                            className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 transition-colors duration-300"
                            style={{
                              backgroundColor: onlineUsers.has(other.id) ? '#22c55e' : 'var(--bg-4)',
                              borderColor: active ? 'rgba(246,166,35,0.15)' : 'var(--bg-2)',
                            }}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
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
                    );
                  }

                  // kind === 'group'
                  const g = item.data;
                  const isActive = g.id === activeGroupId;
                  const unreadG = effectiveGroupUnread[g.id] ?? 0;
                  const lastMsg = g.messages?.[0];
                  const isMineG = lastMsg?.senderId === user?.id;
                  const msgHighlightG = unreadG > 0 && !isMineG;
                  const previewMembers = g.members.filter((m) => m.user.id !== user!.id).slice(0, 2);
                  return (
                    <button
                      key={`group-${g.id}`}
                      onClick={() => { setActiveGroupId(g.id); navigate('/chat'); }}
                      className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-colors"
                      style={{
                        backgroundColor: isActive ? 'rgba(246,166,35,0.1)' : unreadG > 0 ? 'rgba(246,166,35,0.05)' : 'transparent',
                        border: `1px solid ${isActive ? 'rgba(246,166,35,0.3)' : unreadG > 0 ? 'rgba(246,166,35,0.18)' : 'transparent'}`,
                      }}
                    >
                      {/* Avatar grup: poză dacă există, altfel stacked mini avatare */}
                      <div className="relative w-9 h-9 shrink-0">
                        {g.avatarUrl ? (
                          <img src={g.avatarUrl} alt={g.name} className="w-9 h-9 rounded-full object-cover" loading="lazy" />
                        ) : previewMembers.length > 0 ? previewMembers.map((m, idx) => {
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
                        }) : (
                          <div className="w-9 h-9 rounded-full flex items-center justify-center"
                            style={{ backgroundColor: 'var(--bg-4)' }}>
                            <Users size={14} style={{ color: 'var(--text-2)' }} />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <div className="flex items-center gap-1 min-w-0">
                            <p className="text-xs truncate"
                              style={{
                                color: isActive ? 'var(--orange)' : 'var(--text)',
                                fontWeight: unreadG > 0 ? 700 : 600,
                              }}>
                              {g.name}
                            </p>
                            <Users size={9} className="shrink-0" style={{ color: 'var(--text-2)', opacity: 0.6 }} />
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {g.lastMessageAt && (
                              <span className="text-[10px]"
                                style={{ color: unreadG > 0 ? 'var(--orange)' : 'var(--text-2)' }}>
                                {relativeTime(g.lastMessageAt)}
                              </span>
                            )}
                            {unreadG > 0 && (
                              <span
                                className="flex items-center justify-center rounded-full text-[10px] font-bold"
                                style={{
                                  minWidth: 18, height: 18, padding: '0 4px',
                                  backgroundColor: 'var(--orange)', color: '#fff',
                                }}>
                                {unreadG > 99 ? '99+' : unreadG}
                              </span>
                            )}
                          </div>
                        </div>
                        {lastMsg && (
                          <div className="flex items-baseline gap-1 mt-0.5 min-w-0 overflow-hidden">
                            {isMineG && (
                              <span className="text-[10px] shrink-0 font-medium" style={{ color: 'var(--text-2)' }}>Tu:</span>
                            )}
                            <p className="text-xs truncate"
                              style={{
                                color: msgHighlightG ? 'var(--text)' : 'var(--text-2)',
                                fontWeight: msgHighlightG ? 600 : 400,
                              }}>
                              {lastMsg.type === 'TEXT' ? lastMsg.content : lastMsg.type === 'EVENT' ? lastMsg.content : '📎 Fișier'}
                            </p>
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}

                {/* Support tickets — admin, la finalul listei unificate */}
                {isAdmin && (() => {
                  const visibleTickets = q
                    ? sortedAdminTickets.filter((t) => {
                        const tp = t.user?.profileElev ?? t.user?.profileAntreprenor;
                        return (tp ? `${tp.firstName} ${tp.lastName}` : t.name).toLowerCase().includes(q);
                      })
                    : sortedAdminTickets;
                  if (q && visibleTickets.length === 0) return null;
                  return (
                    <>
                      <p className="text-[10px] font-semibold uppercase tracking-wide px-2 pt-3 pb-1"
                        style={{ color: 'var(--text-2)' }}>
                        Support {totalSupportUnread > 0 && `(${totalSupportUnread})`}
                      </p>
                      {visibleTickets.length === 0
                        ? <p className="text-xs px-2 pb-2" style={{ color: 'var(--text-2)' }}>Niciun ticket</p>
                        : visibleTickets.map((t) => {
                            const isActiveSup = activeSupportId === t.id;
                            const unreadSup = unreadBySupport[t.id] ?? 0;
                            const tp = t.user?.profileElev ?? t.user?.profileAntreprenor;
                            const tName = tp ? `${tp.firstName} ${tp.lastName}` : t.name;
                            const lastMsg = t.messages[0];
                            return (
                              <button key={t.id}
                                onClick={() => void openSupport(t.id)}
                                className="w-full flex items-center gap-2.5 p-3 rounded-xl text-left"
                                style={{
                                  backgroundColor: isActiveSup ? 'rgba(246,166,35,0.1)' : unreadSup > 0 ? 'rgba(246,166,35,0.05)' : 'transparent',
                                  border: `1px solid ${isActiveSup ? 'rgba(246,166,35,0.3)' : unreadSup > 0 ? 'rgba(246,166,35,0.18)' : 'transparent'}`,
                                }}>
                                <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-xs font-bold"
                                  style={{ backgroundColor: 'var(--bg-4)', color: 'var(--text-2)' }}>
                                  {initials(tName)}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs truncate"
                                    style={{ color: isActiveSup ? 'var(--orange)' : 'var(--text)', fontWeight: unreadSup > 0 ? 700 : 600 }}>
                                    {tName}
                                  </p>
                                  {lastMsg && (
                                    <p className="text-xs truncate mt-0.5"
                                      style={{ color: 'var(--text-2)', fontWeight: unreadSup > 0 ? 600 : 400 }}>
                                      {lastMsg.isAdmin ? 'Tu: ' : ''}{lastMsg.content}
                                    </p>
                                  )}
                                </div>
                                {unreadSup > 0 && (
                                  <span className="flex items-center justify-center rounded-full text-[10px] font-bold shrink-0"
                                    style={{ minWidth: 18, height: 18, padding: '0 4px', backgroundColor: 'var(--orange)', color: '#fff' }}>
                                    {unreadSup > 9 ? '9+' : unreadSup}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                    </>
                  );
                })()}
              </div>
            );
          })()}
        </div>

        {/* ── Suport InspireMe — pinned la baza sidebar-ului (doar utilizatori non-admin) ── */}
        {!isAdmin && (
          <div className="shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
            <button
              onClick={() => void openSupport('me')}
              className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
              style={{
                backgroundColor: activeSupportId === 'me' ? 'rgba(246,166,35,0.1)' : 'transparent',
              }}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                style={{ backgroundColor: 'rgba(246,166,35,0.12)' }}>
                <HeadphonesIcon size={15} style={{ color: 'var(--orange)' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate"
                  style={{ color: activeSupportId === 'me' ? 'var(--orange)' : 'var(--text)' }}>
                  Suport InspireMe
                </p>
                <p className="text-[10px]" style={{ color: 'var(--text-2)' }}>
                  Ajutor și întrebări
                </p>
              </div>
              {totalSupportUnread > 0 && (
                <span className="flex items-center justify-center rounded-full text-[10px] font-bold shrink-0"
                  style={{ minWidth: 18, height: 18, padding: '0 4px', backgroundColor: 'var(--orange)', color: '#fff' }}>
                  {totalSupportUnread > 9 ? '9+' : totalSupportUnread}
                </span>
              )}
            </button>
          </div>
        )}
      </div>

      {/* ── Group chat panel ── */}
      {activeGroupId && !conversationId ? (() => {
        const activeGroup = groups.find((g) => g.id === activeGroupId);
        if (!activeGroup) return null;
        return (
          <div className="flex-1 flex flex-col min-w-0 relative" style={{ backgroundColor: 'var(--bg)' }}>
            {/* Indicator mesaje noi — apare când userul e scrollat în sus */}
            {newGroupMsgs > 0 && (
              <button
                onClick={() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); setNewGroupMsgs(0); }}
                className="absolute bottom-24 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold shadow-lg"
                style={{ backgroundColor: 'var(--orange)', color: '#fff', zIndex: 20 }}
              >
                <ArrowDown size={13} />
                {newGroupMsgs === 1 ? 'Mesaj nou' : `${newGroupMsgs} mesaje noi`}
              </button>
            )}
            {/* Header grup */}
            <div className="flex items-center gap-3 px-4 py-3 shrink-0"
              style={{ backgroundColor: 'var(--bg-2)', borderBottom: '1px solid var(--border)' }}>
              <button onClick={() => { setActiveGroupId(null); setShowGroupMembers(false); setShowAddMember(false); setEditingGroupName(false); }} style={{ color: 'var(--text-2)' }}>
                <ArrowLeft size={18} />
              </button>
              <button
                className="flex items-center gap-2.5 max-w-xs text-left rounded-xl px-2 py-1 -mx-2 -my-1 transition-colors"
                onClick={() => setShowGroupMembers(true)}
                title="Detalii grup"
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-3)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                {activeGroup.avatarUrl
                  ? <img src={activeGroup.avatarUrl} alt={activeGroup.name} className="w-8 h-8 rounded-full object-cover shrink-0" loading="lazy" />
                  : <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: 'var(--bg-3)' }}>
                      <Users size={14} style={{ color: 'var(--text-2)' }} />
                    </div>
                }
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{activeGroup.name}</p>
                  <p className="text-xs" style={{ color: 'var(--text-2)' }}>
                    {activeGroup.members.length} {activeGroup.members.length === 1 ? 'membru' : 'membri'}
                  </p>
                </div>
              </button>
            </div>

            {/* Mesaje grup */}
            <div ref={messagesContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col"
              style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
              onScroll={(e) => {
                const el = e.currentTarget;
                const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
                isNearBottomRef.current = nearBottom;
                if (nearBottom && newGroupMsgs > 0) setNewGroupMsgs(0);
              }}>
              <div className="flex-1 p-4 space-y-3" onMouseDown={(e) => e.preventDefault()}>
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
                    // Mesaje sistem (EVENT) — afișate centrat, fără bubble
                    if (msg.type === 'EVENT') {
                      return (
                        <div key={msg.id} className="flex justify-center py-1">
                          <span className="text-[11px] px-3 py-1 rounded-full"
                            style={{ backgroundColor: 'var(--bg-3)', color: 'var(--text-2)' }}>
                            {msg.content}
                          </span>
                        </div>
                      );
                    }

                    const mine = msg.sender.id === user?.id;
                    const senderName = getGroupUserName(msg.sender);
                    const senderAvatar = getGroupUserAvatar(msg.sender);
                    const replyTrigger = () => setReplyingToGroup({ id: msg.id, senderName: mine ? 'Tu' : senderName, content: msg.content, type: msg.type });
                    return (
                      <div
                        key={msg.id}
                        data-msgid={msg.id}
                        className="relative"
                        onTouchStart={(e) => handleMsgSwipeStart(e, replyTrigger, mine)}
                        onTouchMove={handleMsgSwipeMove}
                        onTouchEnd={handleMsgSwipeEnd}
                      >
                        <div data-ricon="" className={`absolute ${mine ? 'right-1' : 'left-1'} top-1/2 pointer-events-none`} style={{ opacity: 0, transform: 'translateY(-50%) scale(0.6)', color: 'var(--orange)' }}>
                          <CornerUpLeft size={18} />
                        </div>
                        <div data-srow="" className={`group flex items-end gap-1 ${mine ? 'justify-end' : 'justify-start'}`}>
                          {!mine && (
                            senderAvatar
                              ? <img src={senderAvatar} alt={senderName} className="w-6 h-6 rounded-full object-cover shrink-0 mb-1" loading="lazy" />
                              : <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 mb-1"
                                  style={{ backgroundColor: 'var(--bg-4)', color: 'var(--text-2)' }}>
                                  {initials(senderName)}
                                </div>
                          )}
                          {mine && (
                            <button
                              onClick={replyTrigger}
                              className="hidden md:flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-full shrink-0"
                              style={{ color: 'var(--text-2)', backgroundColor: 'var(--bg-3)' }}
                              aria-label="Răspunde"
                            >
                              <CornerUpLeft size={14} />
                            </button>
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
                              {msg.replyTo && (
                                <div className="flex gap-1.5 mb-2 pb-2 rounded-lg px-2 py-1.5"
                                  style={{
                                    borderLeft: '2px solid',
                                    borderColor: mine ? 'rgba(255,255,255,0.5)' : 'var(--orange)',
                                    backgroundColor: mine ? 'rgba(0,0,0,0.15)' : 'var(--bg-3)',
                                  }}>
                                  <div className="min-w-0">
                                    <p className="text-[11px] font-semibold truncate" style={{ color: mine ? 'rgba(255,255,255,0.85)' : 'var(--orange)' }}>
                                      {getReplyInfoSenderName(msg.replyTo)}
                                    </p>
                                    <p className="text-[11px] truncate" style={{ color: mine ? 'rgba(255,255,255,0.6)' : 'var(--text-2)' }}>
                                      {msg.replyTo.type === 'TEXT' ? msg.replyTo.content : '📎 Fișier'}
                                    </p>
                                  </div>
                                </div>
                              )}
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
                          {!mine && (
                            <button
                              onClick={replyTrigger}
                              className="hidden md:flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-full shrink-0"
                              style={{ color: 'var(--text-2)', backgroundColor: 'var(--bg-3)' }}
                              aria-label="Răspunde"
                            >
                              <CornerUpLeft size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input grup — sau banner limită */}
              <div className="sticky bottom-0 shrink-0" style={{ backgroundColor: 'var(--bg)', zIndex: 10 }}>
                {groupMsgLimitReached ? (
                  <div className="flex flex-col items-center gap-2 px-4 py-4"
                    style={{ borderTop: '1px solid var(--border)', paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
                    <div className="w-full rounded-2xl px-4 py-3 flex flex-col gap-1"
                      style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                      <p className="text-sm font-semibold" style={{ color: '#ef4444' }}>
                        Ai atins limita zilnică de mesaje
                      </p>
                      <p className="text-xs" style={{ color: 'var(--text-2)' }}>
                        Planul Gratuit permite 5 mesaje pe zi (chat + grup cumulat). Revino mâine sau upgradează la Pro.
                      </p>
                    </div>
                    <button className="w-full py-2.5 rounded-xl text-sm font-semibold"
                      style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
                      onClick={() => navigate('/subscriptions')}>
                      Upgradează la Pro
                    </button>
                  </div>
                ) : null}
                {!groupMsgLimitReached && replyingToGroup && (
                  <div className="px-4 py-2.5 flex items-center gap-2"
                    style={{ borderTop: '1px solid var(--border)', backgroundColor: 'var(--bg-2)' }}>
                    <CornerUpLeft size={14} style={{ color: 'var(--orange)', flexShrink: 0 }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold truncate" style={{ color: 'var(--orange)' }}>
                        {replyingToGroup.senderName}
                      </p>
                      <p className="text-[11px] truncate" style={{ color: 'var(--text-2)' }}>
                        {replyingToGroup.type === 'TEXT' ? replyingToGroup.content : '📎 Fișier'}
                      </p>
                    </div>
                    <button onClick={() => setReplyingToGroup(null)} className="shrink-0 p-1" style={{ color: 'var(--text-2)' }} aria-label="Anulează reply">
                      <X size={14} />
                    </button>
                  </div>
                )}
                {!groupMsgLimitReached && <form onSubmit={(e) => e.preventDefault()}
                  className="flex items-end gap-2 px-4 pt-4"
                  style={{
                    borderTop: '1px solid var(--border)',
                    paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
                  }}>
                <textarea
                  ref={groupInputRef}
                  value={groupText}
                  onChange={(e) => setGroupText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleGroupSend(e); }
                  }}
                  onFocus={() => setKeyboardOpen(true)}
                  onBlur={() => setKeyboardOpen(false)}
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
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void handleGroupSend()}
                  disabled={!groupText.trim() || sendingGroup}
                  className="p-3 rounded-xl shrink-0 disabled:opacity-40"
                  style={{ backgroundColor: 'var(--orange)', color: '#fff' }}>
                  {sendingGroup ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                </button>
              </form>}
              </div>
            </div>
          </div>
        );
      })() : null}

      {/* ── Chat panel — pe mobil apare doar când e conversație deschisă ── */}
      {conversationId && activeConv ? (() => {
        const other = getOtherParty(activeConv, user!.id);
        const isElevToElev = activeConv.participantA.role === 'ELEV' && activeConv.participantB.role === 'ELEV';
        return (
          <div className="flex-1 flex flex-col min-w-0 relative" style={{ backgroundColor: 'var(--bg)' }}>
            {/* Indicator mesaje noi — apare când userul e scrollat în sus */}
            {newChatMsgs > 0 && (
              <button
                onClick={() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); setNewChatMsgs(0); }}
                className="absolute bottom-24 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold shadow-lg"
                style={{ backgroundColor: 'var(--orange)', color: '#fff', zIndex: 20 }}
              >
                <ArrowDown size={13} />
                {newChatMsgs === 1 ? 'Mesaj nou' : `${newChatMsgs} mesaje noi`}
              </button>
            )}
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 shrink-0"
              style={{ backgroundColor: 'var(--bg-2)', borderBottom: '1px solid var(--border)' }}>
              <button onClick={() => navigate('/chat')} style={{ color: 'var(--text-2)' }}>
                <ArrowLeft size={18} />
              </button>
              <button
                className="flex items-center gap-3 flex-1 min-w-0 rounded-xl px-2 py-1 -mx-2 -my-1 transition-colors text-left"
                onClick={() => navigate(`/profile/${other.id}`)}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-3)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
              {other.avatar
                ? <img src={other.avatar} alt={other.name} className="w-9 h-9 rounded-full object-cover shrink-0" loading="lazy" />
                : <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                    style={{ backgroundColor: 'var(--bg-4)', color: 'var(--text-2)' }}>{initials(other.name)}</div>
              }
              <div className="min-w-0">
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
              </button>
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

            {/* Banner idee de origine — afișat discret sub header, fix pentru toată durata conversației */}
            {activeConv.originIdea && (
              <div className="flex items-center gap-2 px-4 py-2 shrink-0"
                style={{ backgroundColor: 'var(--bg-3)', borderBottom: '1px solid var(--border)' }}>
                <Lightbulb size={12} className="shrink-0" style={{ color: 'var(--orange)' }} />
                <span className="text-[11px]" style={{ color: 'var(--text-2)' }}>Conectați prin ideea</span>
                <button
                  onClick={() => navigate(`/ideas/${activeConv.originIdea!.id}`)}
                  className="text-[11px] font-medium truncate max-w-[180px] hover:underline"
                  style={{ color: 'var(--orange)' }}
                  title={activeConv.originIdea.title}
                >
                  {activeConv.originIdea.title}
                </button>
              </div>
            )}

            {/* Bannerele de colaborare/investiție — multi-idee, se ascund când tastatura virtuală e deschisă */}
            {!keyboardOpen && !isElevToElev && pairIdeas.length > 0 && (
              <div className="shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
                {pairIdeas.map((pi) => {
                  const collab = pi.collaboration;
                  const inv = pi.investment ?? investments.find((i) => i.idea?.id === pi.idea.id && i.antreprenor && [activeConv.participantA.id, activeConv.participantB.id].includes(i.antreprenor.id) && ['NECONFIRMAT','ACTIV','IN_NEGOCIERE'].includes(i.status)) ?? null;
                  const iConfirmed = isElev ? collab?.confirmedByElev : collab?.confirmedByAntreprenor;
                  const otherConfirmed = isElev ? collab?.confirmedByAntreprenor : collab?.confirmedByElev;
                  return (
                    <div key={pi.idea.id} className="flex items-start gap-2 px-4 py-2.5 text-xs"
                      style={{ borderTop: '1px solid var(--border)' }}>
                      <Handshake size={13} className="mt-0.5 shrink-0" style={{ color: collab?.confirmedAt ? '#22c55e' : 'var(--orange)' }} />
                      <div className="flex-1 min-w-0">
                        <button
                          onClick={() => navigate(`/ideas/${pi.idea.id}`)}
                          className="font-medium hover:underline truncate block max-w-full text-left"
                          style={{ color: 'var(--text)' }}
                        >
                          {pi.idea.title}
                        </button>
                        <p className="mt-0.5" style={{ color: 'var(--text-2)' }}>
                          {collab?.confirmedAt
                            ? (inv?.status === 'ACTIV' ? '🏆 Investiție confirmată' : inv?.status === 'NECONFIRMAT' ? '💰 Investiție în așteptare' : '✓ Colaborare confirmată')
                            : collab
                              ? (iConfirmed ? '⏳ Așteptăm confirmarea celuilalt' : otherConfirmed ? '⚡ Celălalt a confirmat — confirmă și tu!' : '🤝 Colaborare inițiată')
                              : 'Fără colaborare'}
                        </p>
                      </div>
                      <div className="flex flex-col gap-1.5 items-end shrink-0">
                        {!collab && !isElev && (
                          <button
                            onClick={() => void handleInitiateCollab(pi.idea.id)}
                            disabled={confirmingCollab}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold disabled:opacity-50"
                            style={{ backgroundColor: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)' }}
                          >
                            {confirmingCollab ? <Loader2 size={11} className="animate-spin" /> : 'Colaborare'}
                          </button>
                        )}
                        {collab && !collab.confirmedAt && !iConfirmed && (
                          <button
                            onClick={() => {
                              const fullCollab = collaborations.find((c) => c.id === collab.id);
                              if (fullCollab) void handleConfirmCollab(fullCollab);
                            }}
                            disabled={confirmingCollab}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold disabled:opacity-50"
                            style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
                          >
                            {confirmingCollab ? <Loader2 size={11} className="animate-spin" /> : 'Confirmă'}
                          </button>
                        )}
                        {collab?.confirmedAt && !inv && !isElev && (
                          <button
                            onClick={() => { setProposeInvIdeaId(pi.idea.id); setShowProposeModal(true); }}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold"
                            style={{ backgroundColor: 'rgba(99,102,241,0.12)', color: '#6366f1' }}
                          >
                            Investiție
                          </button>
                        )}
                        {collab?.confirmedAt && inv?.status === 'NECONFIRMAT' && isElev && (
                          <button
                            onClick={() => void handleConfirmInvestment()}
                            disabled={confirmingInv}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold disabled:opacity-50"
                            style={{ backgroundColor: '#6366f1', color: '#fff' }}
                          >
                            {confirmingInv ? <Loader2 size={11} className="animate-spin" /> : 'Confirmă inv.'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Zona de scroll — conține mesajele + inputul sticky
                iOS scrollează ACEST div, nu body-ul → topbar rămâne pe loc */}
            <div ref={messagesContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col" style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
              onScroll={(e) => {
                const el = e.currentTarget;
                const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
                isNearBottomRef.current = nearBottom;
                if (nearBottom && newChatMsgs > 0) setNewChatMsgs(0);
              }}>

              {/* Mesaje — flex-1 împinge form-ul la fund când sunt puține mesaje */}
              <div className="flex-1 p-4 space-y-3" onMouseDown={(e) => e.preventDefault()}>
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
                  messages.map((msg, msgIdx) => {
                    const mine = msg.senderId === user?.id;
                    const otherP = mine ? null : (activeConv.participantA.id === user?.id ? activeConv.participantB : activeConv.participantA);
                    const otherName = otherP
                      ? (otherP.profileElev ? `${otherP.profileElev.firstName} ${otherP.profileElev.lastName}` : otherP.profileAntreprenor ? `${otherP.profileAntreprenor.firstName} ${otherP.profileAntreprenor.lastName}` : 'Utilizator')
                      : '';
                    const replyTrigger = () => setReplyingToChat({ id: msg.id, senderName: mine ? 'Tu' : otherName, content: msg.content, type: msg.type });
                    // EVENT messages — mesaje sistem centrate (fără bulă chat)
                    if (msg.type === 'EVENT') {
                      return (
                        <div key={msg.id} className="flex items-center gap-2 my-1 px-2">
                          <div className="flex-1 h-px" style={{ backgroundColor: 'var(--border)' }} />
                          <button
                            onClick={() => msg.ideaId && navigate(`/ideas/${msg.ideaId}`)}
                            className="text-[11px] font-medium px-3 py-1 rounded-full shrink-0 max-w-[240px] truncate"
                            style={{ backgroundColor: 'var(--bg-3)', color: 'var(--text-2)', border: '1px solid var(--border)' }}
                            title={msg.content ?? ''}
                            disabled={!msg.ideaId}
                          >
                            💡 {msg.content}
                          </button>
                          <div className="flex-1 h-px" style={{ backgroundColor: 'var(--border)' }} />
                        </div>
                      );
                    }
                    // Badge idee: afișat când ideaId se schimbă față de mesajul anterior
                    const prevIdeaId = msgIdx > 0 ? messages[msgIdx - 1]?.ideaId : null;
                    const showIdeaBadge = msg.ideaId && msg.idea && msg.ideaId !== prevIdeaId;
                    return (
                      <div key={msg.id}>
                        {showIdeaBadge && (
                          <div className="flex items-center gap-2 my-2 px-2">
                            <div className="flex-1 h-px" style={{ backgroundColor: 'var(--border)' }} />
                            <span
                              className="text-[11px] font-medium px-2.5 py-1 rounded-full shrink-0 max-w-[200px] truncate"
                              style={{ backgroundColor: 'rgba(246,166,35,0.12)', color: 'var(--orange)' }}
                              title={`Discuție despre: ${msg.idea!.title}`}
                            >
                              💡 {msg.idea!.title}
                            </span>
                            <div className="flex-1 h-px" style={{ backgroundColor: 'var(--border)' }} />
                          </div>
                        )}
                      <div
                        data-msgid={msg.id}
                        className="relative"
                        onTouchStart={(e) => handleMsgSwipeStart(e, replyTrigger, mine)}
                        onTouchMove={handleMsgSwipeMove}
                        onTouchEnd={handleMsgSwipeEnd}
                      >
                        {/* Icon reply revelat la swipe */}
                        <div data-ricon="" className={`absolute ${mine ? 'right-1' : 'left-1'} top-1/2 pointer-events-none`} style={{ opacity: 0, transform: 'translateY(-50%) scale(0.6)', color: 'var(--orange)' }}>
                          <CornerUpLeft size={18} />
                        </div>
                        <div data-srow="" className={`group flex items-center gap-1 ${mine ? 'justify-end' : 'justify-start'}`}>
                        {mine && (
                          <button
                            onClick={replyTrigger}
                            className="hidden md:flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-full shrink-0"
                            style={{ color: 'var(--text-2)', backgroundColor: 'var(--bg-3)' }}
                            aria-label="Răspunde"
                          >
                            <CornerUpLeft size={14} />
                          </button>
                        )}
                        <div className="max-w-xs lg:max-w-sm px-4 py-2.5 text-sm"
                          style={{
                            backgroundColor: mine ? 'var(--orange)' : 'var(--bg-2)',
                            color: mine ? '#fff' : 'var(--text)',
                            borderRadius: mine ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                          }}>
                          {msg.replyTo && (
                            <div className="flex gap-1.5 mb-2 pb-2 rounded-lg px-2 py-1.5"
                              style={{
                                borderLeft: '2px solid',
                                borderColor: mine ? 'rgba(255,255,255,0.5)' : 'var(--orange)',
                                backgroundColor: mine ? 'rgba(0,0,0,0.15)' : 'var(--bg-3)',
                              }}>
                              <div className="min-w-0">
                                <p className="text-[11px] font-semibold truncate" style={{ color: mine ? 'rgba(255,255,255,0.85)' : 'var(--orange)' }}>
                                  {getReplyInfoSenderName(msg.replyTo)}
                                </p>
                                <p className="text-[11px] truncate" style={{ color: mine ? 'rgba(255,255,255,0.6)' : 'var(--text-2)' }}>
                                  {msg.replyTo.type === 'TEXT' ? msg.replyTo.content : '📎 Fișier'}
                                </p>
                              </div>
                            </div>
                          )}
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
                        {!mine && (
                          <button
                            onClick={replyTrigger}
                            className="hidden md:flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-full shrink-0"
                            style={{ color: 'var(--text-2)', backgroundColor: 'var(--bg-3)' }}
                            aria-label="Răspunde"
                          >
                            <CornerUpLeft size={14} />
                          </button>
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

              {/* Input — sticky la fundul zonei de scroll, inclusiv bara de reply */}
              <div className="sticky bottom-0 shrink-0" style={{ backgroundColor: 'var(--bg)', zIndex: 10 }}>
              {msgLimitReached ? (
                <div
                  className="flex flex-col items-center gap-2 px-4 py-4"
                  style={{
                    borderTop: '1px solid var(--border)',
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
                  {replyingToChat && (
                    <div className="px-4 py-2.5 flex items-center gap-2"
                      style={{ borderTop: '1px solid var(--border)', backgroundColor: 'var(--bg-2)' }}>
                      <CornerUpLeft size={14} style={{ color: 'var(--orange)', flexShrink: 0 }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-semibold truncate" style={{ color: 'var(--orange)' }}>
                          {replyingToChat.senderName}
                        </p>
                        <p className="text-[11px] truncate" style={{ color: 'var(--text-2)' }}>
                          {replyingToChat.type === 'TEXT' ? replyingToChat.content : '📎 Fișier'}
                        </p>
                      </div>
                      <button onClick={() => setReplyingToChat(null)} className="shrink-0 p-1" style={{ color: 'var(--text-2)' }} aria-label="Anulează reply">
                        <X size={14} />
                      </button>
                    </div>
                  )}
                  {sendErr && (
                    <div className="px-4 py-2 text-xs font-medium"
                      style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                      ⚠ {sendErr}
                    </div>
                  )}
                  <form onSubmit={(e) => e.preventDefault()}
                    className="flex items-end gap-2 px-4 pt-4"
                    style={{
                      borderTop: '1px solid var(--border)',
                      paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
                    }}>
                    <input
                      ref={fileInputRef} type="file" className="hidden"
                      tabIndex={-1}
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFileUpload(f); e.target.value = ''; }}
                    />
                    <button type="button" onClick={() => fileInputRef.current?.click()}
                      className="p-3 rounded-xl shrink-0"
                      style={{ backgroundColor: 'var(--bg-3)', color: 'var(--text-2)' }}>
                      <Paperclip size={18} />
                    </button>
                    <textarea
                      ref={chatInputRef}
                      value={text}
                      onChange={(e) => { setText(e.target.value); handleTyping(); }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend(e); }
                      }}
                      onFocus={() => {
                        setKeyboardOpen(true);
                        const el = messagesContainerRef.current;
                        if (!el) return;
                        distFromBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight;
                      }}
                      onBlur={() => setKeyboardOpen(false)}
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
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => void handleSend()}
                      disabled={!text.trim() || sending}
                      className="p-3 rounded-xl shrink-0 disabled:opacity-40"
                      style={{ backgroundColor: 'var(--orange)', color: '#fff' }}>
                      {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                    </button>
                  </form>
                </>
              )}
              </div>
            </div>
          </div>
        );
      })() : activeSupportId ? (
        // ── Panou Support ──
        <div className="flex-1 flex flex-col min-w-0" style={{ backgroundColor: 'var(--bg)' }}>
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 shrink-0"
            style={{ backgroundColor: 'var(--bg-2)', borderBottom: '1px solid var(--border)' }}>
            <button onClick={() => { setActiveSupportId(null); setSupportTicket(null); }}
              className="lg:hidden" style={{ color: 'var(--text-2)' }}>
              <ArrowLeft size={18} />
            </button>
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
              style={{ backgroundColor: 'rgba(246,166,35,0.12)' }}>
              <HeadphonesIcon size={16} style={{ color: 'var(--orange)' }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                {activeSupportId === 'me' ? 'Suport InspireMe' : (() => {
                  const t = adminSupportTickets.find((t) => t.id === activeSupportId);
                  const p = t?.user?.profileElev ?? t?.user?.profileAntreprenor;
                  return p ? `${p.firstName} ${p.lastName}` : (t?.name ?? 'Suport');
                })()}
              </p>
              {activeSupportId !== 'me' && (() => {
                const t = adminSupportTickets.find((t) => t.id === activeSupportId);
                return t ? (
                  <p className="text-xs" style={{ color: 'var(--text-2)' }}>
                    {t.email} ·{' '}
                    <span style={{ color: supportTicket?.status === 'OPEN' ? '#22c55e' : '#ef4444' }}>
                      {supportTicket?.status === 'OPEN' ? 'Deschis' : 'Închis'}
                    </span>
                  </p>
                ) : null;
              })()}
            </div>
            {/* Buton rezolvare/redeschidere pentru admin */}
            {isAdmin && supportTicket && (
              supportTicket.status === 'OPEN' ? (
                <button
                  onClick={async () => {
                    await api.patch(`/support/admin/${activeSupportId}/resolve`);
                    setSupportTicket((prev) => prev ? { ...prev, status: 'CLOSED' } : prev);
                    setAdminSupportTickets((prev) => prev.map((t) => t.id === activeSupportId ? { ...t, status: 'CLOSED' } : t));
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer hover:opacity-80"
                  style={{ backgroundColor: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>
                  Închide
                </button>
              ) : (
                <button
                  onClick={async () => {
                    await api.patch(`/support/admin/${activeSupportId}/reopen`);
                    setSupportTicket((prev) => prev ? { ...prev, status: 'OPEN' } : prev);
                    setAdminSupportTickets((prev) => prev.map((t) => t.id === activeSupportId ? { ...t, status: 'OPEN' } : t));
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer hover:opacity-80"
                  style={{ backgroundColor: 'rgba(246,166,35,0.1)', color: 'var(--orange)' }}>
                  Redeschide
                </button>
              )
            )}
          </div>

          {/* Mesaje */}
          <div ref={supportMsgsRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {loadingSupport ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 size={24} className="animate-spin" style={{ color: 'var(--orange)' }} />
              </div>
            ) : !supportTicket || supportTicket.messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 opacity-50">
                <HeadphonesIcon size={36} style={{ color: 'var(--text-2)' }} />
                <p className="text-sm" style={{ color: 'var(--text-2)' }}>
                  {activeSupportId === 'me' ? 'Scrie-ne orice întrebare sau problemă.' : 'Niciun mesaj'}
                </p>
              </div>
            ) : (
              supportTicket.messages.map((msg) => {
                const isMe = activeSupportId === 'me' ? !msg.isAdmin : msg.isAdmin;
                return (
                  <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    {!isMe && (
                      <div className="w-6 h-6 rounded-full flex items-center justify-center mr-2 shrink-0 self-end"
                        style={{ backgroundColor: 'rgba(246,166,35,0.12)' }}>
                        <HeadphonesIcon size={12} style={{ color: 'var(--orange)' }} />
                      </div>
                    )}
                    <div className="max-w-xs lg:max-w-md">
                      <div className="px-3.5 py-2 rounded-2xl text-sm whitespace-pre-wrap"
                        style={isMe ? {
                          backgroundColor: 'var(--orange)', color: '#fff', borderBottomRightRadius: 4,
                        } : {
                          backgroundColor: 'var(--bg-3)', color: 'var(--text)', borderBottomLeftRadius: 4,
                        }}>
                        {msg.content}
                      </div>
                      <p className={`text-[10px] mt-0.5 ${isMe ? 'text-right' : 'text-left'}`}
                        style={{ color: 'var(--text-2)' }}>
                        {new Date(msg.createdAt).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })}
                        {isMe && <Check size={10} className="inline ml-1" />}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={supportBottomRef} />
          </div>

          {/* Input */}
          {supportTicket?.status === 'CLOSED' ? (
            <div className="p-3 text-center text-xs shrink-0"
              style={{ borderTop: '1px solid var(--border)', color: 'var(--text-2)' }}>
              Conversație închisă · {isAdmin ? 'apasă Redeschide pentru a continua' : 'contactați-ne la contact@inspireme.ro'}
            </div>
          ) : (
            <form onSubmit={(e) => void handleSupportSend(e)}
              className="flex items-end gap-2 p-3 shrink-0"
              style={{ borderTop: '1px solid var(--border)' }}>
              <textarea
                value={supportText}
                onChange={(e) => setSupportText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSupportSend(); } }}
                placeholder={isAdmin ? 'Răspunde utilizatorului...' : 'Scrie un mesaj... (Enter pentru trimitere)'}
                rows={1}
                className="flex-1 px-3 py-2 rounded-xl text-sm outline-none resize-none"
                style={{
                  backgroundColor: 'var(--bg-3)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  maxHeight: 100,
                }}
                onInput={(e) => {
                  const el = e.currentTarget;
                  el.style.height = 'auto';
                  el.style.height = `${Math.min(el.scrollHeight, 100)}px`;
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--orange)')}
                onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
              />
              <button type="submit"
                disabled={sendingSupport || !supportText.trim()}
                className="flex items-center justify-center w-9 h-9 rounded-xl cursor-pointer hover:opacity-90 disabled:opacity-40 shrink-0"
                style={{ backgroundColor: 'var(--orange)', color: '#fff' }}>
                {sendingSupport ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              </button>
            </form>
          )}
        </div>
      ) : !activeGroupId ? (
        <div className="hidden lg:flex flex-1 flex-col items-center justify-center gap-3" style={{ backgroundColor: 'var(--bg)' }}>
          <MessageSquare size={48} style={{ color: 'var(--text-2)', opacity: 0.25 }} />
          <p className="text-sm" style={{ color: 'var(--text-2)' }}>Selectează o conversație</p>
        </div>
      ) : null}

      {/* Modal creare grup */}
      {showCreateGroup && createPortal(
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

              {/* Lista utilizatori: rezultate căutare sau sugestii din conversații */}
              {(() => {
                const isSearching = groupMemberSearch.trim().length >= 2;
                const displayList = isSearching ? groupMemberResults : groupMemberSuggestions;
                if (!isSearching && displayList.length === 0) return null;
                return (
                  <div className="mt-1 rounded-xl overflow-hidden"
                    style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-3)' }}>
                    {searchingMembers ? (
                      <div className="flex items-center justify-center py-3">
                        <Loader2 size={14} className="animate-spin" style={{ color: 'var(--text-2)' }} />
                      </div>
                    ) : displayList.length === 0 && isSearching ? (
                      <p className="text-xs text-center py-3" style={{ color: 'var(--text-2)' }}>
                        Niciun elev găsit
                      </p>
                    ) : (
                      <>
                        {!isSearching && (
                          <p className="text-xs px-3 pt-2 pb-1 font-medium" style={{ color: 'var(--text-2)' }}>
                            Elevi cu care ai interacționat
                          </p>
                        )}
                        {displayList.map((u) => (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => {
                              setSelectedMembers((prev) => [...prev, u]);
                              setGroupMemberResults((prev) => prev.filter((r) => r.id !== u.id));
                              setGroupMemberSuggestions((prev) => prev.filter((r) => r.id !== u.id));
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
                              {(u.subtitle || u.city) && (
                                <p className="text-xs truncate" style={{ color: 'var(--text-2)' }}>
                                  {u.subtitle}{u.city ? ` · ${u.city}` : ''}
                                </p>
                              )}
                            </div>
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                );
              })()}
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
                disabled={!groupName.trim() || creatingGroup}
                className="flex-1 py-2 rounded-xl text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
                style={{ backgroundColor: 'var(--orange)', color: '#fff' }}>
                {creatingGroup ? <Loader2 size={14} className="animate-spin" /> : <Users size={14} />}
                Creează grup
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal membri grup (cu sub-view adăugare) */}
      {showGroupMembers && activeGroupId && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
          onClick={(e) => { if (e.target === e.currentTarget) { setShowGroupMembers(false); setShowAddMember(false); setEditingGroupName(false); setAddMemberSearch(''); setAddMemberResults([]); } }}>
          <div className="w-full max-w-md rounded-2xl overflow-hidden"
            style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}>
            {(() => {
              const g = groups.find((gr) => gr.id === activeGroupId);
              if (!g) return null;
              if (showAddMember) {
                // ── Sub-view: căutare și adăugare utilizator ──
                return (
                  <div className="p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <button
                        onClick={() => { setShowAddMember(false); setAddMemberSearch(''); setAddMemberResults([]); }}
                        className="p-1.5 rounded-lg transition-colors"
                        style={{ color: 'var(--text-2)' }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text)')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-2)')}
                      >
                        <ArrowLeft size={16} />
                      </button>
                      <h3 className="text-base font-bold" style={{ color: 'var(--text)' }}>Adaugă persoană</h3>
                    </div>

                    <div className="relative mb-3">
                      <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                        style={{ color: 'var(--text-2)' }} />
                      <input
                        type="text"
                        value={addMemberSearch}
                        onChange={(e) => setAddMemberSearch(e.target.value)}
                        placeholder="Caută după nume sau @username..."
                        autoFocus
                        className="w-full pl-8 pr-3 py-2 text-xs rounded-xl outline-none"
                        style={{ backgroundColor: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)' }}
                        onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--orange)')}
                        onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
                      />
                      {addMemberSearch && (
                        <button
                          onClick={() => { setAddMemberSearch(''); setAddMemberResults([]); }}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2"
                          style={{ color: 'var(--text-2)' }}
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>

                    {(() => {
                      const isSearching = addMemberSearch.trim().length >= 2;
                      const displayList = isSearching ? addMemberResults : addMemberSuggestions;
                      if (!isSearching && displayList.length === 0) return (
                        <p className="text-xs text-center py-4" style={{ color: 'var(--text-2)' }}>
                          Scrie cel puțin 2 caractere pentru a căuta
                        </p>
                      );
                      return (
                        <div className="rounded-xl overflow-hidden"
                          style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-3)', maxHeight: 300, overflowY: 'auto' }}>
                          {searchingAddMember ? (
                            <div className="flex items-center justify-center py-5">
                              <Loader2 size={16} className="animate-spin" style={{ color: 'var(--text-2)' }} />
                            </div>
                          ) : displayList.length === 0 && isSearching ? (
                            <p className="text-xs text-center py-4" style={{ color: 'var(--text-2)' }}>Niciun utilizator găsit</p>
                          ) : (
                            <>
                              {!isSearching && (
                                <p className="text-xs px-3 pt-2 pb-1 font-medium" style={{ color: 'var(--text-2)' }}>Sugestii</p>
                              )}
                              {displayList.map((u) => (
                                <button
                                  key={u.id}
                                  type="button"
                                  onClick={() => void handleAddMember(u)}
                                  disabled={addingMember}
                                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left disabled:opacity-50"
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
                                    {u.subtitle && (
                                      <p className="text-xs truncate" style={{ color: 'var(--text-2)' }}>{u.subtitle}</p>
                                    )}
                                  </div>
                                  {addingMember
                                    ? <Loader2 size={14} className="animate-spin shrink-0" style={{ color: 'var(--text-2)' }} />
                                    : <UserPlus size={14} className="shrink-0" style={{ color: 'var(--text-2)', opacity: 0.6 }} />
                                  }
                                </button>
                              ))}
                            </>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                );
              }

              // ── View principal: lista membrilor ──
              return (
                <>
                  {/* Input hidden pentru upload avatar */}
                  <input
                    ref={groupAvatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleGroupAvatarUpload(file);
                      e.target.value = '';
                    }}
                  />
                  {/* Header modal */}
                  <div className="flex items-center justify-between px-5 pt-5 pb-4">
                    <h3 className="text-base font-bold" style={{ color: 'var(--text)' }}>Editează grupul</h3>
                    <button
                      onClick={() => { setShowGroupMembers(false); setEditingGroupName(false); }}
                      className="p-1.5 rounded-lg transition-colors"
                      style={{ color: 'var(--text-2)' }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text)')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-2)')}
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {/* Avatar + denumire */}
                  <div className="flex flex-col items-center gap-3 px-5 pb-5" style={{ borderBottom: '1px solid var(--border)' }}>
                    {/* Avatar clickabil cu badge cameră permanent */}
                    <button
                      onClick={() => groupAvatarInputRef.current?.click()}
                      disabled={uploadingGroupAvatar}
                      className="relative w-20 h-20 rounded-full shrink-0 group"
                      title="Schimbă poza grupului"
                    >
                      {g.avatarUrl
                        ? <img src={g.avatarUrl} alt={g.name} className="w-20 h-20 rounded-full object-cover" />
                        : <div className="w-20 h-20 rounded-full flex items-center justify-center"
                            style={{ backgroundColor: 'var(--bg-3)' }}>
                            <Users size={28} style={{ color: 'var(--text-2)' }} />
                          </div>
                      }
                      {/* Hover overlay pentru desktop */}
                      <div className="absolute inset-0 rounded-full hidden md:flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ backgroundColor: 'rgba(0,0,0,0.40)' }}>
                        <Camera size={18} className="text-white" />
                      </div>
                      {/* Badge cameră permanent — vizibil mereu (esențial pe mobile) */}
                      <div className="absolute bottom-0.5 right-0.5 w-6 h-6 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: 'var(--orange)', border: '2px solid var(--bg-2)' }}>
                        {uploadingGroupAvatar
                          ? <Loader2 size={11} className="animate-spin text-white" />
                          : <Camera size={11} className="text-white" />
                        }
                      </div>
                    </button>

                    {/* Inline edit denumire */}
                    {editingGroupName ? (
                      <div className="flex items-center gap-1.5 w-full max-w-55">
                        <input
                          autoFocus
                          type="text"
                          value={groupNewName}
                          onChange={(e) => setGroupNewName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') void handleRenameGroup(); if (e.key === 'Escape') setEditingGroupName(false); }}
                          maxLength={50}
                          className="flex-1 min-w-0 px-2.5 py-1.5 text-sm font-semibold rounded-lg outline-none text-center"
                          style={{ backgroundColor: 'var(--bg-3)', border: '1px solid var(--orange)', color: 'var(--text)' }}
                        />
                        <button onClick={() => void handleRenameGroup()} disabled={!groupNewName.trim() || savingGroupName}
                          className="p-1.5 rounded-lg disabled:opacity-40" style={{ color: 'var(--orange)' }}>
                          {savingGroupName ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                        </button>
                        <button onClick={() => setEditingGroupName(false)} className="p-1.5 rounded-lg" style={{ color: 'var(--text-2)' }}>
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-1">
                        <button
                          onClick={() => { setGroupNewName(g.name); setEditingGroupName(true); }}
                          className="flex items-center gap-1.5 rounded-lg px-2 py-1 transition-colors"
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-3)')}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                        >
                          <span className="text-base font-bold" style={{ color: 'var(--text)' }}>{g.name}</span>
                          <Pencil size={12} style={{ color: 'var(--text-2)' }} />
                        </button>
                        <span className="text-xs" style={{ color: 'var(--text-2)' }}>
                          {g.members.length} {g.members.length === 1 ? 'membru' : 'membri'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Lista membri */}
                  <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                    <p className="px-5 pt-3 pb-1.5 text-xs font-semibold" style={{ color: 'var(--text-2)' }}>
                      Membri · {g.members.length}
                    </p>
                    {g.members.map((m, idx) => {
                      const name = getGroupUserName(m.user);
                      const avatar = getGroupUserAvatar(m.user);
                      const isMe = m.user.id === user?.id;
                      return (
                        <button key={m.user.id}
                          className="w-full flex items-center gap-3 px-5 py-2.5 text-left transition-colors"
                          style={{ borderTop: idx === 0 ? '1px solid var(--border)' : undefined }}
                          onClick={() => {
                            // Injectăm starea în intrarea curentă de history (React Router stochează usr în state.usr)
                            // astfel încât la back browser-ul restaurează _groupModal și redeschide modalul
                            const hs = window.history.state ?? {};
                            window.history.replaceState(
                              { ...hs, usr: { ...(hs.usr ?? {}), _groupModal: activeGroupId } },
                              '',
                            );
                            navigate(`/profile/${m.user.id}`);
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-3)')}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}>
                          {avatar
                            ? <img src={avatar} alt={name} className="w-9 h-9 rounded-full object-cover shrink-0" loading="lazy" />
                            : <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                                style={{ backgroundColor: 'var(--bg-3)', color: 'var(--text-2)' }}>
                                {initials(name)}
                              </div>
                          }
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{name}</p>
                              {isMe && (
                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0"
                                  style={{ backgroundColor: 'var(--bg-3)', color: 'var(--text-2)' }}>tu</span>
                              )}
                            </div>
                          </div>
                          {m.role === 'ADMIN' && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0"
                              style={{ backgroundColor: 'rgba(246,166,35,0.12)', color: 'var(--orange)' }}>
                              Admin
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <div className="px-5 py-4" style={{ borderTop: '1px solid var(--border)' }}>
                    <button
                      onClick={() => setShowAddMember(true)}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors"
                      style={{ backgroundColor: 'rgba(246,166,35,0.1)', color: 'var(--orange)', border: '1px solid rgba(246,166,35,0.2)' }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(246,166,35,0.18)')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(246,166,35,0.1)')}
                    >
                      <UserPlus size={14} />
                      Adaugă persoană
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>,
        document.body
      )}

      {/* Modal propune investiție */}
      {showProposeModal && createPortal(
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
                onClick={() => { setShowProposeModal(false); setProposeDesc(''); setProposeInvIdeaId(null); }}
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
        </div>,
        document.body
      )}

      {/* Modal raportare */}
      {showReport && createPortal(
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
        </div>,
        document.body
      )}
    </div>
  );
}
