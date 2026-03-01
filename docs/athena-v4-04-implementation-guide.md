# ATHENA RBBS — Implementation Guide (v4.0)

**Phased Build Plan with LLM-Ready Specs**
March 2026 | pnpm monorepo | Supabase | DO/PM2

---

## LLM Context Block (include in every prompt)

```
Project: Athena RBBS — Retro BBS platform, homage to Hermes Mac BBS (~1991)
Architecture: Engine/Module split. Universal "Athena Engine" runtime loads a 
  "BBS Module" (board.json + screens + optional game JS) and becomes that board.
Monorepo: packages/athena-server, packages/athena-engine, packages/client, 
  boards/golfsucks (reference module), shared/types
Package manager: pnpm (workspaces)
Athena Engine: Nuxt 4 + Nitro WS (crossws) + SQLite (Drizzle + better-sqlite3)
  Loads board.json at startup. All BBS features are in the engine, not the module.
Athena Server: Nuxt 4 + Supabase (hosted Postgres, Auth, Realtime)
  Central registry + admin dashboard. Config: athena.config.ts (TypeScript).
Client: Nuxt 4 + Nuxt UI v4 — modern graphical directory, retro terminal for BBS
BBS Module: board.json (JSON) + screens/*.ans + optional games/*.js + data/*.json
  Framework-agnostic. No build step. Golf Sucks is the reference template.
WS messages: JSON { type, payload, timestamp } — max 8KB
Terminal: 80 columns, monospace, ANSI. textContent only, never innerHTML.
Session: default 30 min limit + 60 min cooldown. SysOp exempt.
Auth: bcrypt cost 12, 256-bit tokens, per-board local accounts.
No modem audio — visual connection sequence (Dialing → Connecting → Connected)
Gopher simulator: server-side web fetching rendered as text menus (Phase 4)
SysOp broadcast: real-time banner to all connected users (Phase 2)
Philosophy: plain text, plain sight. No encryption, no file transfers.
Deploy: DO droplets, PM2, Caddy auto-TLS
Reference module: "Golf Sucks" — pirate-themed (SysOp: ChrisR)
```

---

## Phase 1: Foundation (Weeks 1–4)

**Deliverable:** Modern graphical client showing board directory with Golf Sucks. User clicks Connect → animated connection sequence → pirate ASCII splash → register/login → main menu with session timer. All WS hardening, session limits, and auth security working.

### 1.1 Project Scaffolding

```
athena/
├── packages/
│   ├── athena-server/         # Nuxt 4 + Supabase
│   │   ├── athena.config.ts   # Network config (Zod-validated)
│   │   └── config/schema.ts   # defineAthenaConfig + Zod schema
│   ├── athena-engine/         # Nuxt 4 + Nitro WS + SQLite
│   │   ├── config/
│   │   │   ├── schema.ts      # board.json Zod schema
│   │   │   └── loader.ts      # Load + validate board.json
│   │   ├── server/routes/_ws.ts
│   │   └── services/          # forums, mail, chat, etc.
│   └── client/                # Nuxt 4 + Nuxt UI v4
├── boards/
│   ├── golfsucks/             # Reference module
│   │   ├── board.json
│   │   ├── screens/
│   │   └── data/
│   └── _template/             # Blank starter
├── shared/types/
│   ├── protocol.ts            # WSMessage<T>, payloads, WS_MESSAGE_TYPES
│   └── validation.ts          # Regex, length caps, helpers
└── pnpm-workspace.yaml
```

**Shared types** (`shared/types/protocol.ts`):
- `WSMessage<T>`: `{ type: string, payload: T, timestamp: string }`
- Payload interfaces: LoginPayload, RegisterPayload, ReconnectPayload, AuthResultPayload, ScreenDisplayPayload `{ content, clear?, speed? }`, CommandPromptPayload `{ prompt, mask?, maxLength? }`, CommandInputPayload, ServerBusyPayload `{ message, current, max }`, SessionWarningPayload `{ minutesRemaining }`, SessionTimeoutPayload, SysopBroadcastPayload `{ message, from }`, GopherPagePayload `{ title, lines[], links[], currentPage, totalPages }`, NodeMessagePayload, ChatMessagePayload, ErrorPayload
- `WS_MESSAGE_TYPES` const: all valid inbound + outbound type strings
- `WS_LIMITS` const: MAX_MESSAGE_BYTES=8192, AUTH_TIMEOUT_MS=30000, RECONNECT_WINDOW_MS=60000, MAX_UNAUTH_PER_IP=2

