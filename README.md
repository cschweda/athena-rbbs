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

- **Node.js** >= 22 (see `.nvmrc`)
- **pnpm** >= 10

```bash
# Use the correct Node version (if using nvm)
nvm use

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
- `/` — Board directory with cards showing name, tagline, SysOp, users, status, theme, and a generated node address

**Components:**
- `BoardDirectory` — Card grid, fetches from Server, caches in sessionStorage
- `ConnectionSequence` — Three-phase animated panel (Connecting → Negotiating → Connected)
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

### Screen template variables

Screen files (`.ans`) support template variables that are replaced with values from `board.json` at load time. This ensures `board.json` remains the single source of truth:

| Variable | Replaced with |
|----------|---------------|
| `{{board.name}}` | Board name from `board.json` |
| `{{board.tagline}}` | Board tagline |
| `{{board.sysop}}` | SysOp display name |
| `{{board.theme}}` | Theme tag |
| `{{board.maxUsers}}` | Max concurrent users |

Example screen file:
```
    ☠ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ☠
    ┃     {{board.name}}  RBBS             ┃
    ┃     "{{board.tagline}}"              ┃
    ┃     SysOp: {{board.sysop}}           ┃
    ☠ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ☠
```

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
| Origin validation | `ALLOWED_ORIGINS` env var, rejects missing and unknown origins |
| CORS | Restricted to configured origins (no wildcard `*`) |
| Proxy trust | `X-Forwarded-For` only read when `TRUST_PROXY=true` |
| Security headers | `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy` |
| Reserved handles | Blocks SYSOP, ADMIN, ROOT, SYSTEM, etc. from registration |
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
| SQLite permissions | Database files set to 0600 (owner-only) |
| WAL management | Auto-checkpoint and busy timeout configured |
| Reconnect pool | Bounded to 100 entries, sensitive data cleared |
| Health endpoints | No internal paths or config exposed |

---

## Production Deployment (DigitalOcean + Laravel Forge)

Everything runs on a **single DigitalOcean droplet** managed by [Laravel Forge](https://forge.laravel.com). All three services (client, server, engine) run as PM2 processes on different ports. Nginx reverse-proxies each subdomain to the correct port. Forge handles server provisioning, nginx configuration, SSL (Let's Encrypt), and deployment.

### Overview

```
Single DigitalOcean droplet ($6-12/mo)
│
├── nginx (managed by Forge)
│   ├── athena-rbbs.net               → localhost:3002 (client)
│   ├── api.athena-rbbs.net           → localhost:3000 (server/registry)
│   └── golfsucks.athena-rbbs.net     → localhost:3001 (engine, WebSocket)
│
├── PM2 process manager
│   ├── athena-client   (port 3002)   ~50MB RAM
│   ├── athena-server   (port 3000)   ~50MB RAM
│   └── athena-engine   (port 3001)   ~60MB RAM
│
└── boards/golfsucks/data/board.db    (SQLite, per-board)
```

Each Nitro server uses ~50-80MB RAM. A **$6/mo droplet** (1 vCPU, 1GB RAM, Ubuntu 24.04) comfortably runs all three services plus 2-3 boards. Move to a **$12/mo droplet** (2GB RAM) if you're running 4+ boards or expect sustained WebSocket traffic.

### 1. Create a server in Forge

1. Log into [forge.laravel.com](https://forge.laravel.com)
2. **Create Server** → select DigitalOcean as the provider
3. Pick the **$6/mo droplet** (1 vCPU, 1GB RAM, Ubuntu 24.04) — upgrade to $12/mo for multiple boards
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

Athena uses environment variables for all deployment-specific configuration: secrets (SysOp password), security settings (allowed origins, proxy trust), and host/port bindings. This keeps secrets out of the repository and lets the same codebase run identically in development and production — only the `.env` file changes.

A `.env.example` file is included in the repo as a reference. Copy it and fill in your values:

```bash
cp .env.example /home/forge/athena/.env
```

**Engine (.env):**
```bash
MODULE_PATH=/home/forge/athena/boards/golfsucks
SYSOP_HANDLE=ChrisR
SYSOP_PASSWORD=<strong-password>
ALLOWED_ORIGINS=https://athena-rbbs.net
TRUST_PROXY=true
```

**Server (.env):**
```bash
MODULE_PATH=/home/forge/athena/boards/golfsucks
ENGINE_PORT=3001
ENGINE_PUBLIC_HOST=golfsucks.athena-rbbs.net
ALLOWED_ORIGINS=https://athena-rbbs.net
```

| Variable | Service | Required | Description |
|----------|---------|----------|-------------|
| `MODULE_PATH` | Engine, Server | Yes | Absolute path to the board module directory |
| `SYSOP_HANDLE` | Engine | Yes | SysOp username (created on first boot) |
| `SYSOP_PASSWORD` | Engine | Yes | SysOp password (bcrypt-hashed at startup, never stored in plaintext) |
| `ALLOWED_ORIGINS` | Engine, Server | Yes | Comma-separated origin allowlist for CORS + WebSocket. Rejects all connections from unlisted origins |
| `TRUST_PROXY` | Engine | Production | Set `true` **only** when behind nginx/Forge. Tells the engine to read `X-Forwarded-For` for real client IPs — without this, all rate limiting sees the proxy's IP instead of the user's |
| `ENGINE_PORT` | Server | Yes | Port the engine listens on (used by board directory API) |
| `ENGINE_PUBLIC_HOST` | Server | Production | Public hostname for the engine (e.g., `golfsucks.athena-rbbs.net`). Without this, the board directory returns `localhost` which won't work for remote users |

**Why `.env` is required for deployment:** In development, `scripts/dev.sh` sets all env vars automatically. In production on a DigitalOcean droplet, there is no dev script — PM2 reads from the ecosystem config or `.env` file. The SysOp password, allowed origins, and proxy trust settings are security-critical and must be configured per-environment. The `.env` file is gitignored so secrets never enter the repository.

### 5. Start with PM2

PM2 keeps your services running across reboots, handles log rotation, and provides zero-downtime reloads.

**Create an ecosystem file** at `/home/forge/athena/ecosystem.config.cjs`:

```javascript
module.exports = {
  apps: [
    {
      name: 'athena-server',
      cwd: '/home/forge/athena/packages/athena-server',
      script: '.output/server/index.mjs',
      env: {
        PORT: 3000,
        MODULE_PATH: '/home/forge/athena/boards/golfsucks',
        ENGINE_PORT: '3001',
        ENGINE_PUBLIC_HOST: 'golfsucks.athena-rbbs.net',
        ALLOWED_ORIGINS: 'https://athena-rbbs.net',
      },
    },
    {
      name: 'athena-engine',
      cwd: '/home/forge/athena/packages/athena-engine',
      script: '.output/server/index.mjs',
      env: {
        PORT: 3001,
        MODULE_PATH: '/home/forge/athena/boards/golfsucks',
        SYSOP_HANDLE: 'ChrisR',
        SYSOP_PASSWORD: '<strong-password>',
        ALLOWED_ORIGINS: 'https://athena-rbbs.net',
        TRUST_PROXY: 'true',
      },
    },
    {
      name: 'athena-client',
      cwd: '/home/forge/athena/packages/client',
      script: '.output/server/index.mjs',
      env: {
        PORT: 3002,
        NUXT_PUBLIC_SERVER_URL: 'https://athena-rbbs.net',
      },
    },
  ],
};
```

Start all services:

```bash
cd /home/forge/athena

