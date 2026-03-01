# ATHENA RBBS — Phase 1 Kickoff (v4.0)

**Everything You Need to Start Building**
March 2026

This document closes the remaining gaps in the v4.0 spec and provides a single consolidated prompt for kicking off Phase 1. It references the four specification documents:

1. **Architecture & Philosophy** (`athena-v4-01-architecture.md`) — big picture, engine/module split, deployment, configs
2. **Engine Spec** (`athena-v4-02-engine-spec.md`) — universal runtime: features, protocol, security, schema
3. **BBS Module Spec** (`athena-v4-03-bbs-module-spec.md`) — board.json schema, Golf Sucks reference, custom games
4. **Implementation Guide** (`athena-v4-04-implementation-guide.md`) — phased build plan, LLM prompts, tests, appendices

---

## Gap Fixes (Addenda to v4.0 Specs)

### 1. Registration/Login UX Flow

After the splash screen, the engine sends a `command.prompt` for the handle. The flow:

```
[Splash screen displays]

Enter your handle (or NEW for a new account): _

→ User types existing handle:
  Password: _
  → Correct: "Welcome back, ChrisR! Last login: Mar 1, 2026."
  → Wrong (rate limited: 5/min/IP): "Invalid password."
  → Banned (banned_until set): "Your account has been banned. Reason: [reason]. [duration]"
  → Cooldown active: "You may reconnect in 42 minutes."

→ User types NEW:
  Choose a handle (3-16 chars, letters/numbers/underscore): _
  → Handle taken: "That handle is already taken."
  → Invalid: "Handle must be 3-16 characters: letters, numbers, underscore."
  → Valid:
    Choose a password (6+ characters): _  [masked input]
    Confirm password: _  [masked input]
    → Mismatch: "Passwords don't match. Try again."
    → Match: [Show newuser.ans screen] → "Registration complete! Welcome aboard."

→ 30s passes with no auth: "Connection timed out." → close
```

This is the engine's auth handler, not configurable per module. The only module-specific elements are the splash screen (shown before the prompt) and the newuser screen (shown after successful registration).

### 2. SQLite Database Path

The engine creates/opens the SQLite database at:

```
${MODULE_PATH}/data/board.db
```

This keeps the database inside the module directory, making backups simple (`sqlite3 ${MODULE_PATH}/data/board.db ".backup ${MODULE_PATH}/data/board-backup.db"`). The `data/` directory is created on first boot if it doesn't exist.

For the Golf Sucks reference module, the full path is: `boards/golfsucks/data/board.db` (gitignored — only the schema is tracked, not the data).

### 3. ALLOWED_ORIGINS Clarification

`ALLOWED_ORIGINS` is an **environment variable**, not a `board.json` field. The module is portable data; deployment-specific settings like origins belong in env.

In the engine startup, `ALLOWED_ORIGINS` is parsed into an array and attached to the runtime config:

```typescript
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(s => s.trim()) ?? [];
```

The WS `open()` handler validates `request.headers.origin` against this array. Empty array = reject all (fail-safe, not fail-open).

### 4. Registry API Response Shape

`GET /api/boards` returns:

```typescript
interface BoardListResponse {
  boards: BoardPublicInfo[];
}

interface BoardPublicInfo {
  id: string;             // UUID
  name: string;           // "Golf Sucks"
  tagline: string;        // "Abandon all bogeys"
  sysop: string;          // "ChrisR"
  theme: string;          // "pirate"
  host: string;           // "golfsucks.athena-rbbs.net"
  websocketPath: string;  // "/ws"
  maxUsers: number;       // 10
  currentUsers: number;   // 3
  status: string;         // "online" | "offline"
  established: string;    // "2026-03-01"
}
```

**Phase 1 stub:** The Athena Server returns a hardcoded array with one entry (Golf Sucks, status "online", currentUsers 0). The client should code against `BoardPublicInfo` from the start so nothing changes when Supabase goes live in Phase 2.

Add `BoardPublicInfo` and `BoardListResponse` to `shared/types/protocol.ts`.

### 5. PeerData Type

Engine-internal, defined in `packages/athena-engine/server/types.ts`:

