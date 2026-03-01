# ATHENA RBBS — Engine Spec (v4.0)

**The Universal RBBS Runtime**
March 2026

The Athena Engine is the single codebase that powers every BBS on the network. It reads a BBS Module (`board.json` + screens + optional game scripts) at startup and becomes that board. This document specifies everything the engine does.

---

## Startup Sequence

1. Load `board.json` from the configured module path
2. Validate against Zod schema — reject with clear errors if invalid
3. Open/create SQLite database for this board
4. Seed database: create forum boards, FOSS categories from `board.json` (idempotent — adds new, never deletes existing user data)
5. Load ASCII screens from `screens/` paths
6. Register built-in games + dynamically import custom games from `games/`
7. Bootstrap SysOp account from env vars if none exists (level 9)
8. Register with Athena Server (POST with API key) and start 60s heartbeat
9. Start WebSocket server

---

## WebSocket Server

### Connection Lifecycle

```
Client connects (WSS via Caddy)
  → Validate Origin header against ALLOWED_ORIGINS env var
  → Check capacity (connected peers < maxUsers)
  → Check IP: max 2 unauthenticated connections per IP
  → Register peer: state='connected', start 30s auth timer
  → Send board's splash screen (server.welcome)
  → Send login prompt (command.prompt)
  → User authenticates (login / register / reconnect)
    → Check cooldown (last_session_end + sessionCooldownMinutes)
    → On success: start session timer, send main menu
    → On failure: error message, re-prompt (rate limit: 5/min/IP)
  → User interacts (commands routed by currentArea)
  → Session warnings at 5m, 2m, 1m remaining
  → Session timeout → goodbye screen → close
  → OR user quits → goodbye screen → close
  → On close: record last_session_end, move to reconnect pool (60s TTL)
```

### Message Protocol

All messages: `{ type, payload, timestamp }` JSON. Max 8KB.

**Inbound (client → engine):**

| Type | Payload | Description |
|------|---------|-------------|
| `auth.login` | `{ handle, password }` | Login attempt |
| `auth.register` | `{ handle, password }` | New account |
| `auth.reconnect` | `{ token }` | Restore session within 60s |
| `command.input` | `{ text }` | User typed something |
| `chat.message` | `{ text }` | Chat room message |
| `chat.private` | `{ to, text }` | Private /msg |
| `game.action` | `{ gameId, input }` | Game command |

**Outbound (engine → client):**

| Type | Payload | Description |
|------|---------|-------------|
| `auth.result` | `{ success, handle?, token?, error? }` | Auth response |
| `screen.display` | `{ content, clear?, speed? }` | Text to render |
| `screen.clear` | `{}` | Clear terminal |
| `command.prompt` | `{ prompt, mask?, maxLength? }` | Input prompt |
| `chat.message` | `{ from, text, action? }` | Chat broadcast |
| `chat.private` | `{ from, to, text }` | Private message |
| `chat.system` | `{ text }` | System event (join/leave) |
| `game.state` | `{ gameId, content }` | Game display |
| `server.busy` | `{ message, current, max }` | At capacity |
| `server.welcome` | `{ content }` | Splash screen |
| `server.goodbye` | `{ content }` | Farewell screen |
| `session.warning` | `{ minutesRemaining }` | Time warning |
| `session.timeout` | `{}` | Session expired |
| `sysop.broadcast` | `{ message, from }` | Live announcement |
| `node.message` | `{ from, text }` | Cross-area /msg |
| `error` | `{ message, code? }` | Error |

---

## Command Router

Session tracks `currentArea`. Each area defines valid commands.

**Areas:** `main_menu`, `board_list`, `reading_board`, `composing`, `mail_inbox`, `mail_compose`, `chat`, `gopher`, `game`, `foss_browse`, `sysop_console`

```
main_menu:
  F → board_list (Forums)
  M → mail_inbox (Mail)
  C → chat (Chat)
  G → game select (Games)
  B → gopher (Browse/Gopher)
  L → foss_browse (Links)
  W → who's online display
  I → board info display
  P → page SysOp prompt
  Q → goodbye + disconnect
  (SysOp) → sysop_console
```

---

## Features

### Forums

Topic boards defined in `board.json` → `forums[]`. Seeded on startup (idempotent). Threaded messages, keyboard navigation.

**Commands:** [N]ext unread, [P]revious, [R]eply, [E]nter new, [L]ist, [D]elete (SysOp only), [Q]uit.

