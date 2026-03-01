# ATHENA RBBS — Architecture & Philosophy (v4.0)

**A Modern Homage to Hermes, the Mac BBS System (~1991)**
March 2026

---

## What Is This?

Athena is a platform for running **Retro BBS** (RBBS) instances — small, intentional online communities that recreate the experience of dialing into a Macintosh BBS in the early 1990s. It's an homage to **Hermes**, the Mac-native BBS software developed by Scott Watson that powered countless boards in the late '80s and early '90s.

The name "Retro BBS" is deliberate: these aren't BBSes pretending to be old. They're modern web applications built with current technology (WebSockets, Nuxt 4, Tailwind 4, Supabase) that faithfully recreate the *feel* of the original experience — the text-mode interfaces, the menu-driven navigation, the intimate communities of a few simultaneous users, and a visual connection sequence that echoes the modem-era ritual of watching your terminal program dial, negotiate, and connect.

Critically, while the platform infrastructure (engine, client, server) is built with Nuxt 4 and Tailwind 4, the **BBS modules themselves are entirely framework-agnostic**. A board is defined by a `board.json` file, plain-text ASCII screen files, and optionally basic JavaScript game scripts. No Vue, no Nuxt, no build step, no framework knowledge required. A SysOp creates a board by editing JSON and text files — the engine handles everything else.

---

## Philosophy: Plain Text, Plain Sight

Athena is retro fun. Everything is intentionally **plain text and in the open:**

- No encrypted messaging, no private channels beyond basic `/msg`. This is a community board, not a secure communication platform.
- No binary file transfers, no uploads, no downloads. FOSS Links point to GitHub. The Gopher simulator fetches and renders text.
- All forum posts, mail, and chat messages are stored as plain text in SQLite. The SysOp can see everything — just like 1991.
- No cryptocurrency, no marketplace, no monetization hooks.
- Content is subject to SysOp moderation and Athena admin approval. Nothing illegal, nothing out of bounds.
- Custom game code is reviewed by the Athena admin before approval. No filesystem access, no raw database, no network calls from game code.

This philosophy isn't a limitation — it's the point. The simplicity is what makes it fun.

---

## The Engine/Module Architecture

The core insight: **every BBS runs the same software**. The only things that differ between "Golf Sucks" and "Starport Alpha" are configuration and content — the board name, the ASCII splash screen, the forum topics, the Gopher links, the enabled games. The WebSocket handler, authentication, forums engine, mail system, chat, Gopher pipeline, game framework — all identical.

So we separate the **engine** from the **content:**

**The Athena Engine** is a universal runtime. One codebase, one Nuxt 4 application. It contains all the logic: WebSocket handler, auth, forums, mail, chat, Gopher, game framework, ANSI rendering, session management, SysOp console. It reads a **BBS Module** at startup and becomes that board.