```typescript
interface PeerData {
  id: string;                    // Random peer ID
  ws: WebSocket;                 // The raw WebSocket
  ip: string;                    // Client IP (from X-Forwarded-For or socket)
  state: 'connected' | 'authenticating' | 'authenticated';
  currentArea: AreaName;         // main_menu, forums, chat, etc.
  user: User | null;             // Populated after auth
  sessionStartedAt: number;      // Date.now() when auth succeeded
  lastActivity: number;          // Date.now() of last message (for idle tracking)
  timers: NodeJS.Timeout[];      // Session warning + timeout timers
  reconnectToken: string | null; // 256-bit token for reconnection
}

type AreaName = 
  | 'main_menu' | 'board_list' | 'reading_board' | 'composing'
  | 'mail_inbox' | 'mail_compose' | 'chat' | 'gopher'
  | 'game' | 'foss_browse' | 'sysop_console';
```

Peers are tracked in a `Map<string, PeerData>` (keyed by peer.id). The reconnect pool is a separate `Map<string, PeerData>` with 60s TTL cleanup via setInterval.

### 6. SysOp Console Access

The SysOp console is **hidden from the main menu** for non-SysOps and **visible only to level 9 users.**

For level 9, the main menu renders an extra line:

```
[F]orums  [M]ail  [C]hat  [G]ames
[B]rowse  [L]inks [W]ho's Online
[I]nfo    [P]age SysOp  [Q]uit
[S]ysOp Console
           Time remaining: exempt
```

