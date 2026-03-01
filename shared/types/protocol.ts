// ─── WebSocket Message Envelope ─────────────────────────────────────────────

export interface WSMessage<T = unknown> {
  type: string;
  payload: T;
  timestamp: string;
}

// ─── Inbound Payloads (Client → Engine) ─────────────────────────────────────

export interface LoginPayload {
  handle: string;
  password: string;
}

export interface RegisterPayload {
  handle: string;
  password: string;
}

export interface ReconnectPayload {
  token: string;
}

export interface CommandInputPayload {
  text: string;
}

export interface ChatMessagePayload {
  text: string;
}

export interface ChatPrivatePayload {
  to: string;
  text: string;
}

export interface GameActionPayload {
  gameId: string;
  input: string;
}

// ─── Outbound Payloads (Engine → Client) ─────────────────────────────────────

export interface AuthResultPayload {
  success: boolean;
  handle?: string;
  token?: string;
  error?: string;
}

export interface ScreenDisplayPayload {
  content: string;
  clear?: boolean;
  speed?: number;
}

export interface ScreenClearPayload {}

export interface CommandPromptPayload {
  prompt: string;
  mask?: boolean;
  maxLength?: number;
}

export interface ServerBusyPayload {
  message: string;
  current: number;
  max: number;
}

export interface ServerWelcomePayload {
  content: string;
}

export interface ServerGoodbyePayload {
  content: string;
}

export interface SessionWarningPayload {
  minutesRemaining: number;
}

export interface SessionTimeoutPayload {}

export interface SysopBroadcastPayload {
  message: string;
  from: string;
}

export interface NodeMessagePayload {
  from: string;
  text: string;
}

export interface ChatBroadcastPayload {
  from: string;
  text: string;
  action?: boolean;
}

export interface ChatSystemPayload {
  text: string;
}

export interface GameStatePayload {
  gameId: string;
  content: string;
}

export interface ErrorPayload {
  message: string;
  code?: string;
}

// ─── Board Directory Types ──────────────────────────────────────────────────

export interface BoardPublicInfo {
  id: string;
  name: string;
  tagline: string;
  sysop: string;
  theme: string;
  host: string;
  websocketPath: string;
  maxUsers: number;
  currentUsers: number;
  status: 'online' | 'offline';
  established: string;
  debug?: boolean;
}

export interface BoardListResponse {
  boards: BoardPublicInfo[];
}

// ─── Message Type Constants ─────────────────────────────────────────────────

export const WS_INBOUND_TYPES = [
  'auth.login',
  'auth.register',
  'auth.reconnect',
  'command.input',
  'chat.message',
  'chat.private',
  'game.action',
] as const;

export const WS_OUTBOUND_TYPES = [
  'auth.result',
  'screen.display',
  'screen.clear',
  'command.prompt',
  'chat.message',
  'chat.private',
  'chat.system',
  'game.state',
  'server.busy',
  'server.welcome',
  'server.goodbye',
  'session.warning',
  'session.timeout',
  'sysop.broadcast',
  'node.message',
  'error',
] as const;

export type WSInboundType = typeof WS_INBOUND_TYPES[number];
export type WSOutboundType = typeof WS_OUTBOUND_TYPES[number];

export const WS_MESSAGE_TYPES = new Set<string>([
  ...WS_INBOUND_TYPES,
  ...WS_OUTBOUND_TYPES,
]);

// ─── Limits ─────────────────────────────────────────────────────────────────

export const WS_LIMITS = {
  MAX_MESSAGE_BYTES: 8192,
  AUTH_TIMEOUT_MS: 30_000,
  RECONNECT_WINDOW_MS: 60_000,
  MAX_UNAUTH_PER_IP: 2,
  MAX_CONNECTIONS_PER_MINUTE: 10,
  LOGIN_RATE_LIMIT: 5,
  LOGIN_RATE_WINDOW_MS: 60_000,
  TAR_PIT_MS: 30_000,
  BCRYPT_COST: 12,
  SESSION_TOKEN_BYTES: 32,
} as const;
