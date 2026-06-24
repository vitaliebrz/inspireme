import { Redis } from '@upstash/redis';

export const redis = new Redis({
  url: process.env['UPSTASH_REDIS_REST_URL'] ?? '',
  token: process.env['UPSTASH_REDIS_REST_TOKEN'] ?? '',
});

// Chei Redis — prefix unic per tip
export const REDIS_KEYS = {
  session: (userId: string) => `session:${userId}`,
  refreshToken: (userId: string) => `rt:${userId}`,
  connectionRequests: (userId: string, date: string) => `cr:${userId}:${date}`,
  feedCache: (category: string, cursor: string) => `feed:${category}:${cursor}`,
  searchCache: (query: string) => `search:${encodeURIComponent(query)}`,
  msgLimit: (userId: string, date: string) => `msg:${userId}:${date}`,
  notifQueue: (userId: string) => `notif:queue:${userId}`,
  parentalConsent: (token: string) => `consent:${token}`,
  passwordReset: (token: string) => `reset:${token}`,
  emailVerify: (token: string) => `verify:${token}`,
  giveawayParticipants: (giveawayId: string) => `giv:participants:${giveawayId}`,
} as const;

export const REDIS_TTL = {
  feed: 60 * 5,              // 5 minute
  search: 60 * 5,            // 5 minute
  session: 60 * 15,          // 15 minute (access token)
  passwordReset: 60 * 60 * 24,    // 24 ore
  parentalConsent: 60 * 60 * 48,  // 48 ore
  emailVerify: 60 * 60 * 24,
} as const;