**Composition:** Subject (max 80 chars) → multi-line body (max 4,000 chars, `.` on blank line to finish). Plain text only.

**Moderation:** SysOp [D]elete sets `is_deleted=true`, shows "[Removed by SysOp]" to preserve threading. Batch delete from SysOp console.

### Private Mail

Messages to any user (including SysOp), online or offline. On login: "You have X new messages."

**Commands:** [R]ead next unread, [L]ist all, [C]ompose, [D]elete, [Q]uit.

**Compose:** Recipient handle (autocomplete) → subject (80) → body (4,000, `.` to finish) → confirm.

**SysOp mail broadcast:** Sends mail to every registered user (one row per recipient). For persistent announcements — saved in mailboxes.

### Chat (IRC-Style Multi-User)

Real-time, multi-user, over existing WS. Core social feature.

**On enter:** Clear screen, header, last 20 messages from buffer (100 max in memory), who's in room. Broadcast: `*** Handle has entered the chat ***`

**Display format:**
```
<ChrisR> Anyone here play poker?       ← regular message
* ChrisR nods approvingly              ← /me action
[SysOp] Board maintenance at midnight. ← SysOp broadcast in chat
*** SarahK has entered the chat ***    ← system event
[→ DaveW] private text                 ← outgoing /msg (sender only)
[DaveW →] private text                 ← incoming /msg (recipient only)
```

**Commands:** text = broadcast to room, `/who` = list room, `/msg <handle> <text>` = private (works for users in chat or anywhere on board), `/me <action>`, `/quit` = return to menu. SysOp-only: `/broadcast <msg>`.

**Flood protection:** 5 msg/sec burst. Exceed → 10s mute. Chat max 500 chars, /msg max 300.

### Who's Online + SysOp Presence

```
 Who's Online — ☠ Golf Sucks RBBS ☠
 ─────────────────────────────────────────
 Handle       Area             Idle   Time
 ─────────────────────────────────────────
 ChrisR  [*]  Chat Room        0m    1:22
 DaveW       Forums > General  3m    0:45
 SarahK      Main Menu         1m    0:12
 ─────────────────────────────────────────
 3 users online.  [*] = SysOp
```

`[*]` marks SysOp. If SysOp not connected, no marker appears.

### SysOp Page + Node-to-Node Messaging

**Page SysOp** ([P]): Message max 200 chars. SysOp online → immediate screen interruption. SysOp offline → saved to `sysop_pages` table, shown on next login: "You have X pages waiting."

**Node-to-node** (`/msg` from any area): Target online → instant interruption on their screen. Target offline → "Use [M]ail to leave a message."

### SysOp Live Broadcast

Real-time message to every connected user. Triggered from SysOp console ([!]) or chat (`/broadcast <msg>`). Max 300 chars. Renders as double-line box banner interrupting current screen:

```
╔══════════════════════════════════════════════╗
║  ⚠ SYSOP BROADCAST:                         ║
║  Server going down in 5 minutes.             ║
║  Please wrap up and log off.                 ║
╠══════════════════════════════════════════════╣
║  Press Enter to continue.                    ║
╚══════════════════════════════════════════════╝
```

User presses Enter → screen restored. Logged with timestamp, SysOp handle, message.

### FOSS Links

Curated GitHub project directory. Categories defined in `board.json` → `foss.categories[]`. Browse categories → project list (name, description, language, stars) → URL opens in new tab. SysOp adds/edits links via console.

### Gopher Simulator — [B]rowse (Phase 4)

Server-side web browser that renders modern websites as Gopher-style text menus. Home menu configured in `board.json` → `gopher.homeLinks[]`.

**Pipeline:** Fetch URL server-side ($fetch, 10s timeout, 1MB max) → extract content (cheerio + @extractus/article-extractor) → strip HTML/JS/CSS → word-wrap 78 cols → paginate ~20 lines → collect links as numbered menu → send as screen.display.

**Link types:** `search` (prompt + results), `menu` (link extraction), `article` (text + pagination), `submenu` (static config-defined).

**Commands:** `[#]` follow link, `[N/P]` page, `[B]ack` (history stack), `[H]ome`, `[S]earch`, `[Q]uit`.

**Security:** Server-side only. Reject private IPs/localhost. Allowlist/blocklist per board. 10 fetches/min/user. maxDepth (default 5). SysOp disables via `gopher.enabled: false`.