Typing `S` at the main menu when not level 9 → "Unknown command." (Not "Access denied" — don't reveal the command exists.)

### 7. Blank Template Module

`boards/_template/board.json`:

```json
{
  "$schema": "https://athena-rbbs.net/schemas/board.v1.json",
  "version": "1.0.0",
  "board": {
    "name": "My Board",
    "tagline": "A new RBBS on the Athena network",
    "sysop": "SysOp",
    "theme": "",
    "maxUsers": 10,
    "maxSessionMinutes": 30,
    "sessionCooldownMinutes": 60
  },
  "screens": {
    "splash": "screens/splash.ans",
    "goodbye": "screens/goodbye.ans",
    "newuser": "screens/newuser.ans",
    "menu": "screens/menu.ans"
  },
  "forums": [
    { "name": "General", "description": "General discussion", "accessLevel": 0 }
  ],
  "games": {
    "builtin": ["trivia", "hangman"],
    "custom": []
  },
  "gopher": {
    "enabled": false
  },
  "foss": {
    "categories": []
  }
}
```

`boards/_template/screens/splash.ans`:

```
  ══════════════════════════════════════
       Welcome to My Board
       "A new RBBS on the Athena network"

       Running Athena RBBS v1.0
  ══════════════════════════════════════
```

(Similar minimal screens for goodbye.ans, newuser.ans, menu.ans.)

### 8. FOSS Links Column Rename

In the SQLite schema, rename `foss_links.github_url` → `foss_links.url`. FOSS projects may live on GitLab, Codeberg, SourceHut, etc. The column name should be neutral.

### 9. Module Path Security

On startup, the engine validates `MODULE_PATH`:

- Must be an absolute path or resolve to one
- Must contain a `board.json` file
- Reject symlinks pointing outside the module directory (use `fs.realpathSync`)
- Reject paths containing `..`
- Log the resolved path at startup for auditability

### 10. Password Hashing

bcrypt (cost 12) automatically generates a unique random salt per password and embeds it in the output hash string. There is no separate salt column — bcrypt handles it internally. The `password_hash` column in `users` stores the full bcrypt output (e.g., `$2b$12$...`), which is salted, hashed, and not reversible.

### 11. Git Safety — Committing to GitHub

The entire monorepo (Athena Server, Athena Engine, all BBS Modules, shared types) is designed to be committed to a public GitHub repository. Secrets and user data never live in committed files.

**Safe to commit** (no secrets, no user data):

- All source code (engine, server, client)
- `athena.config.ts` — references `process.env.*`, never contains hardcoded secrets
- Every `board.json` — purely structural, no secrets (auth uses env vars)
- `screens/*.ans` — ASCII art, plain text
- Custom game scripts (`games/*.js`) and game data (`data/trivia-*.json`)
- `boards/_template/` — blank starter
- Drizzle schema definitions and migrations
- `shared/types/` — all interfaces and constants

**Must never be committed:**

- `.env` files (SYSOP_PASSWORD, REGISTRY_API_KEY, SUPABASE_SERVICE_ROLE_KEY, etc.)
- SQLite databases (`board.db` — contains hashed passwords, user data, mail, forum posts)
- PM2 logs
- `node_modules/`, `.output/`

**Required `.gitignore` at repo root:**

```gitignore
# Environment & secrets
.env
.env.*

# Runtime databases (contain user data + hashed passwords)
*.db
*.db-journal
*.db-wal
*.db-shm
boards/*/data/*.db
boards/*/data/*.db-*

# Build output
.output/
.nuxt/
node_modules/
dist/

# Process manager
.pm2/
*.log

# OS
.DS_Store
Thumbs.db
```

**Additional `.gitignore` in `boards/` directory:**

```gitignore
# Runtime databases are never committed — created on first boot
*/data/*.db
*/data/*.db-*
```

**Key principle:** `data/board.db` is created at runtime on first boot. Only schema definitions (Drizzle migration files) are committed. The database itself — with all user accounts, hashed passwords, forum posts, mail — stays on the server and is never pushed to the repository.

### 12. Kick and Ban System (Board SysOp + Athena Admin)

Classic BBSs let the SysOp boot troublemakers instantly — and Athena should work the same way. Both the **board-level SysOp** and the **Athena network admin** can take action against users.

**Three enforcement levels:**

| Action | Effect | Duration | Who Can Do It |
|--------|--------|----------|---------------|
| **Kick** | Immediate disconnect | Instant (user can reconnect) | Board SysOp, Athena Admin |
| **Temp Ban** | Disconnect + blocked from login | Configurable (default 3 days, range 1 hour – 365 days) | Board SysOp, Athena Admin |
| **Permanent Ban** | Disconnect + blocked from login forever | Indefinite | Board SysOp, Athena Admin |

**Schema change — `users` table additions:**

```sql
banned_until TEXT,      -- NULL=not banned, ISO datetime=temp ban, 'permanent'=permaban
ban_reason TEXT,        -- "Spamming forums" (shown to user on rejected login)
banned_by TEXT          -- Handle of who issued the ban (SysOp or "Athena Admin")
```

This replaces the old approach of using `access_level = -1` for bans. Access levels remain for permissions (0=new, 1=regular, 2=validated, 9=SysOp) but bans are tracked separately. A validated user (level 2) can be temp-banned and when the ban expires, they return at level 2 — their status is preserved.

**Login check (updated):**

```typescript
function checkBan(user: User): { banned: boolean; message?: string } {
  if (!user.banned_until) return { banned: false };
  if (user.banned_until === 'permanent') {
    return { banned: true, message: `Your account has been permanently banned. Reason: ${user.ban_reason ?? 'No reason given.'}` };
  }
  const expiresAt = new Date(user.banned_until);
  if (expiresAt > new Date()) {
    const remaining = formatDuration(expiresAt.getTime() - Date.now());
    return { banned: true, message: `You are banned for ${remaining}. Reason: ${user.ban_reason ?? 'No reason given.'}` };
  }
  // Ban expired — clear it
  clearBan(user.id);
  return { banned: false };
}
```

Banned user attempts login → sees the reason and duration → connection closed.

**Board SysOp actions (from SysOp Console [U]ser Management):**

```
[U]ser Management
────────────────────────────────
 1. ChrisR [*]  Level 9  Online
 2. DaveW       Level 1  Online
 3. SarahK      Level 2  Offline
 4. TrollBoy    Level 0  Online  ← BANNED until Mar 4

Select user: 4

Actions for TrollBoy:
 [K]ick — Disconnect now (can reconnect)
 [T]emp Ban — Disconnect + block for N days
 [B]an — Permanent ban
 [U]nban — Remove active ban
 [L]evel — Change access level
 [D]elete — Remove account entirely
 [Q]uit

Select: T
Duration (default 3 days): 3d
Reason: Spamming the Treasure Hunts forum
→ TrollBoy has been disconnected and banned for 3 days.
```

**Duration format:** `1h`, `12h`, `1d`, `3d`, `7d`, `30d`, `365d`. The SysOp types shorthand; the engine parses it to an ISO datetime for `banned_until`.

**Kick** disconnects the user immediately (sends a `server.goodbye` with the reason, then closes the WS) but does not set `banned_until`. The user can reconnect immediately — this is for "please leave and cool off" situations.

**Athena Admin actions (from the Admin Dashboard):**

The Athena admin needs to be able to act on any board in the network. This requires a **management API** on each engine instance, authenticated with the same API key used for registry communication.

**Engine management endpoints:**

```
POST /api/manage/kick    { handle, reason }           → 200 | 404
POST /api/manage/ban     { handle, duration, reason }  → 200 | 404
POST /api/manage/unban   { handle }                    → 200 | 404
GET  /api/manage/users                                 → user list
```

All management endpoints require the `X-API-Key` header matching the board's `REGISTRY_API_KEY`. The Athena Server stores the plaintext key (received during provisioning) and uses it to call these endpoints. This is the same trust relationship used for heartbeats — the Athena admin provisioned the board and holds its key.

**Admin Dashboard UI** (`/admin/boards/:id/users`): Shows the user list for any board. Kick, temp ban, and permaban buttons. The dashboard calls the engine's management API on behalf of the admin.

**SysOp notification:** When the Athena admin bans a user on a board, the engine logs it as `ban.admin` (distinct from `ban.sysop`) and, if the board SysOp is online, sends a `node.message` notification: "Athena Admin banned TrollBoy (3 days): Reason."

**Audit trail:** All kick/ban/unban actions are logged with timestamp, who took the action, the target handle, duration, and reason. The SysOp Console [L]og viewer shows these entries.

### 13. DDoS Protection

Athena is a hobby project on $6 DO droplets — not a bank. But a BBS that goes down because someone runs a script against it isn't fun for anyone. The defense is **layered**: network edge, reverse proxy, and application.

**Layer 1 — Network Edge (UFW + fail2ban)**

```bash
# UFW: rate-limit SSH, allow HTTP/HTTPS only
ufw limit 22/tcp           # SSH: 6 connections/30s then block
ufw allow 80/tcp
ufw allow 443/tcp
ufw default deny incoming
ufw enable

# fail2ban: auto-block repeat offenders
# /etc/fail2ban/jail.local
[caddy-ratelimit]
enabled = true
port = 80,443
filter = caddy-ratelimit
logpath = /var/log/caddy/access.log
maxretry = 50
findtime = 60
bantime = 3600              # 1 hour ban after 50 blocked requests in 60s
```

fail2ban watches Caddy's access log. If an IP triggers Caddy's rate limit 50 times in a minute, fail2ban adds a UFW rule blocking that IP for an hour. This stops persistent attackers at the kernel level.

**Layer 2 — Reverse Proxy (Caddy rate limiting)**

```
# Caddyfile snippet for engine
golfsucks.athena-rbbs.net {
    rate_limit {
        zone dynamic_zone {
            key    {remote_host}
            events 30
            window 10s
        }
    }
    reverse_proxy localhost:3000
}
```

Caddy limits each IP to 30 requests per 10-second window. WebSocket upgrades count as one request (the connection, not individual messages). Legitimate users never hit this — it catches scripts hammering the endpoint. Excess requests get HTTP 429.

**Layer 3 — Application (Engine-level protections)**

These already exist in the spec but are collected here for clarity:

| Protection | Limit | Effect |
|------------|-------|--------|
| Max unauthenticated connections per IP | 2 | 3rd unauthenticated connection from same IP → rejected |
| Auth timeout | 30s | Connection without login → closed |
| Login rate limit | 5/min/IP | 6th attempt → 30s tar pit delay |
| Max message size | 8KB | Oversize → drop + close |
| Total capacity | maxUsers (default 10) | At capacity → `server.busy` → close |
| Chat flood | 5 msg/sec burst | Exceed → 10s mute |
| Gopher fetch rate | 10/min/user | Excess → "Slow down" |
| JSON parse safety | try/catch | Malformed → error + ignore |
| Type whitelist | WS_MESSAGE_TYPES | Unknown type → silently ignored |

**Additional application-level protection (new):**

```typescript
// Connection rate limiter — per IP, across all connection attempts
const connectionAttempts = new Map<string, number[]>(); // IP → timestamps
const MAX_CONNECTIONS_PER_MINUTE = 10;

function checkConnectionRate(ip: string): boolean {
  const now = Date.now();
  const attempts = (connectionAttempts.get(ip) ?? []).filter(t => now - t < 60_000);
  if (attempts.length >= MAX_CONNECTIONS_PER_MINUTE) return false; // reject
  attempts.push(now);
  connectionAttempts.set(ip, attempts);
  return true;
}
```

This catches the gap between "2 unauth at a time" and "no limit on how fast you open and close connections." Without it, an attacker could connect, get rejected, disconnect, repeat — hundreds of times per second. With it, each IP gets 10 connection attempts per minute. Legitimate users never reconnect that often.

**Layer 4 — Optional: Cloudflare (free tier)**

For serious DDoS protection beyond what a $6 droplet can handle, put Cloudflare in front of everything. The free tier provides:

- Global CDN for the client (static Nuxt UI assets)
- Automatic DDoS mitigation (L3/L4/L7)
- Bot detection and challenge pages
- WebSocket proxying (supported on free tier)
- Rate limiting rules (configurable per path)

This is optional and can be added later without any code changes — just update DNS to point through Cloudflare. The engine and client don't need to know Cloudflare exists.

**What DDoS looks like for Athena and what happens:**

| Attack | What Stops It |
|--------|---------------|
| SYN flood (L3/L4) | UFW + kernel SYN cookies + Cloudflare (if enabled) |
| HTTP flood (thousands of requests/sec) | Caddy rate limit → fail2ban auto-blocks IP |
| WS connection flood (rapid connect/disconnect) | Engine connection rate limiter (10/min/IP) + Caddy rate limit |
| WS message flood (spam messages on open connection) | 8KB max + chat flood protection + type whitelist |
| Slowloris (slow HTTP headers) | Caddy's built-in timeout handling (default 30s read timeout) |
| Distributed (many IPs) | Cloudflare free tier (if enabled); without it, a truly distributed attack would overwhelm a $6 droplet — but that's true of any small server |

**Honest assessment:** Without Cloudflare, a sufficiently motivated distributed attack would take down a $6 droplet. That's reality for any hobby project. The layered defenses above handle script kiddies, casual abuse, and single-origin attacks. For anything beyond that, Cloudflare free tier is the answer — and it's a DNS change, not a code change.

---

## Phase 1 Definition of Done

When Phase 1 is complete, this works end to end:

1. `pnpm dev` starts all three packages (server, engine, client)
2. Client loads → shows board directory with Golf Sucks card (name, tagline, SysOp, theme, users, status)
3. Click "Connect" → animated connection sequence (Dialing → Connecting → Connected)
4. WebSocket opens → pirate splash screen renders in terminal
5. "Enter your handle" prompt → type NEW → registration flow → newuser screen → main menu
6. Main menu shows board name, options, session timer counting down
7. Type Q → goodbye screen → disconnect → return to directory
8. Reconnect within 60s → session restored
9. Reconnect after 60s → fresh login
10. Reconnect during cooldown → "You may reconnect in X minutes"
11. MAX_USERS connections → "BUSY — All lines occupied"
12. Leave connection idle 30s without authenticating → auto-disconnect
13. 6th failed login attempt → tar pit delay
14. Banned user → shows reason and duration → close
15. SysOp login (from env vars) → main menu shows `[S]ysOp Console` + "Time remaining: exempt"
16. Session timer fires warnings at 5m, 2m, 1m → timeout → goodbye → disconnect
17. Structured JSON logs output for every event
18. `.gitignore` prevents committing `.env`, `*.db`, `node_modules/`, `.output/` — repo is safe for public GitHub
19. Connection rate limiter rejects >10 connections/min from same IP
20. Temp-banned user sees reason + remaining duration; expired bans clear automatically on next login attempt

What is **not** in Phase 1: forums, mail, chat, games, Gopher, FOSS links, who's online, SysOp console functionality, SysOp broadcast, Supabase, admin dashboard, ANSI rendering (plain text screens only — ANSI comes in Phase 3).

---

## Master LLM Prompt for Phase 1

Copy this prompt into a fresh Claude session along with the four spec documents as attachments.

```
You are building Phase 1 of Athena RBBS — a retro BBS platform (homage to
Hermes Mac BBS, ~1991). I've attached four specification documents. Read all
four before writing any code.

ARCHITECTURE SUMMARY:
- Engine/Module split: Universal "Athena Engine" loads a "BBS Module" 
  (board.json + screens/) and becomes that board.
- Monorepo (pnpm workspaces): packages/athena-server, packages/athena-engine,
  packages/client, boards/golfsucks, boards/_template, shared/types
- Athena Engine: Nuxt 4 + Nitro WS (crossws) + SQLite (Drizzle + better-sqlite3)
- Athena Server: Nuxt 4 (Phase 1: stub returning hardcoded board list)
- Client: Nuxt 4 + Nuxt UI v4
- BBS Module: board.json (JSON, Zod-validated) + screens/*.ans (plain text)

PHASE 1 DELIVERABLE:
Modern graphical client showing board directory with Golf Sucks listed. User
clicks Connect → animated connection sequence → pirate ASCII splash → 
register/login flow → main menu with session countdown timer. All security
hardening from day one.

BUILD IN THIS ORDER:

1. SCAFFOLDING
   - pnpm monorepo with three packages + boards/ + shared/types/
   - shared/types/protocol.ts: WSMessage<T>, all payload interfaces (see
     Engine Spec §Message Protocol), BoardPublicInfo, WS_MESSAGE_TYPES,
     WS_LIMITS
   - shared/types/validation.ts: HANDLE_REGEX, length caps, helpers
   - packages/athena-engine/config/schema.ts: Zod schema for board.json
     (see Module Spec §board.json Schema for every field + type + range)
   - packages/athena-engine/config/loader.ts: loadBoardConfig(modulePath)
     reads, parses, validates, returns typed BoardConfig
   - packages/athena-engine/server/types.ts: PeerData, AreaName
   - packages/athena-server/config/schema.ts: defineAthenaConfig + Zod
   - boards/golfsucks/: complete board.json + 4 screen files + trivia data
     (see Module Spec §Golf Sucks: The Reference Module)
   - boards/_template/: minimal board.json + placeholder screens
   - Root .gitignore: .env*, *.db, *.db-journal, *.db-wal, 
     boards/*/data/*.db*, .output/, .nuxt/, node_modules/, .pm2/, *.log

2. ATHENA ENGINE — WebSocket + Auth + Sessions
   - server/routes/_ws.ts: defineWebSocketHandler with open/message/close
   - open(): Origin check (ALLOWED_ORIGINS env), capacity check (maxUsers
     from board config), IP check (2 unauth max), register PeerData, start
     30s auth timer, send splash screen, send handle prompt
   - message(): 8KB max, JSON parse try/catch, type whitelist, route by
     peer.state + msg.type
   - Auth flow: handle prompt → existing = password prompt (bcrypt verify)
     → NEW = registration (validate handle, bcrypt hash, create user level
     0) → check cooldown → start session timer → send main menu
   - Registration: validate handle (HANDLE_REGEX), validate password (min 
     6), bcrypt cost 12, create user, show newuser.ans, "Registration 
     complete!"
   - Banned: banned_until set → show reason + duration → close
   - Rate limit: 5 login attempts/min/IP, 30s tar pit on 6th
   - Session timer: warnings at 5/2/1 min, timeout → goodbye.ans → close.
     SysOp (level 9) exempt. Respect max_session_override.
   - Cooldown: check last_session_end vs sessionCooldownMinutes from config.
     SysOp exempt. 0 = disabled.
   - Reconnect pool: Map with 60s TTL. auth.reconnect with valid token
     restores PeerData.
   - SysOp bootstrap: create level 9 user from SYSOP_HANDLE + 
     SYSOP_PASSWORD env on first boot if no level 9 exists
   - Main menu: render from menu.ans header + option list. Show [S]ysOp 
     Console only for level 9. Show "Time remaining: XX:XX" (or "exempt").
     Commands: only Q (quit) functional in Phase 1. All others: 
     "Coming soon."
   - Logging: structured JSON to stdout. Events: connect, disconnect,
     auth.success, auth.failure, auth.timeout, rate_limit, ws.error,
     ws.oversized, session.timeout
   - SQLite: Drizzle + better-sqlite3. DB at ${MODULE_PATH}/data/board.db.
     Users table (include banned_until TEXT, ban_reason TEXT, banned_by 
     TEXT columns) + caller_log (see Engine Spec §SQLite Schema). Seed
     forums from board.json (Phase 2 uses them).
   - Ban check at login: if banned_until is not null AND (= 'permanent'
     OR > now), show reason + duration, close connection. Expired bans
     cleared automatically.
   - Connection rate limiter: max 10 new connections/min/IP (tracks
     timestamps in a Map, rejects excess). Prevents rapid connect/
     disconnect floods.
   - MODULE_PATH security: resolve path, reject symlinks outside dir,
     reject "..", require board.json exists

3. ATHENA SERVER — Stub
   - GET /api/boards returns hardcoded BoardListResponse with Golf Sucks
     entry (status: "online", currentUsers: 0, host pointing to engine
     dev URL). Response shape matches BoardPublicInfo interface exactly.

4. CLIENT
   - pages/index.vue: BoardDirectory component. Nuxt UI card grid. Each
     card: name, tagline, sysop, theme tag, users/maxUsers, status badge,
     generated phone number (deterministic from host). "Connect" button.
     Fetches GET /api/boards. Caches in sessionStorage. On failure: show
     cached with "Registry unreachable" notice.
   - components/ConnectionSequence.vue: Three-phase animated panel.
     Phase 1 Dialing (1.5s): board name + phone number + spinner.
     Phase 2 Connecting (2-3s): status lines scroll + progress bar.
     WebSocket opens here. Phase 3 Connected (0.5s): "CONNECT 14400" →
     transition to terminal. Failures: BUSY (server.busy) → "All lines
     occupied". Cooldown → message from server.
   - components/Terminal.vue: Monospace pre element. textContent only,
     never innerHTML. Hidden input captures keystrokes. Char-by-char
     rendering (optional speed from screen.display). Blinking cursor.
     Status bar showing "Time remaining: XX:XX". Session warning overlay
     (from session.warning — press Enter to dismiss). No ANSI rendering
     yet (Phase 3) — treat .ans files as plain text for now.
   - WCAG 2.1 AA on all directory UI (Nuxt UI handles most of this).

CONSTRAINTS:
- TypeScript strict throughout
- All user text → textContent (never innerHTML/v-html)
- All input lengths validated server-side per shared/types/validation.ts
- bcrypt cost 12, 256-bit random session tokens (crypto.randomBytes)
- Structured JSON logging, not console.log
- pnpm for package management
- No features beyond Phase 1 scope — forums/mail/chat/games show 
  "Coming soon" at the main menu
```

---

## How to Use This

### Recommended: Claude Code (Terminal)

Claude Code is the strongest path for Phase 1. It runs in your terminal, has direct filesystem access, and can scaffold the monorepo, write files, run `pnpm install`, test, and iterate — all in one session.

1. Install Claude Code: `npm install -g @anthropic-ai/claude-code`
2. Create your project directory: `mkdir athena && cd athena`
3. Drop all five `.md` spec documents into a `docs/` subfolder
4. Run `claude` to start a session
5. Paste the master prompt below and tell it: "Read the five spec documents in docs/ before writing any code."
6. Let it build — it'll scaffold, write files, install dependencies, and you can course-correct in real time

Once the skeleton is standing, switch to VSCode with Claude for detail work — tweaking components, debugging, styling. Claude Code gets you from zero to working skeleton fast; VSCode is where you live once you're iterating.

### Alternative: Claude.ai Chat + VSCode

Open a fresh Claude chat, attach all four spec documents (01–04), and paste the master prompt below. Copy generated code into VSCode file by file. This works but has more copy-paste friction and Claude can't test what it generates.

### Subsequent Phases

For Phases 2–6, repeat with the appropriate phase section from the Implementation Guide (doc 04), always including the LLM Context Block and referencing the full specs.