**Shared validation** (`shared/types/validation.ts`):
- HANDLE_REGEX = `/^[a-zA-Z0-9_]{3,16}$/`
- MIN_PASSWORD_LENGTH = 6
- MAX_SUBJECT=80, MAX_BODY=4000, MAX_BIO=200, MAX_CHAT=500, MAX_PRIVATE_MSG=300, MAX_SYSOP_PAGE=200, MAX_BROADCAST=300
- validateHandle(), validatePassword(), sanitizeString()

**Board.json Zod schema** (`packages/athena-engine/config/schema.ts`):
- Validates all fields from the BBS Module Spec
- Provides defaults for optional fields
- Rejects unknown keys
- Returns typed BoardConfig object
- `loadBoardConfig(modulePath: string): BoardConfig` — reads, parses, validates, throws on error

**LLM prompt:** *Create a Nuxt 4 pnpm monorepo. Structure: packages/athena-server, packages/athena-engine, packages/client, boards/golfsucks, boards/_template, shared/types. Shared types: WSMessage<T> (type+payload+timestamp), all payload interfaces listed above, WS_MESSAGE_TYPES whitelist, WS_LIMITS constants. Shared validation: HANDLE_REGEX, length caps, helpers. In athena-engine: create config/schema.ts with Zod schema for board.json (validate board name/tagline/sysop/theme/maxUsers 5–20/maxSessionMinutes 15–120/sessionCooldownMinutes 0–1440, screens paths, forums array, games object, gopher config, foss categories). Create config/loader.ts that reads board.json from MODULE_PATH env var, parses, validates, returns typed config. In athena-server: create config/schema.ts with defineAthenaConfig + Zod for athena.config.ts (network name/maxRegisteredBoards/heartbeat settings, supabase credentials, admin info). TypeScript strict throughout.*

### 1.2 WebSocket Server + Auth + Session Management

The engine's core. All security from day one.

```typescript
// packages/athena-engine/server/routes/_ws.ts
export default defineWebSocketHandler({
  open(peer) {
    // 1. Validate Origin against ALLOWED_ORIGINS env var
    // 2. Count unauth peers from this IP — reject if >= MAX_UNAUTH_PER_IP
    // 3. Register peer: state='connected', start 30s auth timer
    // 4. Load splash screen from board config screens.splash path
    // 5. Send splash (server.welcome) + login prompt (command.prompt)
    // Timer: 30s → send goodbye, close
  },
  message(peer, raw) {
    // 1. raw.text().length > MAX_MESSAGE_BYTES → drop + close
    // 2. JSON.parse in try/catch → error on failure
    // 3. Validate msg.type against WS_MESSAGE_TYPES → ignore unknown
    // 4. auth.reconnect → check reconnectPool
    // 5. Route by peer.state + msg.type
  },
  close(peer) {
    // If authenticated: record last_session_end, move to reconnect pool (60s TTL)
    // Clear session timer + warning intervals
    // Broadcast disconnect, log event, update caller_log
  },
});
```

**Session timer logic:**
```typescript
function startSessionTimer(peer: PeerData, config: BoardConfig) {
  const maxMinutes = peer.user.max_session_override ?? config.board.maxSessionMinutes;
  if (peer.user.access_level === 9) return; // SysOp exempt
  const maxMs = maxMinutes * 60_000;
  for (const mins of [5, 2, 1]) {
    const delay = maxMs - (mins * 60_000);
    if (delay > 0) {
      peer.timers.push(setTimeout(() => {
        send(peer, 'session.warning', { minutesRemaining: mins });
      }, delay));
    }
  }
  peer.timers.push(setTimeout(() => {
    send(peer, 'session.timeout', {});
    sendScreen(peer, loadScreen(config.screens.goodbye));
    peer.ws.close(1000, 'Session time expired');
  }, maxMs));
}
```