### Door Games (Modular)

```typescript
interface GameHandler {
  id: string;
  name: string;
  description: string;
  onJoin(ctx: GameContext): Promise<void>;
  onCommand(ctx: GameContext, input: string): Promise<void>;
  onLeave(ctx: GameContext): Promise<void>;
}

// GameContext — scoped sandbox per player per game
interface GameContext {
  send(text: string): void;           // Send text to player
  getState(): Promise<any>;           // Read game state (scoped to game_id)
  setState(state: any): Promise<void>; // Write game state
  getPlayerData(): Promise<any>;       // Read player's save data
  setPlayerData(data: any): Promise<void>;
  exitGame(): void;                    // Return to main menu
}
```

**Built-in:** Trivia (JSON questions, 10/round, 30s timer, leaderboard) + Hangman (word lists, 6-stage ASCII art).

**Custom games:** JS files in the module's `games/` directory. Must export a GameHandler. Dynamically imported at engine startup. Every `onCommand` wrapped in try/catch — crash → error message → main menu, never crashes server.

**Sandboxing:** Scoped state access (game_id rows only). No filesystem. No raw DB. No network. Trusted code only — reviewed by Athena admin.

**Enabling:** `board.json` → `games.builtin` lists built-in game IDs. `games.custom` lists relative paths to custom JS files.

### SysOp Console

Access level 9 only.

- **[U]ser Management:** List, view, [K]ick (disconnect, no ban), [T]emp ban (default 3 days, shorthand: 1h/3d/7d/30d/365d), [B]an permanent, [U]nban, change access levels, delete, set session time overrides. Duration + reason prompted. All actions logged.
- **[B]oard Management:** Create/edit/delete forum boards, set access levels per board
- **[F]OSS Links:** Add/edit/delete categories and links
- **[M]ail Broadcast:** Send mail to all users
- **[!] Live Broadcast:** Real-time banner to all connected users
- **[P]ages:** Review saved SysOp pages, mark read
- **[L]og Viewer:** Last 50 caller log entries, auth failures, moderation actions
- **[C]onfig:** View current board settings (read-only — changes via board.json + restart)

### Voting Booth

Polls with options. One vote per user per poll. Results displayed as ASCII bar chart. SysOp creates/closes polls from console.

---

## User System

Per-board local accounts (separate per board, like 1991). No client-level accounts.

**Handle:** 3–16 chars, `/^[a-zA-Z0-9_]+$/`. **Password:** min 6 chars, bcrypt cost 12. **Session:** 256-bit random token, in-memory (lost on PM2 restart → users reconnect).

**Access levels:** 0=new, 1=regular, 2=validated, 9=SysOp.

**SysOp bootstrap:** First SysOp created from `SYSOP_HANDLE` + `SYSOP_PASSWORD` env vars on first boot. Public registration creates level 0 only.

**Banned:** `banned_until` column: NULL = not banned, ISO datetime = temp ban (default 3 days), `'permanent'` = permaban. On login: if banned, show reason + remaining duration → close. Expired bans cleared automatically. Access level is preserved — a validated user (level 2) returns at level 2 when their temp ban expires.

**Kick/Ban enforcement (Board SysOp + Athena Admin):**

| Action | Effect | Duration |
|--------|--------|----------|
| Kick | Immediate disconnect (can reconnect) | Instant |
| Temp Ban | Disconnect + blocked | 1h – 365d (default 3d) |
| Permanent Ban | Disconnect + blocked forever | Indefinite |

Board SysOp issues kick/ban from the [U]ser Management console. Athena Admin issues kick/ban remotely via authenticated management API (see below). All actions logged with timestamp, who, target, reason.

**Session limits:** `maxSessionMinutes` (default 30). Warnings at 5m, 2m, 1m. `sessionCooldownMinutes` (default 60, 0=disabled). SysOp exempt from both. Per-user overrides via console (`max_session_override`).

---

## Management API

Authenticated endpoints on the engine for remote administration by the Athena admin. Requires `X-API-Key` header matching the board's `REGISTRY_API_KEY` (same key used for registry heartbeats).

```
POST /api/manage/kick     { handle, reason }            → 200 | 404
POST /api/manage/ban      { handle, duration, reason }   → 200 | 404
POST /api/manage/unban    { handle }                     → 200 | 404
GET  /api/manage/users                                   → user list summary
```

