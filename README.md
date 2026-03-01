# Athena RBBS

A modern homage to [Hermes](https://en.wikipedia.org/wiki/Hermes_(BBS)), the Mac BBS software that powered countless boards in the late '80s and early '90s. Athena recreates the experience of dialing into a Macintosh BBS — text-mode interfaces, menu-driven navigation, intimate communities of a few simultaneous users — built with modern web technology.

These aren't BBSes pretending to be old. They're modern web applications (WebSockets, Nuxt 4, Tailwind) that faithfully recreate the _feel_ of the original experience.

---

## Architecture

Athena uses an **Engine/Module split**. One universal engine codebase loads a board-specific module (a JSON config file + ASCII screens) and becomes that board.

```
┌─────────────────────┐
│   Athena Client      │  Browser app (Nuxt 4 + Nuxt UI)
│   (BBS Browser)      │  Fetches directory, connects to boards
└──────────┬──────────┘
           │
      ┌────┴────┐
      │  REST   │  WebSocket
      ▼         ▼
┌───────────┐  ┌─────────────────────────────────────┐
│ Athena    │  │ Athena Engine + BBS Module            │
│ Server    │  │                                       │
│ (Registry)│  │  Engine         Module:                │
│           │  │  (universal)    board.json             │
│ Board     │  │  WS, auth,     screens/*.ans          │
│ directory │  │  forums, etc.  games/*.js              │
│           │  │                data/*.json             │
└───────────┘  │                                       │
               │  SQLite (per-board)                    │
               └─────────────────────────────────────┘
```

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Athena Server** | Nuxt 4 | Central registry — board directory, admin dashboard (Phase 2+) |
| **Athena Engine** | Nuxt 4 + Nitro WS (crossws) + SQLite (Drizzle) | Universal BBS runtime — loads a module, runs one board |
| **Client** | Nuxt 4 + Nuxt UI 4.x + Tailwind CSS v4 | Browser-based BBS browser — directory + terminal |
| **BBS Module** | JSON + ASCII text | Board identity: config, screens, optional game scripts |

---

## Monorepo Structure

```
athena-rbbs/
├── packages/
│   ├── athena-server/          # Board registry (port 3000)
│   ├── athena-engine/          # BBS runtime (port 3001)
│   └── client/                 # Browser frontend (port 3002)
├── boards/
│   ├── golfsucks/              # Reference module (pirate-themed)
│   │   ├── board.json          # Board config — name, forums, games, etc.
│   │   ├── screens/            # ASCII art: splash, goodbye, newuser, menu
│   │   └── data/               # Trivia questions, runtime SQLite DB
│   └── _template/              # Blank starter for new boards
├── shared/types/               # Shared TypeScript: WS protocol, validation
├── scripts/dev.sh              # Dev launcher with handshake checks
├── docs/                       # Architecture & specification documents
└── pnpm-workspace.yaml
```

---

## Prerequisites

- **Node.js** >= 22
- **pnpm** >= 10

```bash
# Install pnpm if you don't have it
npm install -g pnpm
```

---

## Quick Start (Development)

```bash
# Clone and install
git clone <repo-url> athena-rbbs
cd athena-rbbs
pnpm install

# Start all three services
pnpm dev
```

The dev launcher starts all three services, waits for them to be ready, runs a handshake check to verify they can communicate, then prints a dashboard:

```
  ✓ All systems go!

  ┌──────────────────────────────────────────────────────────────────────┐
  │                                                                      │
  │  BBS Client — what users see                          port 3002      │
  │  http://localhost:3002                                               │
  │                                                                      │
  │  Athena Server — board registry / admin API            port 3000     │
  │  http://localhost:3000/api/boards    board directory (JSON)           │
  │  http://localhost:3000/api/health    service health check             │
  │                                                                      │
  │  Athena Engine — Golf Sucks BBS                        port 3001     │
  │  http://localhost:3001/api/health    service health check             │
  │  ws://localhost:3001/_ws             WebSocket endpoint               │
  │                                                                      │
  │  Dev credentials                                                     │
  │  SysOp login    handle: ChrisR   password: test123                   │
  │  New account    type NEW at the handle prompt                        │
  │                                                                      │
  └──────────────────────────────────────────────────────────────────────┘
```

**Open http://localhost:3002** in your browser to see the board directory.

### What happens when you connect

1. The Client fetches the board list from the Server (`GET /api/boards`)
2. You click "Connect" on Golf Sucks
3. An animated connection sequence plays (Dialing → Connecting → Connected)
4. A WebSocket opens to the Engine (`ws://localhost:3001/_ws`)
5. The pirate splash screen appears
6. You register (type `NEW`) or login with the SysOp credentials
7. The main menu shows with a session countdown timer

### Individual services

You can also start services individually:

```bash
pnpm dev:server   # Just the registry (port 3000)
pnpm dev:engine   # Just the BBS engine (port 3001) — needs env vars
pnpm dev:client   # Just the browser client (port 3002)
```

When running the engine standalone, set these environment variables:

```bash
MODULE_PATH=../../boards/golfsucks
SYSOP_HANDLE=ChrisR
SYSOP_PASSWORD=test123
ALLOWED_ORIGINS=http://localhost:3002
```

### Dev logs

Each service logs to `/tmp/`:

```bash
tail -f /tmp/athena-server.log
tail -f /tmp/athena-engine.log
tail -f /tmp/athena-client.log
```

The engine uses structured JSON logging to stdout. Every event (connect, auth, rate limit, session timeout, etc.) is a JSON line with a timestamp and event type.

---

## The Three Services Explained

### Why three?

In production, the network has **one Server** (the central directory) but potentially **many Engines** — each running a different board on a different server. The Client talks to both: it asks the Server "what boards exist?" then connects directly to whichever Engine runs the board the user picked.

```
Browser
  ├── GET /api/boards ──→ Athena Server → "Golf Sucks is at golfsucks.athena-rbbs.net"
  │                                        "Starport Alpha is at starport.athena-rbbs.net"
  │
  └── WebSocket ──→ golfsucks.athena-rbbs.net/_ws → BBS session
```

For dev, all three run on localhost with different ports. The `pnpm dev` script handles this automatically.

### Athena Server (port 3000)

The central registry. In Phase 1 it's a stub returning a hardcoded board list. Phase 2 adds Supabase (Postgres, Auth, Realtime), an admin dashboard, board provisioning with API keys, and heartbeat monitoring.

**Endpoints:**
- `GET /api/boards` — Board directory (public, no auth)
- `GET /api/health` — Service health check

### Athena Engine (port 3001)

The BBS itself. Loads a board module (`board.json` + screens) at startup, creates a SQLite database, bootstraps the SysOp account, and runs a WebSocket server.

**What it handles:**
- WebSocket connections at `/_ws`
- User registration and login (bcrypt cost 12, 256-bit session tokens)
- Session time limits with warnings at 5/2/1 minutes
- Session cooldown between visits
- Reconnection within 60 seconds
- Rate limiting (5 login attempts/min/IP, 10 connections/min/IP)
- Ban enforcement (temp + permanent)
- Main menu with Phase 1 stubs for forums, mail, chat, etc.
- Structured JSON logging for every event

**Endpoints:**
- `GET /api/health` — Service health check

**Environment variables:**

| Variable | Required | Description |
|----------|----------|-------------|
| `MODULE_PATH` | Yes | Path to the BBS module directory |
| `SYSOP_HANDLE` | Yes | SysOp username (created on first boot) |
| `SYSOP_PASSWORD` | Yes | SysOp password |
| `ALLOWED_ORIGINS` | Yes | Comma-separated WebSocket origin allowlist |
| `REGISTRY_URL` | No | Athena Server URL (Phase 2+) |
| `REGISTRY_API_KEY` | No | API key from provisioning (Phase 2+) |

### Client (port 3002)

The browser frontend. Modern graphical UI (Nuxt UI) for the board directory. Retro terminal mode for BBS sessions.

**Pages:**
- `/` — Board directory with cards showing name, tagline, SysOp, users, status, theme, and a generated "phone number"

**Components:**
- `BoardDirectory` — Card grid, fetches from Server, caches in sessionStorage
- `ConnectionSequence` — Three-phase animated panel (Dialing → Connecting → Connected)
- `Terminal` — Monospace display with hidden input, blinking cursor, session timer status bar, warning overlays

---

## BBS Modules

A BBS module is everything that makes a board unique: identity, settings, ASCII art, forum topics, game config. No framework knowledge required — just edit JSON and text files.

### Module structure

```
boards/golfsucks/
├── board.json              # Board identity and configuration
├── screens/
│   ├── splash.ans          # First screen users see on connect
│   ├── goodbye.ans         # Shown on logout or session timeout
│   ├── newuser.ans         # Welcome screen during registration
│   └── menu.ans            # Header above the main menu
├── games/                  # Optional custom game scripts
└── data/
    ├── trivia-pirate.json  # Custom trivia questions
    └── board.db            # SQLite database (created at runtime, gitignored)
```

### board.json reference

```json
{
  "board": {
    "name": "Golf Sucks",           // 1-60 chars
    "tagline": "Abandon all bogeys", // 0-120 chars
    "sysop": "ChrisR",              // 1-40 chars, display name
    "theme": "pirate",              // freeform tag
    "maxUsers": 10,                 // 5-20 concurrent connections
    "maxSessionMinutes": 30,        // 15-120 minute session limit
    "sessionCooldownMinutes": 60    // 0-1440 min between sessions (0 = disabled)
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
    "custom": [],
    "data": { "trivia": "data/trivia-pirate.json" }
  }
}
```

The engine validates `board.json` with Zod at startup. Invalid config produces clear error messages and refuses to boot.

### Creating a new board

1. Copy the template: `cp -r boards/_template boards/myboard`
2. Edit `boards/myboard/board.json` — change name, tagline, theme, forums
3. Replace the screen files in `screens/` with your own ASCII art
4. Point the engine at it: `MODULE_PATH=boards/myboard`

---

## Configuration (Single Source of Truth)

Athena has two levels of configuration, each serving as the single source of truth for its scope:

### Network config: `athena.config.ts`

**File:** `packages/athena-server/athena.config.ts`

Controls the entire RBBS network. Validated with Zod at startup — invalid config produces clear error messages and refuses to boot.

```typescript
import { defineAthenaConfig } from './config/schema';

export default defineAthenaConfig({
  network: {
    name: 'Athena RBBS Network',     // Network display name
    maxRegisteredBoards: 20,          // Max boards allowed (1-100)
    heartbeatInterval: 60_000,        // Health check interval in ms
    heartbeatTimeout: 180_000,        // Mark board offline after this
    requireApproval: true,            // Approval gate for new boards
  },
  supabase: {
    url: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    anonKey: process.env.SUPABASE_ANON_KEY,
  },
  admin: {
    networkSysOp: 'ChrisR',
    contactEmail: 'admin@athena-rbbs.net',
  },
});
```

Secrets (Supabase keys, passwords) are always environment variables, never hardcoded.

### Per-board config: `board.json`

**File:** `boards/{boardname}/board.json`

The single source of truth for a board's identity, behavior, and content. The same Athena Engine codebase powers every board — what makes each board unique is only its `board.json` + content files.

See [BBS Modules](#bbs-modules) below for the full schema.

---

## Security

All security hardening is built in from Phase 1:

| Protection | Details |
|-----------|---------|
| Origin validation | `ALLOWED_ORIGINS` env var, reject all if empty |
| Auth timeout | 30 seconds to login or disconnected |
| Message size | 8KB max per WebSocket message |
| Login rate limit | 5 attempts/min/IP, 30-second tar pit on 6th |
| Connection rate limit | 10 new connections/min/IP |
| Unauthenticated cap | Max 2 unauthenticated connections per IP |
| Capacity | Board `maxUsers` enforced (default 10) |
| Password hashing | bcrypt cost 12, unique salt per password |
| Session tokens | 256-bit random (crypto.randomBytes) |
| Input validation | All lengths enforced server-side |
| XSS prevention | All user text rendered via `textContent`, never `innerHTML` |
| Ban system | Temp bans (1h-365d) + permanent, with reason display |
| Session limits | Time limit + cooldown, SysOp exempt |
| JSON safety | All parsing in try/catch, unknown types silently ignored |

---

## Production Deployment (DigitalOcean + Laravel Forge)

Each board runs on its own DigitalOcean droplet managed by [Laravel Forge](https://forge.laravel.com). The Athena Server runs on a separate droplet. Forge handles server provisioning, nginx configuration, SSL (Let's Encrypt), and deployment.

### Overview

```
Forge manages:
  ├── athena-rbbs.net (Server)        → DigitalOcean droplet
  │   └── Site: athena-rbbs.net       → reverse proxy → localhost:3000
  │
  ├── golfsucks.athena-rbbs.net       → DigitalOcean droplet
  │   └── Site: golfsucks.athena-rbbs.net → reverse proxy → localhost:3001
  │
  └── (more boards, each on its own droplet or sharing one)
```

### 1. Create a server in Forge

1. Log into [forge.laravel.com](https://forge.laravel.com)
2. **Create Server** → select DigitalOcean as the provider
3. Pick the **$6/mo droplet** (1 vCPU, 1GB RAM, Ubuntu 24.04)
4. Server type: **Web Server (Nginx)**
5. Forge provisions the server with nginx, firewall, and SSH keys automatically

### 2. Install Node.js and pnpm on the server

SSH into the server (Forge provides the SSH command):

```bash
# Install Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
sudo apt install -y nodejs

# Install pnpm and PM2
sudo npm install -g pnpm pm2
```

### 3. Clone and build

```bash
git clone <repo-url> /home/forge/athena
cd /home/forge/athena
pnpm install
```

**For a BBS Engine droplet:**
```bash
cd packages/athena-engine && pnpm build
```

**For the Athena Server droplet:**
```bash
cd packages/athena-server && pnpm build
```

**For the Client:**
```bash
cd packages/client && pnpm build
```

### 4. Set environment variables

Create `/home/forge/athena/.env`:

**Engine (.env):**
```bash
MODULE_PATH=/home/forge/athena/boards/golfsucks
SYSOP_HANDLE=ChrisR
SYSOP_PASSWORD=<strong-password>
REGISTRY_URL=https://athena-rbbs.net
REGISTRY_API_KEY=<key-from-provisioning>
ALLOWED_ORIGINS=https://athena-rbbs.net
```

**Server (.env):**
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<key>
SUPABASE_ANON_KEY=<key>
NETWORK_SYSOP=ChrisR
CONTACT_EMAIL=admin@athena-rbbs.net
```

### 5. Start with PM2

```bash
cd /home/forge/athena/packages/athena-engine

# Start the engine (or athena-server for the registry droplet)
pm2 start .output/server/index.mjs \
  --name athena-engine \
  --env-file /home/forge/athena/.env

# Persist across reboots
pm2 save
pm2 startup
```

### 6. Create a site in Forge (nginx reverse proxy)

1. In Forge, select your server → **Sites** → **New Site**
2. Domain: `golfsucks.athena-rbbs.net` (or `athena-rbbs.net` for the server)
3. Project type: **Static HTML** (we just need the nginx config)
4. After the site is created, go to the site → **Nginx Configuration**
5. Replace the `location /` block with a reverse proxy:

```nginx
location / {
    proxy_pass http://127.0.0.1:3001;  # 3000 for server, 3001 for engine, 3002 for client
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 86400;           # Keep WebSocket connections alive (24h)
}
```

The `Upgrade` and `Connection` headers are required for WebSocket connections to work through nginx.

### 7. Enable SSL (Let's Encrypt)

1. In Forge, go to your site → **SSL**
2. Select **Let's Encrypt**
3. Click **Obtain Certificate**

Forge handles certificate provisioning and automatic renewal. No Caddy, no certbot, no cron jobs.

### 8. Multiple boards on one server

For smaller deployments, you can run multiple boards on a single Forge server:

1. Create one Forge server
2. Add multiple sites (one per board subdomain)
3. Run each engine on a different port:

```bash
pm2 start .output/server/index.mjs --name golfsucks -- --port 3001
pm2 start .output/server/index.mjs --name starport  -- --port 3002
```

Point each site's nginx config to the correct port.

### 9. Forge deployment script (optional)

If you connect a Git repo to your Forge site, you can set a deployment script that runs on push:

```bash
cd /home/forge/athena
git pull origin main
pnpm install
cd packages/athena-engine
pnpm build
pm2 restart athena-engine
```

### PM2 management cheat sheet

```bash
pm2 list                    # Show all processes
pm2 restart athena-engine   # Restart
pm2 stop athena-engine      # Stop
pm2 delete athena-engine    # Remove from PM2
pm2 logs athena-engine      # Stream logs
pm2 monit                   # CPU/memory dashboard
pm2 reload athena-engine    # Zero-downtime reload
```

### Backups

```bash
# Nightly SQLite backup (add to Forge scheduler or crontab)
0 3 * * * sqlite3 /home/forge/athena/boards/golfsucks/data/board.db ".backup /home/forge/athena/boards/golfsucks/data/board-backup.db"
    ```

---

## WebSocket Protocol

All messages are JSON: `{ type, payload, timestamp }`. Max 8KB.

### Client → Engine

| Type | Payload | Description |
|------|---------|-------------|
| `auth.login` | `{ handle, password }` | Login attempt |
| `auth.register` | `{ handle, password }` | New account |
| `auth.reconnect` | `{ token }` | Restore session within 60s |
| `command.input` | `{ text }` | User typed something |

### Engine → Client

| Type | Payload | Description |
|------|---------|-------------|
| `auth.result` | `{ success, handle?, token?, error? }` | Auth response |
| `screen.display` | `{ content, clear?, speed? }` | Text to render |
| `command.prompt` | `{ prompt, mask?, maxLength? }` | Input prompt |
| `server.busy` | `{ message, current, max }` | At capacity |
| `server.welcome` | `{ content }` | Splash screen |
| `server.goodbye` | `{ content }` | Farewell screen |
| `session.warning` | `{ minutesRemaining }` | Time warning (5/2/1 min) |
| `session.timeout` | `{}` | Session expired |
| `error` | `{ message, code? }` | Error |

---

## Phase Roadmap

| Phase | Scope | Status |
|-------|-------|--------|
| **1** | Scaffolding, WebSocket, auth, sessions, client directory + terminal | **Complete** |
| **2** | Forums, mail, FOSS links, who's online, SysOp console, Supabase registry | Planned |
| **3** | ANSI rendering, System 7 window chrome, CRT effects, color schemes | Planned |
| **4** | IRC-style chat, door games (trivia, hangman), Gopher browser, voting | Planned |
| **5** | Production deployment, admin dashboard, provisioning workflow | Planned |
| **6** | Web-based BBS Editor for creating modules through a GUI | Planned |

---

## Philosophy

Everything is intentionally **plain text and in the open:**

- No encrypted messaging — this is a community board, not a secure platform
- No file transfers — FOSS links point to GitHub
- All content stored as plain text in SQLite — the SysOp can see everything, just like 1991
- No cryptocurrency, no marketplace
- Content subject to SysOp moderation
- The simplicity is the point