**Cooldown check at login:**
```typescript
function checkCooldown(user: User, config: BoardConfig): { ok: boolean, minutesLeft?: number } {
  if (user.access_level === 9) return { ok: true }; // SysOp exempt
  if (config.board.sessionCooldownMinutes === 0) return { ok: true }; // Disabled
  if (!user.last_session_end) return { ok: true }; // First session
  const elapsed = (Date.now() - new Date(user.last_session_end).getTime()) / 60_000;
  const remaining = config.board.sessionCooldownMinutes - elapsed;
  if (remaining > 0) return { ok: false, minutesLeft: Math.ceil(remaining) };
  return { ok: true };
}
```

**Logging:** Structured JSON to stdout. PM2 captures to `~/.pm2/logs/`. Events: connect, disconnect, auth.success, auth.failure, auth.timeout, rate_limit, ws.error, ws.oversized, session.timeout, sysop.action.

**LLM prompt:** *Implement the WebSocket handler for Athena Engine (Nuxt 4 Nitro crossws) at server/routes/_ws.ts. The engine loads its config via loadBoardConfig() which returns a typed BoardConfig from board.json. Security: (1) Origin check against ALLOWED_ORIGINS env var; (2) max 2 unauth/IP; (3) 30s auth timeout; (4) 8KB message max; (5) JSON parse try/catch; (6) type whitelist; (7) reconnect pool 60s TTL; (8) login rate limit 5/min/IP + tar pit. On connect: load splash from config screens.splash path, send as server.welcome. Auth flow: prompt → handle → "NEW" = register (validate, bcrypt cost 12) → existing = bcrypt verify → banned (banned_until set) → rejected with reason. After auth: check cooldown (last_session_end vs config sessionCooldownMinutes) → reject if active. Start session timer with warnings at 5/2/1 min (exempt SysOp level 9, respect max_session_override). On disconnect: record last_session_end, move to reconnect pool. SysOp bootstrap from env vars. Structured JSON logging. Drizzle ORM + better-sqlite3.*

### 1.3 Client: Directory + Connection + Terminal

**Directory** (`pages/index.vue`): Modern Nuxt UI card grid. Each board: name, tagline, SysOp, users/capacity, status, theme tag, phone number. "Connect" button. No login. Fetches GET /api/boards from Athena Server. Caches in sessionStorage; shows cached list on failure.

**Connection sequence** (`components/ConnectionSequence.vue`): Dialing (1.5s) → Connecting (2–3s, WS opens) → Connected (0.5s) → splash. Failures: BUSY, NO CARRIER, Cooldown. Emits: 'connected', 'busy', 'failed', 'cooldown'.

**Terminal** (`components/Terminal.vue`): Monospace pre, textContent only, char-by-char rendering, hidden input, blinking cursor. Status bar: session time countdown. Handles session.warning overlay + dismiss. Handles sysop.broadcast banner + dismiss.

**LLM prompt:** *Build the Athena Client (Nuxt 4 + Nuxt UI v4). Three components: (1) BoardDirectory — Nuxt UI card grid, each card shows board name/tagline/sysop/users/status/theme, Connect button, no auth needed, fetches /api/boards, caches sessionStorage, shows cached on failure with notice. (2) ConnectionSequence — animated retro panel: Dialing (name + phone number from hostname, 1.5s) → Connecting (status lines + progress bar, opens WS, 2–3s) → Connected ("CONNECT 14400" then transition). Failures: BUSY/NO CARRIER/Cooldown. Emits events. (3) Terminal — monospace pre, textContent only, char-by-char optional, hidden input, blinking cursor, status bar with session countdown (from server session.warning). Handles session.warning as overlay (press Enter to dismiss). Handles sysop.broadcast as double-line box banner (Enter to dismiss). All keyboard accessible, WCAG 2.1 AA for directory.*

### 1.4 Golf Sucks Module

Create the reference BBS Module in `boards/golfsucks/`. Complete `board.json` per the BBS Module Spec. All four screen files with pirate-themed ASCII art. `data/trivia-pirate.json` with 20+ pirate trivia questions. See BBS Module Spec document for exact contents.