`duration` accepts shorthand: `1h`, `12h`, `1d`, `3d`, `7d`, `30d`, `365d`, `permanent`.

When the Athena admin bans a user, the engine logs it as `ban.admin` (vs `ban.sysop` for board SysOp actions). If the board SysOp is online, they receive a `node.message` notification.

---

## Security

### Transport & Network
- WSS only (TLS via Caddy). Origin validation against configurable allowlist. UFW: ports 22/80/443 only. SSH key-only. CORS on Registry API locked to client domain.

### WebSocket Hardening
- Max 8KB per message. JSON parse in try/catch. Type validated against whitelist. Unknown types silently ignored.
- 30s auth timeout (unauthenticated connections closed). Max 2 unauthenticated connections per IP.
- 60s reconnection window: session moves to reconnect pool on disconnect, restorable with same token.

### Authentication
- bcrypt cost 12, min 6-char password, 256-bit random session tokens (in-memory).
- Login rate limit: 5 attempts/min/IP, 30s tar pit on 6th.
- SysOp bootstrapped from env vars. Public registration creates level 0 only.
- Ban check at login: `banned_until` column checked. Temp bans show reason + remaining time. Permanent bans show reason. Expired bans auto-cleared. Connection closed after message.

### DDoS / Flood Protection (Layered)
- **Network edge:** UFW (ports 22/80/443 only, `ufw limit` on SSH). fail2ban watches Caddy logs — auto-blocks IPs that trigger rate limits 50+ times in 60s (1-hour kernel-level block).
- **Reverse proxy:** Caddy rate limits per IP (30 requests/10s window). WS upgrade counts as one request. Excess → HTTP 429.
- **Application — connection rate:** Max 10 new WS connections/min/IP. Tracked in a Map of timestamps. Prevents rapid connect/disconnect cycling.
- **Application — existing protections:** 2 unauth/IP, 30s auth timeout, 8KB message max, chat flood 5/sec + mute, Gopher 10/min, JSON parse safety, type whitelist, total capacity cap (maxUsers).
- **Optional: Cloudflare free tier** in front of everything. DNS-only change, no code changes. Provides L3/L4/L7 DDoS mitigation, bot detection, WS proxying. Recommended if the project ever gets real traffic.

### Management API Security
- All `/api/manage/*` endpoints require `X-API-Key` matching REGISTRY_API_KEY (SHA-256 compared). Same trust relationship as heartbeat registration.
- Endpoints: kick, ban, unban, user list. Used by Athena admin dashboard only.

### Session Limits
- Time limit enforced server-side. Cooldown enforced via `last_session_end`. SysOp exempt. Per-user overrides.

### Input Validation & XSS
- All user text rendered as `textContent`, never innerHTML/v-html. ANSI parser outputs DOM elements via createElement.
- Length caps: handle 3–16, subject 80, body 4000, bio 200, chat 500, /msg 300, SysOp page 200, broadcast 300.
- ANSI whitelist: SGR, cursor movement, erase only. All other sequences stripped.

### Registry Security
- API keys: SHA-256 hash stored in Supabase. Plaintext shown once at provisioning.
- Supabase RLS: `boards_public` view excludes `api_key_hash`. Anon reads view only.
- Approval gate: provisioned → approved → online. Unapproved boards invisible.

### Game Sandboxing
- Scoped state access (game_id rows only). try/catch per onCommand. No filesystem, no raw DB, no network calls from game code. Trusted code only — admin reviews before approval.

### Chat & Messaging
- Flood: 5 msg/sec burst, 10s mute. Length caps enforced server-side.

### Gopher Simulator
- All fetching server-side. Reject private IPs/localhost. Allowlist/blocklist per board. 1MB + 10s caps. 10/min/user rate limit. Plain text output only. maxDepth enforced. Disable via config.

### SysOp Broadcast
- Level 9 only. Max 300 chars. Logged.

---

## SQLite Schema (Per-Board)

Each board gets its own SQLite database. Created/migrated by Drizzle ORM at engine startup.

