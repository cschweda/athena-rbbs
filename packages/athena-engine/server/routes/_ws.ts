import { randomBytes } from 'node:crypto';
import { resolve, join } from 'node:path';
import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import {
  type WSMessage,
  type WSInboundType,
  WS_INBOUND_TYPES,
  WS_LIMITS,
} from '@athena/types';
import { validateHandle, validatePassword } from '@athena/types';
import { loadBoardConfig, loadScreen, interpolateScreen } from '../../config/loader';
import { initDatabase, getDb, getRawDb } from '../database/index';
import { users } from '../database/schema';
import type { PeerData, UserRecord, AreaName } from '../types';
import { log } from '../utils/logger';
import { setActivePeerCount } from '../utils/peers';
import type { BoardConfig } from '../../config/schema';

// ─── State ──────────────────────────────────────────────────────────────────

const peers = new Map<string, PeerData>();
const reconnectPool = new Map<string, PeerData>();
const connectionAttempts = new Map<string, number[]>();
const loginAttempts = new Map<string, number[]>();
const tarPitIPs = new Map<string, number>();

let boardConfig: BoardConfig;
let modulePath: string;
let allowedOrigins: string[] = [];
let dbInitialized = false;
let timersStarted = false;

// ─── Screens cache ──────────────────────────────────────────────────────────

const screens: Record<string, string> = {};

// ─── Initialize engine ─────────────────────────────────────────────────────

function ensureInitialized(): void {
  modulePath = process.env.MODULE_PATH || './board';
  const resolvedPath = resolve(modulePath);

  // Always re-read board.json and screens so edits are picked up on restart
  log('startup', { modulePath: resolvedPath });

  boardConfig = loadBoardConfig(modulePath);
  log('startup', { boardName: boardConfig.board.name, maxUsers: boardConfig.board.maxUsers });

  // Initialize database only once
  if (!dbInitialized) {
    const dbPath = join(resolvedPath, 'data', 'board.db');
    initDatabase(dbPath, boardConfig);
    log('startup', { database: dbPath });
    dbInitialized = true;
  }

  // Always reload screens, interpolating board.json values
  screens.splash = interpolateScreen(loadScreen(resolvedPath, boardConfig.screens.splash), boardConfig);
  screens.goodbye = interpolateScreen(loadScreen(resolvedPath, boardConfig.screens.goodbye), boardConfig);
  screens.newuser = interpolateScreen(loadScreen(resolvedPath, boardConfig.screens.newuser), boardConfig);
  screens.menu = interpolateScreen(loadScreen(resolvedPath, boardConfig.screens.menu), boardConfig);

  // Parse allowed origins
  allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];

  // Bootstrap SysOp
  bootstrapSysOp();

  // Start cleanup timers only once
  if (!timersStarted) {
    // Reconnect pool cleanup (every 10s)
    setInterval(() => {
      const now = Date.now();
      for (const [token, peer] of reconnectPool) {
        if (now - peer.lastActivity > WS_LIMITS.RECONNECT_WINDOW_MS) {
          reconnectPool.delete(token);
        }
      }
    }, 10_000);

    // Connection attempts cleanup (every 60s)
    setInterval(() => {
      const now = Date.now();
      for (const [ip, timestamps] of connectionAttempts) {
        const recent = timestamps.filter((t) => now - t < 60_000);
        if (recent.length === 0) {
          connectionAttempts.delete(ip);
        } else {
          connectionAttempts.set(ip, recent);
        }
      }
    }, 60_000);

    timersStarted = true;
  }

  log('startup', { status: 'ready', board: boardConfig.board.name });
}

// ─── SysOp Bootstrap ────────────────────────────────────────────────────────