### 1.5 Athena Server Stub

GET /api/boards returns Golf Sucks entry (hardcoded for Phase 1, Supabase in Phase 2).

### Phase 1 Tests

**Unit:**
- board.json Zod validation: accepts valid Golf Sucks config, rejects missing name, rejects maxUsers=0, rejects maxUsers=25, defaults missing optional fields
- athena.config.ts Zod validation: accepts valid, rejects missing supabase URL
- Handle validation: accepts "ChrisR", "user_123"; rejects "ab", empty, spaces, 17+ chars
- Password: rejects <6 chars
- bcrypt round-trips
- Auth timeout fires at 30s
- Message >8KB rejected + close
- Malformed JSON → error, no crash
- Unknown type silently ignored
- Reconnect valid token → restored; expired → login
- Max 2 unauth/IP
- Rate limiter blocks 6th attempt; tar pit delays
- SysOp from env vars; not from public registration
- Banned user (banned_until set) rejected with reason + duration
- Session timer fires warnings at correct intervals
- Session timeout disconnects
- Cooldown rejects during active period; passes after expiry
- SysOp exempt from timer and cooldown
- max_session_override respected
- Screen loader reads .ans file; falls back on missing file
- hostnameToPhoneNumber deterministic
- Logger outputs valid JSON

**Integration:**
- Engine loads Golf Sucks board.json → seeds forums → boots WS server → splash displays
- Connect → register → session warning → timeout → disconnect → cooldown → wait → reconnect
- Connect → disconnect → reconnect <60s restored → >60s re-login
- Client loads with registry down → cached directory with notice

**Manual:**
- Open client → Golf Sucks card in directory
- Connect → Dialing → Connecting → Connected → pirate splash
- Register → login → main menu with timer
- Warnings at 5/2/1 min (short timer for testing)
- Session end → goodbye → disconnected
- Reconnect during cooldown → rejected with time
- MAX_USERS connections → BUSY

---

## Phase 2: Core Features + Registry (Weeks 5–8)

**Deliverable:** Forums, mail, FOSS links, who's online, SysOp console + live broadcast, SysOp pages. Supabase registry with approval gate.

### 2.1 Forums + Command Router

Area-based command router. Forums seeded from board.json.

**LLM prompt:** *Implement command router + forums for Athena Engine. Session.currentArea routes commands. Areas: main_menu, board_list, reading_board, composing, mail_inbox, mail_compose, foss_browse, sysop_console, chat, gopher, game. Forums seeded from BoardConfig.forums[] on startup (idempotent — adds new boards, preserves existing data). Commands: [N]ext/[P]rev/[R]eply/[E]nter (subject 80, body 4000, "." to finish)/[L]ist/[D]elete (level 9, sets is_deleted)/[Q]uit. Threading via parentId. Read tracking via lastReadMessageId. 80-col output. Main menu shows session time remaining.*

### 2.2 Supabase Registry

```sql
CREATE TABLE boards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL, description text, host text NOT NULL,
  websocket_path text DEFAULT '/ws',
  max_users int DEFAULT 10, current_users int DEFAULT 0,
  sysop text, theme text, api_key_hash text NOT NULL,
  status text DEFAULT 'provisioned',
  last_heartbeat timestamptz, established date, tags jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE VIEW boards_public AS
  SELECT id, name, description, host, websocket_path, max_users,
    current_users, sysop, theme, status, last_heartbeat, established, tags
  FROM boards WHERE status IN ('online', 'offline');
```

RLS: anon reads boards_public; service role writes. API key SHA-256 stored. Approval gate: provisioned → approved → online → offline. MAX_REGISTERED_BOARDS enforced from athena.config.ts.

**LLM prompt:** *Supabase setup for Athena Server. boards table (api_key_hash, status, theme). boards_public VIEW excluding hash. RLS: anon reads view, service role writes table. API routes: GET /api/boards (boards_public), POST /api/boards (validate < maxRegisteredBoards from athena.config.ts, generate key, SHA-256 store, insert 'provisioned'), POST /api/boards/:id/heartbeat (validate key hash, update, set online if approved), DELETE (validate). Nitro cron: 60s check, offline if last_heartbeat > heartbeatTimeout from athena.config.ts.*