```sql
-- Core
users (id INTEGER PK, handle TEXT UNIQUE, password_hash TEXT,
  real_name TEXT, location TEXT, bio TEXT,
  access_level INTEGER DEFAULT 0,
  call_count INTEGER DEFAULT 0, total_time_minutes INTEGER DEFAULT 0,
  last_login TEXT, last_session_end TEXT,
  max_session_override INTEGER,  -- null=use board default
  banned_until TEXT,             -- null=not banned, ISO datetime=temp, 'permanent'=permaban
  ban_reason TEXT,               -- shown to user on rejected login
  banned_by TEXT,                -- handle of who issued the ban
  created_at TEXT DEFAULT (datetime('now')))

caller_log (id INTEGER PK, user_id INTEGER FK,
  connected_at TEXT, disconnected_at TEXT, ip_address TEXT)

-- Forums
message_boards (id INTEGER PK, name TEXT, description TEXT,
  access_level INTEGER DEFAULT 0, sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1)

messages (id INTEGER PK, board_id INTEGER FK, parent_id INTEGER,
  author_id INTEGER FK, subject TEXT, body TEXT,
  is_deleted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')))

message_read_status (user_id INTEGER, board_id INTEGER,
  last_read_message_id INTEGER DEFAULT 0,
  PRIMARY KEY (user_id, board_id))

-- Mail
mail (id INTEGER PK, from_user_id INTEGER FK, to_user_id INTEGER FK,
  subject TEXT, body TEXT, is_read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')))

-- SysOp Pages
sysop_pages (id INTEGER PK, from_user_id INTEGER FK,
  message TEXT, is_read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')))

-- FOSS Links
foss_categories (id INTEGER PK, name TEXT, description TEXT,
  sort_order INTEGER DEFAULT 0)

foss_links (id INTEGER PK, category_id INTEGER FK, name TEXT,
  description TEXT, url TEXT, language TEXT, stars INTEGER,
  added_by INTEGER FK, created_at TEXT DEFAULT (datetime('now')))

-- Games
game_states (id INTEGER PK, game_id TEXT, state_json TEXT,
  updated_at TEXT DEFAULT (datetime('now')))

player_game_data (id INTEGER PK, user_id INTEGER FK, game_id TEXT,
  data_json TEXT, updated_at TEXT DEFAULT (datetime('now')))

-- Voting
polls (id INTEGER PK, question TEXT, is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')))

poll_options (id INTEGER PK, poll_id INTEGER FK, text TEXT,
  sort_order INTEGER DEFAULT 0)

poll_votes (id INTEGER PK, poll_id INTEGER FK, option_id INTEGER FK,
  user_id INTEGER FK, UNIQUE(poll_id, user_id))
```

---

## Logging

Structured JSON to stdout (PM2 captures to `~/.pm2/logs/`).

**Logged events:** `connect`, `disconnect`, `auth.success`, `auth.failure`, `auth.timeout`, `auth.banned`, `rate_limit`, `connection_rate_limit`, `ws.error`, `ws.oversized`, `session.timeout`, `sysop.action`, `sysop.broadcast`, `ban.sysop`, `ban.admin`, `kick.sysop`, `kick.admin`, `unban`, `game.error`, `gopher.fetch`, `gopher.error`

---

## Accessibility

Terminal is keyboard-driven by nature. For all non-terminal UI (client directory, settings, admin dashboard): WCAG 2.1 AA via Nuxt UI v4. All terminal color schemes (classic/amber/green) must meet contrast requirements.

---

## Appendix: REST API Reference

All REST APIs use JSON request/response bodies. Errors return a consistent shape. The WebSocket protocol is documented above in §Message Protocol.

### Error Format (All Endpoints)

```json
{
  "error": {
    "code": "BOARD_NOT_FOUND",
    "message": "No board found with that ID."
  }
}
```

Standard HTTP status codes: 200 (success), 201 (created), 400 (bad request), 401 (unauthorized), 404 (not found), 409 (conflict), 429 (rate limited), 500 (server error).

---

### Athena Server API

Base URL: `https://athena-rbbs.net` (or wherever the Athena Server is deployed).

#### `GET /api/boards` — List Active Boards

Returns all boards visible in the public directory. No authentication required.

**Response 200:**