function bootstrapSysOp(): void {
  const handle = process.env.SYSOP_HANDLE;
  const password = process.env.SYSOP_PASSWORD;
  if (!handle || !password) return;

  const db = getRawDb();
  const existing = db.prepare('SELECT id FROM users WHERE access_level = 9').get();
  if (existing) return;

  const hash = bcrypt.hashSync(password, WS_LIMITS.BCRYPT_COST);
  db.prepare(
    'INSERT INTO users (handle, password_hash, access_level) VALUES (?, ?, 9)'
  ).run(handle, hash);

  log('startup', { sysopBootstrap: handle });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function updatePeerCount(): void {
  let count = 0;
  for (const p of peers.values()) {
    if (p.state === 'authenticated') count++;
  }
  setActivePeerCount(count);
}

function generatePeerId(): string {
  return randomBytes(16).toString('hex');
}

function generateToken(): string {
  return randomBytes(WS_LIMITS.SESSION_TOKEN_BYTES).toString('hex');
}

function getIP(peer: any): string {
  try {
    const req = peer.request || peer.ctx?.request || peer.websocket?.request;
    // Only trust X-Forwarded-For behind a reverse proxy
    if (req && process.env.TRUST_PROXY === 'true') {
      const forwarded = req.headers?.get?.('x-forwarded-for') || req.headers?.['x-forwarded-for'];
      if (forwarded) return String(forwarded).split(',')[0].trim();
    }
    return peer.remoteAddress || peer.addr || '0.0.0.0';
  } catch {
    return '0.0.0.0';
  }
}

function send(peerData: PeerData, type: string, payload: Record<string, unknown> = {}): void {
  const msg: WSMessage = {
    type,
    payload,
    timestamp: new Date().toISOString(),
  };
  try {
    peerData.peer.send(JSON.stringify(msg));
  } catch {
    // Connection may have closed
  }
}

function sendScreen(peerData: PeerData, content: string, clear = false, speed?: number): void {
  send(peerData, 'screen.display', { content, clear, speed });
}

function sendPrompt(peerData: PeerData, prompt: string, mask = false, maxLength?: number): void {
  send(peerData, 'command.prompt', { prompt, mask, maxLength });
}

function sendError(peerData: PeerData, message: string, code?: string): void {
  send(peerData, 'error', { message, code });
}

// ─── Rate Limiting ──────────────────────────────────────────────────────────

function checkConnectionRate(ip: string): boolean {
  const now = Date.now();
  const attempts = (connectionAttempts.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (attempts.length >= WS_LIMITS.MAX_CONNECTIONS_PER_MINUTE) return false;
  attempts.push(now);
  connectionAttempts.set(ip, attempts);
  return true;
}

function checkLoginRate(ip: string): { allowed: boolean; tarPit: boolean } {
  const now = Date.now();

  // Check tar pit
  const tarPitUntil = tarPitIPs.get(ip);
  if (tarPitUntil && now < tarPitUntil) {
    return { allowed: false, tarPit: true };
  }
  if (tarPitUntil) tarPitIPs.delete(ip);

  const attempts = (loginAttempts.get(ip) ?? []).filter((t) => now - t < WS_LIMITS.LOGIN_RATE_WINDOW_MS);
  if (attempts.length >= WS_LIMITS.LOGIN_RATE_LIMIT) {
    // 6th attempt triggers tar pit
    tarPitIPs.set(ip, now + WS_LIMITS.TAR_PIT_MS);
    loginAttempts.set(ip, attempts);
    return { allowed: false, tarPit: true };
  }
  attempts.push(now);
  loginAttempts.set(ip, attempts);
  return { allowed: true, tarPit: false };
}

function countUnauthFromIP(ip: string): number {
  let count = 0;
  for (const p of peers.values()) {
    if (p.ip === ip && p.state !== 'authenticated') count++;
  }
  return count;
}

// ─── Active Session Lookup ───────────────────────────────────────────────────

function findActiveSession(userId: number): PeerData | null {
  for (const p of peers.values()) {
    if (p.state === 'authenticated' && p.user?.id === userId) return p;
  }
  return null;
}

// ─── Ban Check ──────────────────────────────────────────────────────────────

function checkBan(user: UserRecord): { banned: boolean; message?: string } {
  if (!user.banned_until) return { banned: false };

  if (user.banned_until === 'permanent') {
    return {
      banned: true,
      message: `Your account has been permanently banned.\nReason: ${user.ban_reason ?? 'No reason given.'}`,
    };
  }

  const expiresAt = new Date(user.banned_until);
  if (expiresAt > new Date()) {
    const remaining = formatDuration(expiresAt.getTime() - Date.now());
    return {
      banned: true,
      message: `You are banned for ${remaining}.\nReason: ${user.ban_reason ?? 'No reason given.'}`,
    };
  }

  // Ban expired — clear it
  getRawDb().prepare(
    'UPDATE users SET banned_until = NULL, ban_reason = NULL, banned_by = NULL WHERE id = ?'
  ).run(user.id);
  return { banned: false };
}

function formatDuration(ms: number): string {
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''}`;
  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? 's' : ''}`;
}

// ─── Cooldown Check ─────────────────────────────────────────────────────────

function checkCooldown(user: UserRecord): { ok: boolean; minutesLeft?: number } {
  if (user.access_level === 9) return { ok: true };
  if (boardConfig.board.sessionCooldownMinutes === 0) return { ok: true };
  if (!user.last_session_end) return { ok: true };

  const timestamp = user.last_session_end.endsWith('Z') ? user.last_session_end : user.last_session_end + 'Z';
  const elapsed = (Date.now() - new Date(timestamp).getTime()) / 60_000;
  const remaining = boardConfig.board.sessionCooldownMinutes - elapsed;
  if (remaining > 0) return { ok: false, minutesLeft: Math.ceil(remaining) };
  return { ok: true };
}

// ─── Session Timer ──────────────────────────────────────────────────────────

function startSessionTimer(peerData: PeerData): void {
  if (!peerData.user) return;
  if (peerData.user.access_level === 9) return; // SysOp exempt

  const maxMinutes = peerData.user.max_session_override ?? boardConfig.board.maxSessionMinutes;
  const maxMs = maxMinutes * 60_000;

  for (const mins of [5, 2, 1]) {
    const delay = maxMs - mins * 60_000;
    if (delay > 0) {
      peerData.timers.push(
        setTimeout(() => {
          send(peerData, 'session.warning', { minutesRemaining: mins });
        }, delay)
      );
    }
  }

  peerData.timers.push(
    setTimeout(() => {
      peerData.sessionTimedOut = true;
      send(peerData, 'session.timeout', {});
      send(peerData, 'server.goodbye', { content: screens.goodbye });
      log('session.timeout', { handle: peerData.user?.handle, ip: peerData.ip });
      try {
        peerData.peer.close(1000, 'Session time expired');
      } catch { /* already closed */ }
    }, maxMs)
  );
}

// ─── Main Menu ──────────────────────────────────────────────────────────────

function sendMainMenu(peerData: PeerData): void {
  if (!peerData.user) return;

  peerData.currentArea = 'main_menu';

  let timeDisplay: string;
  if (peerData.user.access_level === 9) {
    timeDisplay = 'exempt';
  } else {
    const maxMinutes = peerData.user.max_session_override ?? boardConfig.board.maxSessionMinutes;
    const elapsed = Math.floor((Date.now() - peerData.sessionStartedAt) / 60_000);
    const remaining = Math.max(0, maxMinutes - elapsed);
    const mins = Math.floor(remaining);
    const secs = Math.floor((remaining - mins) * 60);
    timeDisplay = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  let menuText = screens.menu + '\n\n';
  menuText += '    [F]orums     [M]ail       [C]hat       [G]ames\n';
  menuText += '    [B]rowse     [L]inks      [W]ho\'s Online\n';
  menuText += '    [I]nfo       [P]age SysOp [Q]uit\n';

  if (peerData.user.access_level === 9) {
    menuText += '    [S]ysOp Console\n';
  }

  menuText += `\n    Time remaining: ${timeDisplay}\n`;

  sendScreen(peerData, menuText);
  sendPrompt(peerData, 'Your choice: ', false, 1);
}

// ─── Auth Success ───────────────────────────────────────────────────────────

function completeAuth(peerData: PeerData, user: UserRecord, isNewUser: boolean): void {
  peerData.state = 'authenticated';
  peerData.user = user;
  peerData.sessionStartedAt = Date.now();
  peerData.reconnectToken = generateToken();
  updatePeerCount();

  // Update user record
  getRawDb().prepare(
    'UPDATE users SET last_login = datetime(\'now\'), call_count = call_count + 1 WHERE id = ?'
  ).run(user.id);

  // Create caller log entry
  getRawDb().prepare(
    'INSERT INTO caller_log (user_id, connected_at, ip_address) VALUES (?, datetime(\'now\'), ?)'
  ).run(user.id, peerData.ip);

  send(peerData, 'auth.result', {
    success: true,
    handle: user.handle,
    token: peerData.reconnectToken,
  });

  log('auth.success', { handle: user.handle, ip: peerData.ip, newUser: isNewUser });

  if (isNewUser) {
    sendScreen(peerData, screens.newuser);
    sendScreen(peerData, '\n  Registration complete! Welcome aboard.\n');
  } else {
    const lastLoginTs = user.last_login && !user.last_login.endsWith('Z') ? user.last_login + 'Z' : user.last_login;
    const lastLogin = lastLoginTs
      ? new Date(lastLoginTs).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : 'never';
    sendScreen(peerData, `\n  Welcome back, ${user.handle}! Last login: ${lastLogin}.\n`);
  }

  // Show who's online
  const onlineUsers: string[] = [];
  for (const p of peers.values()) {
    if (p.state === 'authenticated' && p.user && p.user.id !== user.id) {
      onlineUsers.push(p.user.handle);
    }
  }
  if (onlineUsers.length > 0) {
    sendScreen(peerData, `\n  Online now: ${onlineUsers.join(', ')}\n`);
  } else {
    sendScreen(peerData, '\n  You are the only one online.\n');
  }

  // Start session timer
  startSessionTimer(peerData);

  // Show main menu after a brief delay
  setTimeout(() => sendMainMenu(peerData), 500);
}

// ─── Handle Auth Messages ───────────────────────────────────────────────────

function handleAuthInput(peerData: PeerData, text: string): void {
  const input = text.trim();

  switch (peerData.authStep) {
    case 'handle': {
      if (input.toUpperCase() === 'NEW') {
        peerData.authStep = 'register_handle';
        sendPrompt(peerData, 'Choose a handle (3-16 chars, letters/numbers/underscore): ');
        return;
      }

      // Existing user login
      const db = getRawDb();
      const user = db.prepare('SELECT * FROM users WHERE handle = ? COLLATE NOCASE').get(input) as UserRecord | undefined;

      if (!user) {
        sendScreen(peerData, `\n  Handle "${input}" not found. Type NEW to create an account.\n`);
        sendPrompt(peerData, 'Enter your handle (or NEW for a new account): ');
        return;
      }

      // Ban check
      const banResult = checkBan(user);
      if (banResult.banned) {
        sendScreen(peerData, `\n  ${banResult.message}\n`);
        log('auth.banned', { handle: user.handle, ip: peerData.ip });
        setTimeout(() => {
          try { peerData.peer.close(1000, 'Banned'); } catch { /* */ }
        }, 1000);
        return;
      }

      peerData.pendingHandle = user.handle;
      peerData.authStep = 'password';
      sendPrompt(peerData, 'Password: ', true);
      break;
    }

    case 'password': {
      const rateCheck = checkLoginRate(peerData.ip);
      if (!rateCheck.allowed) {
        if (rateCheck.tarPit) {
          sendScreen(peerData, '\n  Too many login attempts. Please wait 30 seconds.\n');
          log('rate_limit', { ip: peerData.ip, type: 'login' });
        }
        return;
      }

      const db = getRawDb();
      const user = db.prepare('SELECT * FROM users WHERE handle = ? COLLATE NOCASE').get(peerData.pendingHandle!) as UserRecord;

      const valid = bcrypt.compareSync(input, user.password_hash);
      if (!valid) {
        sendScreen(peerData, '\n  Invalid password.\n');
        log('auth.failure', { handle: peerData.pendingHandle, ip: peerData.ip });
        peerData.authStep = 'handle';
        peerData.pendingHandle = null;
        sendPrompt(peerData, 'Enter your handle (or NEW for a new account): ');
        return;
      }

      // Cooldown check
      const cooldownResult = checkCooldown(user);
      if (!cooldownResult.ok) {
        sendScreen(peerData, `\n  You may reconnect in ${cooldownResult.minutesLeft} minute${cooldownResult.minutesLeft !== 1 ? 's' : ''}.\n`);
        setTimeout(() => {
          try { peerData.peer.close(1000, 'Cooldown'); } catch { /* */ }
        }, 1000);
        return;
      }

      // Check for existing active session
      const existingSession = findActiveSession(user.id);
      if (existingSession) {
        peerData.user = user;
        peerData.authStep = 'confirm_takeover';
        sendScreen(peerData, '\n  You are already signed in from another location.\n  Disconnect the other session and continue? (Y/N)\n');
        sendPrompt(peerData, '> ');
        return;
      }

      completeAuth(peerData, user, false);
      break;
    }

    case 'confirm_takeover': {
      const answer = input.toUpperCase();
      if (answer === 'Y') {
        const oldSession = findActiveSession(peerData.user!.id);
        if (oldSession) {
          sendScreen(oldSession, '\n  Session taken over from another location. Goodbye.\n');
          log('session.takeover', { handle: peerData.user!.handle, ip: peerData.ip, oldIp: oldSession.ip });
          setTimeout(() => {
            try { oldSession.peer.close(1000, 'Session takeover'); } catch { /* */ }
          }, 500);
        }
        completeAuth(peerData, peerData.user!, false);
      } else if (answer === 'N') {
        peerData.user = null;
        peerData.authStep = 'handle';
        peerData.pendingHandle = null;
        sendPrompt(peerData, 'Enter your handle (or NEW for a new account): ');
      } else {
        sendPrompt(peerData, '  Y or N: ');
      }
      break;
    }

    case 'register_handle': {
      const handleResult = validateHandle(input);
      if (!handleResult.valid) {
        sendScreen(peerData, `\n  ${handleResult.error}\n`);
        sendPrompt(peerData, 'Choose a handle (3-16 chars, letters/numbers/underscore): ');
        return;
      }

      // Check if handle taken
      const db = getRawDb();
      const existing = db.prepare('SELECT id FROM users WHERE handle = ? COLLATE NOCASE').get(input);
      if (existing) {
        sendScreen(peerData, '\n  That handle is already taken.\n');
        sendPrompt(peerData, 'Choose a handle (3-16 chars, letters/numbers/underscore): ');
        return;
      }

      peerData.pendingHandle = input;
      peerData.authStep = 'register_password';
      sendPrompt(peerData, 'Choose a password (6+ characters): ', true);
      break;
    }

    case 'register_password': {
      const passResult = validatePassword(input);
      if (!passResult.valid) {
        sendScreen(peerData, `\n  ${passResult.error}\n`);
        sendPrompt(peerData, 'Choose a password (6+ characters): ', true);
        return;
      }

      peerData.pendingPassword = input;
      peerData.authStep = 'register_confirm';
      sendPrompt(peerData, 'Confirm password: ', true);
      break;
    }

    case 'register_confirm': {
      if (input !== peerData.pendingPassword) {
        sendScreen(peerData, '\n  Passwords don\'t match. Try again.\n');
        peerData.authStep = 'register_password';
        peerData.pendingPassword = null;
        sendPrompt(peerData, 'Choose a password (6+ characters): ', true);
        return;
      }

      // Create user
      const hash = bcrypt.hashSync(input, WS_LIMITS.BCRYPT_COST);
      const db = getRawDb();
      const result = db.prepare(
        'INSERT INTO users (handle, password_hash, access_level) VALUES (?, ?, 0)'
      ).run(peerData.pendingHandle!, hash);

      const newUser = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid) as UserRecord;

      peerData.pendingPassword = null;
      completeAuth(peerData, newUser, true);
      break;
    }
  }
}

// ─── Handle Main Menu Commands ──────────────────────────────────────────────

function handleMainMenuInput(peerData: PeerData, text: string): void {
  const cmd = text.trim().toUpperCase();

  switch (cmd) {
    case 'Q': {
      send(peerData, 'server.goodbye', { content: screens.goodbye });
      sendScreen(peerData, screens.goodbye);
      log('disconnect', { handle: peerData.user?.handle, ip: peerData.ip, reason: 'quit' });
      setTimeout(() => {
        try { peerData.peer.close(1000, 'User quit'); } catch { /* */ }
      }, 1000);
      break;
    }

    case 'S': {
      if (peerData.user?.access_level === 9) {
        sendScreen(peerData, '\n  Coming soon.\n\n');
        setTimeout(() => sendMainMenu(peerData), 800);
      } else {
        sendScreen(peerData, '\n  Unknown command.\n\n');
        setTimeout(() => sendMainMenu(peerData), 800);
      }
      break;
    }

    case 'F':
    case 'M':
    case 'C':
    case 'G':
    case 'B':
    case 'L':
    case 'W':
    case 'I':
    case 'P': {
      sendScreen(peerData, '\n  Coming soon.\n\n');
      setTimeout(() => sendMainMenu(peerData), 800);
      break;
    }

    default: {
      sendScreen(peerData, '\n  Unknown command.\n\n');
      setTimeout(() => sendMainMenu(peerData), 800);
      break;
    }
  }
}

// ─── Handle Reconnect ───────────────────────────────────────────────────────

function handleReconnect(peerData: PeerData, token: string): boolean {
  const stored = reconnectPool.get(token);
  if (!stored) return false;

  const elapsed = Date.now() - stored.lastActivity;
  if (elapsed > WS_LIMITS.RECONNECT_WINDOW_MS) {
    reconnectPool.delete(token);
    return false;
  }

  // Restore session
  peerData.state = stored.state;
  peerData.currentArea = stored.currentArea;
  peerData.user = stored.user;
  peerData.sessionStartedAt = stored.sessionStartedAt;
  peerData.reconnectToken = stored.reconnectToken;

  reconnectPool.delete(token);

  send(peerData, 'auth.result', {
    success: true,
    handle: stored.user?.handle,
    token: peerData.reconnectToken,
  });

  log('auth.success', { handle: stored.user?.handle, ip: peerData.ip, reconnect: true });

  // Restart session timer for remaining time
  startSessionTimer(peerData);
  sendMainMenu(peerData);

  return true;
}

// ─── WebSocket Handler ──────────────────────────────────────────────────────

export default defineWebSocketHandler({
  open(peer) {
    ensureInitialized();

    const ip = getIP(peer);

    // Connection rate limit
    if (!checkConnectionRate(ip)) {
      log('connection_rate_limit', { ip });
      try { peer.close(1008, 'Connection rate limit exceeded'); } catch { /* */ }
      return;
    }

    // Origin check — reject missing or unknown origins when configured
    if (allowedOrigins.length > 0) {
      const origin = peer.request?.headers?.get?.('origin') || '';
      if (!origin || !allowedOrigins.includes(origin)) {
        log('connect', { ip, rejected: true, reason: 'origin' });
        try { peer.close(1008, 'Origin not allowed'); } catch { /* */ }
        return;
      }
    }

    // Capacity check
    const authCount = Array.from(peers.values()).filter((p) => p.state === 'authenticated').length;
    if (authCount >= boardConfig.board.maxUsers) {
      const msg: WSMessage = {
        type: 'server.busy',
        payload: {
          message: `BUSY — All lines occupied (${authCount}/${boardConfig.board.maxUsers})`,
          current: authCount,
          max: boardConfig.board.maxUsers,
        },
        timestamp: new Date().toISOString(),
      };
      try {
        peer.send(JSON.stringify(msg));
        peer.close(1013, 'At capacity');
      } catch { /* */ }
      return;
    }

    // IP unauth check
    if (countUnauthFromIP(ip) >= WS_LIMITS.MAX_UNAUTH_PER_IP) {
      log('connect', { ip, rejected: true, reason: 'max_unauth_ip' });
      try { peer.close(1008, 'Too many unauthenticated connections'); } catch { /* */ }
      return;
    }

    // Register peer
    const peerData: PeerData = {
      id: generatePeerId(),
      peer,
      ip,
      state: 'connected',
      currentArea: 'main_menu',
      user: null,
      sessionStartedAt: 0,
      lastActivity: Date.now(),
      timers: [],
      reconnectToken: null,
      sessionTimedOut: false,
      authStep: 'handle',
      pendingHandle: null,
      pendingPassword: null,
    };

    // Store peer data as context on the peer object for retrieval in message/close
    (peer as any)._athena = peerData;
    peers.set(peerData.id, peerData);

    log('connect', { peerId: peerData.id, ip });

    // 30s auth timeout
    const authTimer = setTimeout(() => {
      if (peerData.state !== 'authenticated') {
        sendScreen(peerData, '\n  Connection timed out.\n');
        log('auth.timeout', { peerId: peerData.id, ip });
        try { peer.close(1000, 'Auth timeout'); } catch { /* */ }
      }
    }, WS_LIMITS.AUTH_TIMEOUT_MS);
    peerData.timers.push(authTimer);

    // Send splash + prompt
    send(peerData, 'server.welcome', { content: screens.splash });

    peerData.state = 'authenticating';
    sendPrompt(peerData, '\nEnter your handle (or NEW for a new account): ');
  },

  message(peer, raw) {
    const peerData: PeerData | undefined = (peer as any)._athena;
    if (!peerData) return;

    peerData.lastActivity = Date.now();

    // Size check
    const rawText = typeof raw === 'string' ? raw : raw.text();
    if (rawText.length > WS_LIMITS.MAX_MESSAGE_BYTES) {
      log('ws.oversized', { peerId: peerData.id, ip: peerData.ip, size: rawText.length });
      try { peer.close(1009, 'Message too large'); } catch { /* */ }
      return;
    }

    // Parse JSON
    let msg: WSMessage;
    try {
      msg = JSON.parse(rawText);
    } catch {
      sendError(peerData, 'Invalid message format');
      log('ws.error', { peerId: peerData.id, ip: peerData.ip, error: 'json_parse' });
      return;
    }

    // Type whitelist
    if (!msg.type || !(WS_INBOUND_TYPES as readonly string[]).includes(msg.type)) {
      return; // Silently ignore unknown types
    }

    const msgType = msg.type as WSInboundType;

    // Handle reconnect from any state
    if (msgType === 'auth.reconnect') {
      const payload = msg.payload as { token?: string };
      if (payload?.token && handleReconnect(peerData, payload.token)) {
        return;
      }
      sendScreen(peerData, '\n  Session expired. Please log in again.\n');
      sendPrompt(peerData, 'Enter your handle (or NEW for a new account): ');
      return;
    }

    // Route by state
    if (peerData.state === 'authenticating') {
      if (msgType === 'auth.login') {
        const payload = msg.payload as { handle?: string; password?: string };
        if (payload?.handle && payload?.password) {
          // Direct login (combined handle+password)
          peerData.pendingHandle = payload.handle;
          peerData.authStep = 'password';
          handleAuthInput(peerData, payload.password);
          return;
        }
      }
      if (msgType === 'auth.register') {
        const payload = msg.payload as { handle?: string; password?: string };
        if (payload?.handle && payload?.password) {
          // Direct registration
          peerData.pendingHandle = payload.handle;
          peerData.pendingPassword = payload.password;
          peerData.authStep = 'register_confirm';
          handleAuthInput(peerData, payload.password);
          return;
        }
      }
      if (msgType === 'command.input') {
        const payload = msg.payload as { text?: string };
        if (payload?.text !== undefined) {
          handleAuthInput(peerData, payload.text);
        }
      }
      return;
    }

    if (peerData.state === 'authenticated') {
      if (msgType === 'command.input') {
        const payload = msg.payload as { text?: string };
        if (payload?.text === undefined) return;

        switch (peerData.currentArea) {
          case 'main_menu':
            handleMainMenuInput(peerData, payload.text);
            break;
          default:
            sendScreen(peerData, '\n  Coming soon.\n');
            sendMainMenu(peerData);
            break;
        }
      }
      return;
    }
  },

  close(peer) {
    const peerData: PeerData | undefined = (peer as any)._athena;
    if (!peerData) return;

    // Clear all timers
    for (const timer of peerData.timers) {
      clearTimeout(timer);
    }
    peerData.timers = [];

    if (peerData.state === 'authenticated' && peerData.user) {
      // Record session end — only set last_session_end (cooldown trigger) if session timer expired
      const sessionMinutes = Math.floor((Date.now() - peerData.sessionStartedAt) / 60_000);
      if (peerData.sessionTimedOut) {
        getRawDb().prepare(
          'UPDATE users SET last_session_end = datetime(\'now\'), total_time_minutes = total_time_minutes + ? WHERE id = ?'
        ).run(sessionMinutes, peerData.user.id);
      } else {
        getRawDb().prepare(
          'UPDATE users SET total_time_minutes = total_time_minutes + ? WHERE id = ?'
        ).run(sessionMinutes, peerData.user.id);
      }

      // Update caller log
      getRawDb().prepare(
        'UPDATE caller_log SET disconnected_at = datetime(\'now\') WHERE user_id = ? AND disconnected_at IS NULL'
      ).run(peerData.user.id);

      // Move to reconnect pool (clear sensitive data first)
      if (peerData.reconnectToken && reconnectPool.size < 100) {
        peerData.pendingPassword = null;
        peerData.lastActivity = Date.now();
        const poolEntry = { ...peerData };
        if (poolEntry.user) poolEntry.user = { ...poolEntry.user, password_hash: '' };
        reconnectPool.set(peerData.reconnectToken, poolEntry);
      }

      log('disconnect', { handle: peerData.user.handle, ip: peerData.ip, sessionMinutes });
    } else {
      log('disconnect', { peerId: peerData.id, ip: peerData.ip, authenticated: false });
    }

    peers.delete(peerData.id);
    updatePeerCount();
  },
});