### 2.3 Minor Features

- **Mail:** `mail` table. "X new messages" on login. SysOp mail broadcast (one row per user). Body max 4000. Commands: [R]ead/[L]ist/[C]ompose/[D]elete/[Q]uit.
- **FOSS Links:** Categories + links seeded from board.json foss.categories[]. SysOp adds more via console.
- **Who's Online:** From peer Map. Handle, area, idle, time. SysOp marked `[*]`.
- **SysOp Console:** [U]ser mgmt, [B]oard mgmt, [F]OSS, [M]ail broadcast, [!] Live Broadcast, [P]age review, [L]og viewer, [C]onfig view.
- **SysOp Live Broadcast:** [!] from console or `/broadcast <msg>` from chat (Phase 4). Sends sysop.broadcast to all peers. Max 300 chars. Logged.
- **SysOp Pages:** `sysop_pages` table. Online → interrupt. Offline → saved. "X pages waiting" on login.
- **Kick/Ban System:** SysOp Console [U]ser Management: [K]ick (disconnect, no ban), [T]emp ban (shorthand duration: 1h/3d/7d/30d, default 3d), [B]an permanent, [U]nban. Duration + reason prompted. `banned_until`, `ban_reason`, `banned_by` columns in users table. Login check shows reason + remaining time. Expired bans auto-cleared.
- **Management API:** Engine endpoints POST /api/manage/kick, /ban, /unban, GET /users. Authenticated via X-API-Key matching REGISTRY_API_KEY. Used by Athena admin dashboard.
- **DDoS hardening:** Caddy rate limit config (30 req/10s/IP). fail2ban jail watching Caddy logs (50 triggers/60s → 1hr ban). Document in deployment guide.

### Phase 2 Tests

- Unit: forum input caps, SysOp delete, non-SysOp delete rejected, API key hashing, boards_public excludes hash, provisioned invisible, MAX_REGISTERED_BOARDS enforced, broadcast restricted to level 9, broadcast 300 char cap, mail delivery + read flag, SysOp mail broadcast creates N rows, kick disconnects user immediately, temp ban rejects login with reason + duration, temp ban expires → login succeeds + access level preserved, permanent ban rejects forever, unban clears banned_until, management API rejects without valid X-API-Key, management API kick/ban/unban work with valid key
- Integration: two users post/reply, mail exchange, SysOp page online/offline, SysOp broadcast reaches all users, heartbeat timeout → offline, approve → heartbeat → online, SysOp temp-bans user → user disconnected → user tries to reconnect → sees reason + remaining time → waits for expiry → reconnects at original level, Athena admin bans user via management API → board SysOp sees notification
- Manual: forum flow, SysOp delete, mail compose/read, FOSS browse, who's online [*], page SysOp both states, broadcast from console, log viewer, kick user from SysOp console, temp ban + verify rejection message

---

## Phase 3: Retro Experience (Weeks 9–12)

**Deliverable:** System 7 window chrome, ANSI rendering, CRT effects, retro directory restyle, configurable client settings.

### 3.1 Terminal Rendering

Evaluate xterm.js (MIT, ~400KB). Use it or build lightweight ANSI parser: SGR only (colors/bold/underline), cursor (CUP/CUU/CUD/CUF/CUB), erase (ED/EL), box-drawing. **Strip all other sequences.** All user text still rendered as textContent.

### 3.2 System 7 Window Chrome

CSS-only: pinstripe title bar (repeating-linear-gradient), close/zoom boxes, 1px border, drop shadow. Board name in title bar. Wraps the terminal component.

### 3.3 Minor Features

- CRT scanlines (CSS), color schemes (classic/amber/green — all WCAG AA), font selection
- Board directory restyle with box-drawing and phone numbers (still modern UI wrapper)
- Settings panel: font, color scheme, scanlines, connection speed (fast/slow/instant)
- Screen file loading + ANSI rendering for splash/goodbye/menu/newuser

