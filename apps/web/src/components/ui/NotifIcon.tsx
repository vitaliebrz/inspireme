import type { ComponentType } from 'react';
import type { LucideProps } from 'lucide-react';
import {
  MessageSquare, UserPlus, Users, Star, Gift, Trophy,
  Handshake, CheckCircle2, RefreshCw, CreditCard, AlertTriangle,
  Info, Bell, Target, Lightbulb, Headphones,
} from 'lucide-react';

interface Entry { bg: string; color: string; Icon: ComponentType<LucideProps> }

const CONFIG: Record<string, Entry> = {
  MESSAGE_NEW:           { bg: 'rgba(59,130,246,0.13)',   color: '#3b82f6', Icon: MessageSquare },
  GROUP_MESSAGE:         { bg: 'rgba(59,130,246,0.13)',   color: '#3b82f6', Icon: Users },
  SUPPORT_MESSAGE:       { bg: 'rgba(59,130,246,0.13)',   color: '#3b82f6', Icon: Headphones },
  CONNECTION_REQUEST:    { bg: 'rgba(168,85,247,0.13)',   color: '#a855f7', Icon: UserPlus },
  CONNECTION_ACCEPTED:   { bg: 'rgba(168,85,247,0.13)',   color: '#a855f7', Icon: Users },
  IDEA_FEEDBACK:         { bg: 'rgba(168,85,247,0.13)',   color: '#a855f7', Icon: Star },
  IDEA_PUBLISHED:        { bg: 'rgba(246,166,35,0.13)',   color: '#f6a623', Icon: Lightbulb },
  IDEA_STATUS_RESET:     { bg: 'rgba(246,166,35,0.13)',   color: '#f6a623', Icon: RefreshCw },
  GIVEAWAY_NEW:          { bg: 'rgba(34,197,94,0.13)',    color: '#22c55e', Icon: Gift },
  GIVEAWAY_WON:          { bg: 'rgba(34,197,94,0.13)',    color: '#22c55e', Icon: Trophy },
  GIVEAWAY_RESULT:       { bg: 'rgba(34,197,94,0.13)',    color: '#22c55e', Icon: Target },
  COLLAB_CONFIRM:        { bg: 'rgba(168,85,247,0.13)',   color: '#a855f7', Icon: Handshake },
  COLLAB_CONFIRMED:      { bg: 'rgba(168,85,247,0.13)',   color: '#a855f7', Icon: CheckCircle2 },
  SUBSCRIPTION_EXPIRING: { bg: 'rgba(246,166,35,0.13)',   color: '#f6a623', Icon: CreditCard },
  ACCOUNT_WARNING:       { bg: 'rgba(239,68,68,0.13)',    color: '#ef4444', Icon: AlertTriangle },
  SYSTEM:                { bg: 'rgba(100,116,139,0.13)',  color: '#64748b', Icon: Info },
};
const FALLBACK: Entry = { bg: 'rgba(100,116,139,0.13)', color: '#64748b', Icon: Bell };

interface Props {
  type: string;
  /** Mărimea iconiței Lucide (default 16) */
  size?: number;
  /** Mărimea containerului rotunjit (default 36) */
  containerSize?: number;
}

export function NotifIcon({ type, size = 16, containerSize = 36 }: Props) {
  const { bg, color, Icon } = CONFIG[type] ?? FALLBACK;
  return (
    <div
      className="flex items-center justify-center rounded-xl shrink-0"
      style={{ width: containerSize, height: containerSize, backgroundColor: bg, color }}
    >
      <Icon size={size} />
    </div>
  );
}
