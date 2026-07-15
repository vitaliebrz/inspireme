export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, string>;
  createdAt: string;
  readAt: string | null;
}

export function getNotifLink(notif: Pick<Notification, 'type' | 'data'>): string | null {
  const d = notif.data;
  if (notif.type === 'CONNECTION_REQUEST') return '/chat';
  if (notif.type === 'CONNECTION_ACCEPTED') return d['conversationId'] ? `/chat/${d['conversationId']}` : '/chat';
  if (notif.type === 'MESSAGE_NEW' && d['conversationId']) return `/chat/${d['conversationId']}`;
  if (notif.type === 'GROUP_MESSAGE' && d['groupId']) return `/chat?groupId=${d['groupId']}`;
  if (notif.type === 'SUPPORT_MESSAGE') return '/chat';
  if (notif.type === 'IDEA_FEEDBACK' && d['ideaId']) return `/idea/${d['ideaId']}`;
  if (notif.type === 'IDEA_PUBLISHED' && d['ideaId']) return `/idea/${d['ideaId']}`;
  if (notif.type.startsWith('GIVEAWAY') && d['giveawayId']) return `/giveaways/${d['giveawayId']}`;
  if (notif.type.startsWith('COLLAB') && d['ideaId']) return `/idea/${d['ideaId']}`;
  if (notif.type === 'SUBSCRIPTION_EXPIRING') return '/subscriptions';
  // Fallback generic pe baza datelor — acoperă notificările SYSTEM (ex. investiții) cu ideaId/giveawayId
  if (d['ideaId']) return `/idea/${d['ideaId']}`;
  if (d['giveawayId']) return `/giveaways/${d['giveawayId']}`;
  if (d['conversationId']) return `/chat/${d['conversationId']}`;
  return null;
}

export function relativeTime(dt: string) {
  const diff = (Date.now() - new Date(dt).getTime()) / 1000;
  if (diff < 60) return 'acum';
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}z`;
  return new Date(dt).toLocaleDateString('ro-RO', { day: '2-digit', month: 'short' });
}