```json
{
  "boards": [
    {
      "id": "uuid",
      "name": "Golf Sucks",
      "tagline": "Abandon all bogeys",
      "sysop": "ChrisR",
      "theme": "pirate",
      "host": "golfsucks.athena-rbbs.net",
      "websocketPath": "/ws",
      "maxUsers": 10,
      "currentUsers": 3,
      "status": "online",
      "established": "2026-03-01"
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | string (UUID) | Board unique identifier |
| `name` | string | Board display name |
| `tagline` | string | Subtitle / description |
| `sysop` | string | SysOp display name |
| `theme` | string | Identity tag (pirate, sci-fi, etc.) |
| `host` | string | Hostname where the engine runs |
| `websocketPath` | string | WS endpoint path (default `/ws`) |
| `maxUsers` | integer | Maximum concurrent connections |
| `currentUsers` | integer | Current connected users (from last heartbeat) |
| `status` | string | `"online"` or `"offline"` |
| `established` | string | Date board went live (ISO date) |

Only boards with status `online` or `offline` are returned. Boards in `provisioned` or `rejected` status are never visible.

#### `POST /api/boards` — Provision a New Board

Creates a new board entry in the registry. Admin authentication required (Supabase Auth). Returns the API key **once** — it is never retrievable again.

**Request:**

```json
{
  "name": "Starport Alpha",
  "tagline": "Docking bay open — all species welcome",
  "sysop": "Commander Zyx",
  "theme": "sci-fi",
  "host": "starport.athena-rbbs.net",
  "maxUsers": 15
}
```

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `name` | string | yes | 1–60 chars, unique across network |
| `tagline` | string | no | 0–120 chars |
| `sysop` | string | yes | 1–40 chars |
| `theme` | string | no | freeform |
| `host` | string | yes | Valid hostname |
| `maxUsers` | integer | no | 5–20, default 10 |

**Response 201:**

```json
{
  "board": {
    "id": "uuid",
    "name": "Starport Alpha",
    "status": "provisioned",
    "apiKey": "ak_live_abc123..."
  }
}
```

`apiKey` is the plaintext key. The server stores only its SHA-256 hash. The SysOp must save this key — it cannot be recovered. If lost, the admin must provision a new key.

**Errors:**

| Status | Code | Cause |
|--------|------|-------|
| 400 | `VALIDATION_ERROR` | Missing required field or invalid value |
| 401 | `UNAUTHORIZED` | Not authenticated as admin |
| 409 | `NAME_TAKEN` | Board name already exists |
| 409 | `MAX_BOARDS_REACHED` | Network at `maxRegisteredBoards` capacity |

#### `POST /api/boards/:id/heartbeat` — Engine Heartbeat

Called by the engine every 60 seconds to report status. Authenticated via `X-API-Key` header (SHA-256 compared against stored hash).

**Headers:** `X-API-Key: ak_live_abc123...`

**Request:**

```json
{
  "currentUsers": 3,
  "uptime": 86400
}
```

| Field | Type | Description |
|-------|------|-------------|
| `currentUsers` | integer | Currently connected authenticated users |
| `uptime` | integer | Engine uptime in seconds |

**Response 200:**

```json
{
  "status": "ok",
  "boardStatus": "online"
}
```

On first successful heartbeat after approval, the board's status transitions from `approved` → `online`. If the server receives no heartbeat within `heartbeatTimeout` (default 180s / 3 missed beats), status transitions to `offline`.

**Errors:**

| Status | Code | Cause |
|--------|------|-------|
| 401 | `INVALID_API_KEY` | Key doesn't match stored hash |
| 404 | `BOARD_NOT_FOUND` | No board with this ID |
| 403 | `NOT_APPROVED` | Board is still `provisioned` (not yet approved) |

#### `POST /api/boards/:id/register` — Engine Self-Registration

Called once by the engine on startup. Creates or updates the board's entry with its current host and connection details. Authenticated via `X-API-Key` header.

**Headers:** `X-API-Key: ak_live_abc123...`

**Request:**

```json
{
  "host": "golfsucks.athena-rbbs.net",
  "websocketPath": "/ws",
  "maxUsers": 10,
  "name": "Golf Sucks",
  "tagline": "Abandon all bogeys",
  "sysop": "ChrisR",
  "theme": "pirate"
}
```

**Response 200:**

```json
{
  "status": "registered",
  "boardId": "uuid",
  "boardStatus": "approved"
}
```

The engine reads `boardStatus` to know whether to start the heartbeat cycle. If `provisioned`, the engine logs a notice and retries on a longer interval (5 min) until approved.

**Errors:**

| Status | Code | Cause |
|--------|------|-------|
| 401 | `INVALID_API_KEY` | Key doesn't match |
| 404 | `BOARD_NOT_FOUND` | No board provisioned with this key |

#### `DELETE /api/boards/:id` — Deregister Board

Called on engine SIGTERM for clean shutdown. Authenticated via `X-API-Key` header.

**Headers:** `X-API-Key: ak_live_abc123...`

**Response 200:**

```json
{
  "status": "deregistered"
}
```

Sets board status to `offline`. Does not delete the board record — it can come back online on next engine startup.

---

### Engine Management API

Base URL: the engine's own host (e.g., `https://golfsucks.athena-rbbs.net`). All endpoints require `X-API-Key` header matching the board's `REGISTRY_API_KEY`. Used by the Athena admin dashboard to manage users on individual boards remotely.