# Start everything
pm2 start ecosystem.config.cjs

# Persist across reboots
pm2 save
pm2 startup
```

Or start services individually:

```bash
cd /home/forge/athena/packages/athena-engine
pm2 start .output/server/index.mjs --name athena-engine
```

### 6. Create sites in Forge (nginx reverse proxy)

Each service needs a Forge site with an nginx reverse proxy. Forge creates the server block — you just edit the `location /` block.

1. In Forge, select your server → **Sites** → **New Site**
2. Domain: your subdomain (e.g., `golfsucks.athena-rbbs.net`)
3. Project type: **Static HTML** (we only need nginx config)
4. After creation, go to the site → **Nginx Configuration**
5. Replace the `location /` block:

**Client site** (`athena-rbbs.net` — what users visit):

```nginx
location / {
    proxy_pass http://127.0.0.1:3002;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

**Engine site** (`golfsucks.athena-rbbs.net` — WebSocket BBS):

```nginx
location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;

    # Required for WebSocket
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # Keep WebSocket connections alive (24 hours)
    proxy_read_timeout 86400;
    proxy_send_timeout 86400;
}
```

**Server/registry site** (`api.athena-rbbs.net` or path-based):

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

**Key nginx details:**
- `Upgrade` + `Connection` headers are **required** for WebSocket — without them, BBS connections will fail
- `proxy_read_timeout 86400` keeps long WebSocket sessions alive (default is 60s which kills BBS sessions)
- `TRUST_PROXY=true` on the engine tells it to read `X-Forwarded-For` for real client IPs (rate limiting, logging)

### 7. Enable SSL (Let's Encrypt)

1. In Forge, go to your site → **SSL**
2. Select **Let's Encrypt**
3. Click **Obtain Certificate**

Forge handles certificate provisioning and automatic renewal. No certbot, no cron jobs.

### 8. Adding more boards (same droplet)

Each additional board is just another PM2 process on a new port and a new Forge site. The same engine codebase powers every board — only the `MODULE_PATH` and port differ.

1. Create the board module: `cp -r boards/_template boards/starport`
2. Edit `boards/starport/board.json`
3. Add a new entry to `ecosystem.config.cjs`:

```javascript
{
  name: 'starport',
  cwd: '/home/forge/athena/packages/athena-engine',
  script: '.output/server/index.mjs',
  env: {
    PORT: 3003,
    MODULE_PATH: '/home/forge/athena/boards/starport',
    SYSOP_HANDLE: 'Nova',
    SYSOP_PASSWORD: '<password>',
    ALLOWED_ORIGINS: 'https://athena-rbbs.net',
    TRUST_PROXY: 'true',
  },
},
```

4. In Forge, add a new site for `starport.athena-rbbs.net` with the engine nginx config pointing to port 3003
5. Enable SSL for the new site
6. `pm2 start ecosystem.config.cjs && pm2 save`

Each board adds ~60MB RAM. A $6 droplet handles 3-4 boards; upgrade to $12 for more.

### 9. Forge deployment script

Connect your Git repo to the Forge site, then set a deployment script under **Deployments**:

```bash
cd /home/forge/athena
git pull origin main
pnpm install

# Build whichever packages changed
cd packages/athena-engine && pnpm build
cd ../athena-server && pnpm build
cd ../client && pnpm build

# Restart all services
pm2 restart ecosystem.config.cjs
```

### PM2 cheat sheet

```bash
pm2 list                      # Show all processes
pm2 restart athena-engine      # Restart one service
pm2 restart ecosystem.config.cjs  # Restart all services
pm2 stop athena-engine         # Stop
pm2 delete athena-engine       # Remove from PM2
pm2 logs athena-engine         # Stream logs
pm2 logs athena-engine --lines 100  # Last 100 lines
pm2 monit                      # CPU/memory dashboard
pm2 reload athena-engine       # Zero-downtime reload
pm2 flush                      # Clear log files
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
| **1** | Scaffolding, WebSocket auth, sessions, security hardening, client directory + terminal, board.json source of truth, deployment docs | **Complete** |
| **2** | Forums, mail, FOSS links, who's online, SysOp console | Planned |
| **3** | ANSI rendering, System 7 window chrome, CRT effects, color schemes | Planned |
| **4** | IRC-style chat, door games (trivia, hangman), Gopher browser, voting | Planned |
| **5** | Production deployment, admin dashboard, board provisioning | Planned |
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