**A BBS Module** is a directory containing a `board.json` file (the single source of truth for that board's identity and configuration), ASCII screen files, and optionally custom game scripts. No framework knowledge required to create one. A BBS Module is **framework-agnostic data** — it could theoretically be consumed by any engine that understands the schema.

**The Athena Server** is the central registry and admin dashboard. It maintains the live directory of all boards, handles provisioning and approval, and (in a future phase) hosts the BBS Editor for creating modules through a web UI.

**The Athena Client** is the browser-based BBS browser that fetches the directory and connects users to boards.

```
┌──────────────────────────┐
│     Athena Client         │  Modern graphical UI (Nuxt 4 + Nuxt UI v4)
│     (BBS Browser)         │  Fetches directory, connects to boards
└────────────┬─────────────┘
             │
        ┌────┴────┐
        │  REST   │  WebSocket
        ▼         ▼
┌─────────────┐  ┌──────────────────────────────────────────┐
│ Athena      │  │ Athena Engine + BBS Module                │
│ Server      │  │                                           │
│ (Registry)  │  │  ┌─────────────┐  ┌───────────────────┐  │
│             │◄─│  │ Engine      │  │ Module:            │  │
│ athena.     │  │  │ (universal) │  │ board.json         │  │
│ config.ts   │  │  │ WS, auth,   │  │ screens/*.ans      │  │
│             │  │  │ forums,     │  │ games/*.js         │  │
│ Supabase    │  │  │ mail, chat, │  │ data/*.json        │  │
│             │  │  │ gopher,     │  │                    │  │
│ Dashboard   │  │  │ games       │  │ (Golf Sucks,       │  │
│ BBS Editor  │  │  │             │  │  Starport Alpha,   │  │
│             │  │  └─────────────┘  │  etc.)             │  │
└─────────────┘  │                   └───────────────────┘  │
                 │  SQLite (per-board)                       │
                 └──────────────────────────────────────────┘
```

---

## What Goes Where

### Athena Engine (universal — never changes per board)

- WebSocket server (Nitro crossws): connection lifecycle, origin validation, capacity, auth timeout, reconnection pool
- Authentication: bcrypt, session tokens, rate limiting, banned user rejection, SysOp bootstrap
- Session management: time limits, cooldowns, warnings, SysOp exemption
- Command router: area-based routing (main_menu, forums, mail, chat, gopher, game, sysop_console)
- Forums engine: threading, read tracking, moderation
- Mail system: compose, inbox, SysOp broadcast
- Chat engine: IRC-style multi-user, flood protection, /msg routing
- Gopher pipeline: server-side fetch, HTML extraction, text formatting, pagination
- Game framework: GameHandler interface, scoped context, error isolation, dynamic loading
- SysOp console: user management, board management, log viewer, live broadcast
- FOSS links browser
- Who's online
- Node-to-node messaging
- ANSI screen loader
- Structured JSON logging
- Registry auto-registration + heartbeat
- Input validation and sanitization
- SQLite database management (Drizzle ORM)

### BBS Module (changes per board — just data + optional scripts)

- `board.json` — identity, settings, forums, games, Gopher links, FOSS categories
- `screens/*.ans` — ASCII art (splash, goodbye, newuser, menu)
- `games/*.js` — optional custom GameHandler modules (reviewed by admin)
- `data/*.json` — optional custom game data (trivia questions, word lists, etc.)

### Athena Server (one instance for the whole network)

- `athena.config.ts` — network-level settings (TypeScript, single source of truth)
- Supabase: board registry, admin auth, realtime updates
- Admin dashboard: board management, provisioning, approval gate
- BBS Editor (future): web-based module creation wizard

### Athena Client (the browser app)

- Board directory (modern graphical Nuxt UI)
- Connection sequence (animated retro panel)
- Terminal display (monospace, textContent, ANSI rendering)
- Session timer display
- Settings (font, color scheme, scanlines, connection speed)

---

## Monorepo Structure

```
athena/
├── packages/
│   ├── athena-server/           # Registry + Admin + BBS Editor
│   │   ├── athena.config.ts     # ← Single source of truth (network)
│   │   ├── server/              # API routes, Supabase client
│   │   ├── pages/               # Admin dashboard, BBS Editor
│   │   └── nuxt.config.ts
│   ├── athena-engine/           # Universal RBBS runtime
│   │   ├── server/              # WS handler, command router, all features
│   │   ├── services/            # Forums, mail, chat, gopher, games
│   │   ├── config/              # board.json schema + loader (Zod)
│   │   ├── games/               # Built-in games (trivia, hangman)
│   │   └── nuxt.config.ts
│   └── client/                  # BBS browser
│       ├── components/          # Directory, ConnectionSequence, Terminal
│       ├── pages/
│       └── nuxt.config.ts
├── boards/                      # BBS Modules
│   ├── golfsucks/               # ← Reference template
│   │   ├── board.json
│   │   ├── screens/
│   │   ├── games/
│   │   └── data/
│   └── _template/               # Blank starter template
│       ├── board.json
│       └── screens/
├── shared/
│   └── types/                   # WSMessage, payloads, validation, limits
├── pnpm-workspace.yaml
└── package.json
```

---

## Deployment Models

The engine/module split enables flexibility:

### Model A: One Engine, One Board per Droplet (Default)

The standard deployment. Each board gets its own DO droplet running one instance of the Athena Engine loaded with one BBS Module. Full isolation. $6/mo per board.

```
DO Droplet ($6/mo)
├── Athena Engine (Nuxt 4 + Nitro + SQLite)
├── boards/golfsucks/board.json + screens/
├── PM2 (process manager)
└── Caddy (auto-TLS)
```

**Best for:** Most boards. Simple, isolated, predictable.

### Model B: Multi-Tenant (Future)

One Athena Engine process hosts multiple boards on different ports or subpaths. Each board has its own SQLite database and BBS Module, but shares the same Node.js process. Cheaper — one $6–$12 droplet runs several small boards.

**Best for:** Low-traffic boards, testing, the Athena admin running several boards on one box.

### Model C: Hybrid (Future)

Small boards share a multi-tenant server. Popular boards get their own droplet. The Athena admin allocates based on traffic. The BBS Module is the same either way — just deploy it to a different host.

---

## Configuration: Two Sources of Truth

### `athena.config.ts` — Network Level

One file at the root of `packages/athena-server/`. TypeScript for type safety and secret handling. Controls the entire RBBS network.

```typescript
// packages/athena-server/athena.config.ts
import { defineAthenaConfig } from './config/schema';

export default defineAthenaConfig({
  network: {
    name: 'Athena RBBS Network',
    maxRegisteredBoards: 20,
    heartbeatInterval: 60_000,      // ms
    heartbeatTimeout: 180_000,      // ms — 3 missed = offline
    requireApproval: true,
  },
  supabase: {
    url: process.env.SUPABASE_URL!,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    anonKey: process.env.SUPABASE_ANON_KEY!,
  },
  admin: {
    networkSysOp: 'ChrisR',
    contactEmail: 'sysop@athena-rbbs.net',
  },
});
```

Validated at startup with Zod. Bad config → clear error, won't start.

### `board.json` — Per-Board Level

One JSON file per BBS Module. Framework-agnostic. The single source of truth for everything about that board's identity, behavior, and content. See the **BBS Module Spec** document for the complete schema and Golf Sucks reference.

Secrets (SysOp password, API key) are the only values that come from environment variables — they're referenced in the engine's startup logic, not in `board.json`.

---

## The Client Experience

The Athena Client is a **graphical, modern web application** (Nuxt UI v4). The retro experience begins when you connect to a board.

### Step 1: Browse the Directory (No Login Required)

Open the client → see a styled card grid of active boards. Each card: name, tagline, SysOp, users/capacity, status, theme tag, generated "phone number." No registration needed to browse.

### Step 2: Connect

Click "Connect" → visual connection sequence (Dialing → Connecting → Connected). The animation echoes Mac terminal programs (ZTerm, Microphone II).

### Step 3: Register / Login (Per-Board)

No client-level accounts. Just like 1991 — separate account on every BBS. First visit: register. Return visit: login.

### Step 4: Use the Board

Terminal mode. Text, keyboard, menus. Forums, mail, chat, games, Gopher, links.

```
Main Menu:  ☠ GOLF SUCKS RBBS ☠
[F]orums  [M]ail  [C]hat  [G]ames
[B]rowse  [L]inks [W]ho's Online
[I]nfo    [P]age SysOp  [Q]uit
           Time remaining: 27:14
```

### Step 5: Session Limits

Default 30 minutes. Warnings at 5m, 2m, 1m. Goodbye screen → disconnect. 60-minute cooldown (configurable, 0 to disable). SysOp exempt.

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Athena Server | Nuxt 4 + Supabase (Postgres, Auth, Realtime) |
| Athena Engine | Nuxt 4 + Nitro WS (crossws) + SQLite (Drizzle + better-sqlite3) |
| Athena Client | Nuxt 4 + Nuxt UI v4 |
| BBS Modules | JSON + ASCII text + optional JS |
| Deploy | DO droplets, PM2, Caddy auto-TLS |
| Monorepo | pnpm workspaces |
| Validation | Zod (configs), shared TypeScript (protocol) |

---

## Visual Connection Sequence

Three phases in a styled monospace panel:

**Phase 1 — Dialing** (1.5s): Board name + generated phone number (deterministic from hostname) + animated spinner.

**Phase 2 — Connecting** (2–3s): Status lines scroll (CARRIER DETECT, NEGOTIATING PROTOCOL, ESTABLISHING SESSION) + progress bar. WebSocket actually opens here.

**Phase 3 — Connected** (0.5s): `CONNECT 14400` → dissolves into the board's custom ASCII splash screen.

**Failures:** `BUSY — All lines occupied (10/10)` or `NO CARRIER` or `Session cooldown active. Reconnect in X minutes.`

Total: 3–5 seconds (configurable: slow/fast/instant).
