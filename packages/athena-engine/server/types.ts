import type { Peer } from 'crossws';

export type AreaName =
  | 'main_menu'
  | 'board_list'
  | 'reading_board'
  | 'composing'
  | 'mail_inbox'
  | 'mail_compose'
  | 'chat'
  | 'gopher'
  | 'game'
  | 'foss_browse'
  | 'sysop_console';

export interface UserRecord {
  id: number;
  handle: string;
  password_hash: string;
  real_name: string | null;
  location: string | null;
  bio: string | null;
  access_level: number;
  call_count: number;
  total_time_minutes: number;
  last_login: string | null;
  last_session_end: string | null;
  max_session_override: number | null;
  banned_until: string | null;
  ban_reason: string | null;
  banned_by: string | null;
  created_at: string;
}

export interface PeerData {
  id: string;
  peer: Peer;
  ip: string;
  state: 'connected' | 'authenticating' | 'authenticated';
  currentArea: AreaName;
  user: UserRecord | null;
  sessionStartedAt: number;
  lastActivity: number;
  timers: ReturnType<typeof setTimeout>[];
  reconnectToken: string | null;
  sessionTimedOut: boolean;
  // Auth flow tracking
  authStep: 'handle' | 'password' | 'confirm_takeover' | 'register_handle' | 'register_password' | 'register_confirm';
  pendingHandle: string | null;
  pendingPassword: string | null;
}