#### `GET /api/manage/users` — List Board Users

**Headers:** `X-API-Key: ak_live_abc123...`

**Response 200:**

```json
{
  "users": [
    {
      "id": 1,
      "handle": "ChrisR",
      "accessLevel": 9,
      "callCount": 42,
      "lastLogin": "2026-03-01T14:30:00Z",
      "online": true,
      "currentArea": "chat",
      "bannedUntil": null,
      "banReason": null,
      "createdAt": "2026-03-01T10:00:00Z"
    }
  ],
  "totalUsers": 12,
  "onlineUsers": 3
}
```

Password hashes are **never** included in this response.

#### `POST /api/manage/kick` — Kick User

Immediately disconnects the user. No ban — they can reconnect.

**Headers:** `X-API-Key: ak_live_abc123...`

**Request:**

```json
{
  "handle": "TrollBoy",
  "reason": "Disrupting chat"
}
```

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `handle` | string | yes | Must match existing user |
| `reason` | string | no | 0–200 chars, logged |

**Response 200:**

```json
{
  "status": "kicked",
  "handle": "TrollBoy",
  "wasOnline": true
}
```

**Errors:**

| Status | Code | Cause |
|--------|------|-------|
| 401 | `INVALID_API_KEY` | Bad key |
| 404 | `USER_NOT_FOUND` | Handle doesn't exist on this board |

#### `POST /api/manage/ban` — Ban User

Disconnects (if online) and prevents future login for the specified duration.

**Headers:** `X-API-Key: ak_live_abc123...`

**Request:**

```json
{
  "handle": "TrollBoy",
  "duration": "3d",
  "reason": "Repeated forum spam"
}
```

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `handle` | string | yes | Must match existing user |
| `duration` | string | yes | Shorthand: `1h`, `12h`, `1d`, `3d`, `7d`, `30d`, `365d`, `permanent` |
| `reason` | string | no | 0–200 chars, shown to user on login rejection |

**Response 200:**

```json
{
  "status": "banned",
  "handle": "TrollBoy",
  "bannedUntil": "2026-03-04T14:30:00Z",
  "wasOnline": true
}
```

For permanent bans, `bannedUntil` is `"permanent"`.

**Errors:**

| Status | Code | Cause |
|--------|------|-------|
| 400 | `INVALID_DURATION` | Unrecognized duration format |
| 401 | `INVALID_API_KEY` | Bad key |
| 404 | `USER_NOT_FOUND` | Handle doesn't exist |
| 409 | `CANNOT_BAN_SYSOP` | Cannot ban a level 9 user via API |

#### `POST /api/manage/unban` — Unban User

Clears `banned_until`, `ban_reason`, and `banned_by`. Access level is unchanged (preserved from before the ban).

**Headers:** `X-API-Key: ak_live_abc123...`

**Request:**

```json
{
  "handle": "TrollBoy"
}
```

**Response 200:**

```json
{
  "status": "unbanned",
  "handle": "TrollBoy",
  "restoredAccessLevel": 2
}
```

**Errors:**

| Status | Code | Cause |
|--------|------|-------|
| 401 | `INVALID_API_KEY` | Bad key |
| 404 | `USER_NOT_FOUND` | Handle doesn't exist |
| 409 | `NOT_BANNED` | User is not currently banned |

---

### API Versioning

All endpoints are currently unversioned (e.g., `/api/boards`). When breaking changes are introduced, the API will move to `/api/v2/boards` while maintaining `/api/v1/boards` for backward compatibility. The engine's registration payload includes its version, allowing the server to route to the appropriate API version.

### Rate Limiting

All server API endpoints are rate-limited by Caddy at the network layer (30 requests/10s/IP). The heartbeat endpoint has an additional application-level expectation: engines should call it at the interval specified in `athena.config.ts` (default 60s). Engines calling heartbeat more frequently than every 10 seconds will receive a 429.