### Phase 3 Tests

- Unit: ANSI whitelist strips bad sequences, color schemes pass contrast check, screen loader handles ANSI
- Integration: ANSI art renders correctly, settings persist and apply
- Manual: all visual modes, settings panel, System 7 chrome, custom splash rendering

---

## Phase 4: Games, Chat, Gopher & Real-Time (Weeks 13–16)

**Deliverable:** IRC-style chat with /broadcast, 2 built-in games + custom game loading, Gopher browser, node-to-node messaging, voting.

### 4.1 IRC-Style Chat

**LLM prompt:** *Implement IRC-style multi-user chat for Athena Engine. On enter: clear, header (from board config name), last 20 from 100-message buffer, list room users, broadcast join. Text = broadcast. /who lists users. /msg <handle> <text> sends private (works for users anywhere on board via node-to-node). /me <action>. /quit returns to menu. SysOp: /broadcast <msg> sends sysop.broadcast to all peers (not just chat). Display: <Handle> regular, \* Handle action, [SysOp] broadcast, \*\*\* system \*\*\*. Flood: 5/sec burst → 10s mute. Chat max 500, /msg 300. Session warnings + sysop.broadcast appear during chat.*

### 4.2 Game Engine + Custom Game Loading

**LLM prompt:** *Implement modular game engine for Athena Engine. GameHandler interface: id, name, description, onJoin/onCommand/onLeave. GameContext: send(), scoped getState()/setState() (game_id in SQLite), getPlayerData()/setPlayerData(), exitGame(). On engine startup: register built-in games (trivia, hangman) from BoardConfig.games.builtin[]. For BoardConfig.games.custom[]: dynamically import each JS file, validate it exports GameHandler, register. If games.data overrides exist (e.g., custom trivia JSON), pass to built-in game. Wrap EVERY onCommand in try/catch — crash → error → main menu. Never crash server. Trivia: load from data file (board's custom or default), 10/round, 30s timer, leaderboard. Hangman: word list, 6-stage ASCII art. 80×24. Session timer continues during games.*

### 4.3 Gopher Simulator

**LLM prompt:** *Implement Gopher-style web browser for Athena Engine. New command area 'gopher'. [B]rowse from menu loads home menu from BoardConfig.gopher.homeLinks[]. Server-side fetching only via $fetch — validate URLs (reject private IPs, localhost, check allowedDomains/blockedDomains from config), timeout from config, max size from config. Rate limit from config per user. Parse with cheerio + @extractus/article-extractor. Link types: search (prompt query, parse results as numbered list), menu (extract links as numbered list), article (extract text, word-wrap 78 cols, paginate 20 lines). Commands: # follow, N/P page, B back (history stack, maxDepth from config), H home, S search, Q quit. All output as screen.display. No HTML/JS/CSS in output.*

### 4.4 Minor Features

- Node-to-node `/msg` from any area. Offline → "Use [M]ail."
- Voting booth: polls, one vote/user, ASCII bar chart. SysOp creates/closes.

### Phase 4 Tests

- Unit: game crash isolated, state scoped to game_id, custom game loads from JS file, invalid game JS rejected, flood triggers at 5/sec, /msg routes cross-area, offline /msg redirects to mail, vote uniqueness, Gopher fetches + formats, Gopher rejects private IPs, Gopher rate limit, Gopher maxDepth, Gopher disabled when config false
- Integration: two users chat, /msg from forums reaches user in chat, game persists across reconnect, custom trivia data loads, Gopher browse → search → follow → back → home, /broadcast from chat reaches all
- Manual: chat room, both games, Gopher Google search, Gopher Wikipedia article, /msg, polls

---

## Phase 5: Deployment & Admin Dashboard (Weeks 17–20)

**Deliverable:** Production on DO/PM2. Admin dashboard with provisioning. Module deployment workflow.

### 5.1 Admin Dashboard

Supabase Auth, admin-only. Built into the Athena Server.

**LLM prompt:** *Admin dashboard for Athena Server. Nuxt 4 + Nuxt UI v4 + Supabase Auth. Admin middleware. Pages: /admin/boards (Realtime live board list with status, users, last heartbeat), /admin/stats (charts from board_stats table — hourly snapshots), /admin/provision (form: board name, tagline, theme, SysOp, domain → generates API key shown once in modal + SHA-256 stored → inserts 'provisioned' → generates downloadable starter board.json with the board identity fields pre-filled + env var template), /admin/approve (list provisioned boards, preview board.json summary, flag if custom game JS present → approve/reject). Show maxRegisteredBoards from athena.config.ts and current count. WCAG 2.1 AA.*

### 5.2 Production Deployment

```bash
#!/bin/bash
# deploy-engine.sh <domain> <module-path>
apt update && apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs caddy fail2ban
npm install -g pnpm pm2
git clone <repo> /opt/athena && cd /opt/athena
pnpm install && cd packages/athena-engine && pnpm build
# Copy BBS Module to ./board/
cp -r /path/to/$module-path ./board
# Set env vars
export MODULE_PATH=./board
export SYSOP_HANDLE=ChrisR
export SYSOP_PASSWORD=<password>
export REGISTRY_URL=https://athena-rbbs.net
export REGISTRY_API_KEY=<key-from-provisioning>
export ALLOWED_ORIGINS=https://athena-rbbs.net
# Start
pm2 start .output/server/index.mjs --name athena-engine
pm2 save && pm2 startup
# Firewall
ufw limit 22/tcp
ufw allow 80/tcp && ufw allow 443/tcp && ufw default deny incoming && ufw --force enable
# fail2ban — auto-block IPs that trigger Caddy rate limits
cat > /etc/fail2ban/filter.d/caddy-ratelimit.conf << 'EOF'
[Definition]
failregex = ^.*"remote_ip":"<HOST>".*"status":429.*$
EOF
cat > /etc/fail2ban/jail.d/caddy.conf << 'EOF'
[caddy-ratelimit]
enabled = true
port = 80,443
filter = caddy-ratelimit
logpath = /var/log/caddy/access.log
maxretry = 50
findtime = 60
bantime = 3600
EOF
systemctl restart fail2ban
```

### 5.3 Minor Features

- Auto-registration: Nitro plugin on engine startup → POST to Athena Server → 60s heartbeat. SIGTERM → deregister.
- Backups: nightly `sqlite3 .backup` → DO Spaces. 30-day retention.
- SysOp guide (markdown): how to create a module, customize board.json, create ASCII screens, add custom games, deploy, moderate.

### Phase 5 Tests

- Unit: provisioning generates valid board.json template, auto-registration payload correct
- Integration: provision → deploy engine with module → approve → online in directory; stop → offline; restart → online; custom splash displays correctly
- E2E: Deploy Athena Server + engine with Golf Sucks module. Full journey: directory → connect → pirate splash → register → forums → mail → chat → Gopher → games → SysOp broadcast → session timeout. Provision second board through admin, deploy with different module (different name/theme/screens), verify in directory with its own identity.

---

## Phase 6: BBS Editor (Future)

**Deliverable:** Web-based BBS Module editor in the Athena admin dashboard.

### 6.1 Config Wizard

Step-by-step form: board identity (name, tagline, theme) → session settings (maxUsers, time limit, cooldown) → forums (add/remove/reorder) → games (select built-in, upload custom JS) → Gopher home menu (add/remove links) → FOSS categories.

Each step validates against the board.json Zod schema in real time. Preview panel shows the generated JSON.

### 6.2 ASCII Art Editor

In-browser 80×24 grid editor:
- Box-drawing character palette (all Unicode box-drawing: ─ │ ┌ ┐ └ ┘ ├ ┤ ┬ ┴ ┼ ═ ║ ╔ ╗ ╚ ╝ etc.)
- ANSI color picker (16 standard colors)
- Tools: text cursor, line draw, rectangle, fill
- Import: paste text or upload .ans file
- Preview: renders exactly as the terminal would display it
- Export: downloads .ans file

### 6.3 Preview Mode

Simulated terminal that renders the splash screen, main menu, and a sample forum listing using the module being edited. The SysOp sees what users will see.

### 6.4 Export + Submit

- **Export:** Download the complete module directory as a zip
- **Submit:** Upload to the Athena admin approval queue. Admin sees a summary page (board identity, forum list, game list, preview). No custom JS → eligible for auto-approval. Custom JS → manual code review required.

---

## Appendix A: Supabase Setup

1. Create Supabase project
2. Run SQL: boards table, boards_public view, board_stats table, RLS policies
3. Enable Realtime on boards table
4. Create admin user in Supabase Auth
5. Set env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY

## Appendix B: Security Checklist by Phase

| Phase | Items |
|-------|-------|
| 1 | Origin validation, auth timeout (30s), 8KB message max, JSON parse safety, type whitelist, 2 unauth/IP, reconnection (60s), login rate limit + tar pit, SysOp from env, banned user rejection (temp + permanent, with reason), input validation (all length caps), textContent rendering, structured logging, session time limit + cooldown, board.json Zod validation, screen file loading, connection rate limiter (10/min/IP), .gitignore (no .env/db/logs committed) |
| 2 | API key SHA-256, boards_public view (no hash exposure), RLS, approval gate, forum/mail input caps, MAX_REGISTERED_BOARDS from athena.config.ts, SysOp page 200 cap, broadcast level 9 + 300 cap, kick/ban system (temp + permanent + kick), management API (X-API-Key auth), Caddy rate limiting, fail2ban |
| 3 | ANSI escape whitelist (SGR/cursor/erase only), WCAG AA contrast on all color schemes |
| 4 | Game try/catch isolation, scoped state (game_id), custom game restricted context (no fs/fetch/process), chat flood 5/sec + 10s mute, length caps, /msg offline redirect, Gopher: server-side only, reject private IPs, allow/blocklist, 1MB+10s caps, 10/min rate limit, plain text only, maxDepth |
| 5 | Admin auth (Supabase), UFW firewall, SSH key-only, nightly backups, SIGTERM cleanup, admin reviews custom game code before approval |
| 6 | BBS Editor validates all output against Zod schema, custom JS flagged for manual review, no auto-approval with custom code |

## Appendix C: Configuration Reference

### athena.config.ts (Athena Server)

| Setting | Default | Description |
|---------|---------|-------------|
| network.name | "Athena RBBS Network" | Network display name |
| network.maxRegisteredBoards | 20 | Max boards in directory (1–100) |
| network.heartbeatInterval | 60000 | ms between heartbeat checks |
| network.heartbeatTimeout | 180000 | ms before marking board offline |
| network.requireApproval | true | Boards must be approved before going live |
| supabase.url | (required) | Supabase project URL |
| supabase.serviceRoleKey | (required) | Service role key |
| supabase.anonKey | (required) | Anon key |
| admin.networkSysOp | (required) | Network operator display name |

### board.json (BBS Module)

| Setting | Default | Range | Description |
|---------|---------|-------|-------------|
| board.name | (required) | 1–60 chars | Board name |
| board.tagline | "" | 0–120 chars | Subtitle |
| board.sysop | (required) | 1–40 chars | SysOp display name |
| board.theme | "" | freeform | Identity tag |
| board.maxUsers | 10 | 5–20 | Concurrent users |
| board.maxSessionMinutes | 30 | 15–120 | Session time limit |
| board.sessionCooldownMinutes | 60 | 0–1440 | Cooldown (0=disabled) |
| gopher.enabled | false | — | Enable [B]rowse |
| gopher.maxDepth | 5 | 1–10 | Max link depth |
| gopher.rateLimit | 10 | 1–30 | Fetches/min/user |
| gopher.fetchTimeout | 10000 | ms | Fetch timeout |
| gopher.maxPageSize | 1048576 | bytes | Max response (1MB) |

### Engine Environment Variables

| Variable | Description |
|----------|-------------|
| MODULE_PATH | Path to BBS Module directory (default: ./board) |
| SYSOP_HANDLE | First SysOp username |
| SYSOP_PASSWORD | First SysOp password |
| REGISTRY_URL | Athena Server URL |
| REGISTRY_API_KEY | From provisioning |
| ALLOWED_ORIGINS | WS origin allowlist (comma-separated) |
