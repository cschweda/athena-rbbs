# ATHENA RBBS — BBS Module Spec (v4.0)

**How to Build a Board**
March 2026

A BBS Module is a directory containing everything that makes a board unique: its identity, configuration, ASCII art, and optional custom content. The Athena Engine loads a module at startup and becomes that board. No framework knowledge required.

---

## What's in a Module

```
boards/golfsucks/
├── board.json              ← Single source of truth for this board
├── screens/
│   ├── splash.ans          ← Custom ASCII art: first thing users see
│   ├── goodbye.ans         ← Farewell screen on logout/timeout
│   ├── newuser.ans         ← Welcome screen during registration
│   └── menu.ans            ← Header displayed above the main menu
├── games/                  ← Optional custom game scripts
│   └── pirates-dice.js     ← Must export GameHandler interface
└── data/                   ← Optional custom data files
    └── trivia-pirate.json  ← Custom trivia questions for the trivia game
```

That's it. A JSON file, some text files, and optionally a couple of JS scripts. No Nuxt, no Vue, no build step.

---

## `board.json` Schema

This is the **complete, authoritative schema** for a BBS Module. Every field is documented. The engine validates this with Zod at startup — invalid config → clear error, won't boot.

```json
{
  "$schema": "https://athena-rbbs.net/schemas/board.v1.json",
  "version": "1.0.0",

  "board": {
    "name": "Golf Sucks",
    "tagline": "Abandon all bogeys",
    "sysop": "ChrisR",
    "theme": "pirate",
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
    {
      "name": "Forum Name",
      "description": "What this forum is about",
      "accessLevel": 0
    }
  ],

  "games": {
    "builtin": ["trivia", "hangman"],
    "custom": ["games/my-game.js"],
    "data": {
      "trivia": "data/my-trivia.json"
    }
  },

  "gopher": {
    "enabled": true,
    "maxDepth": 5,
    "rateLimit": 10,
    "fetchTimeout": 10000,
    "maxPageSize": 1048576,
    "homeLinks": [
      {
        "label": "Display Label",
        "url": "https://example.com",
        "type": "search | menu | article | submenu",
        "links": []
      }
    ],
    "blockedDomains": ["localhost", "127.0.0.1"]
  },

  "foss": {
    "categories": [
      {
        "name": "Category Name",
        "description": "What kind of links",
        "links": [
          {
            "name": "Project Name",
            "description": "What it does",
            "url": "https://github.com/...",
            "language": "Rust"
          }
        ]
      }
    ]
  }
}
```

### Field Reference

**`board`** — Required. The board's identity and behavior.

| Field | Type | Default | Range | Description |
|-------|------|---------|-------|-------------|
| `name` | string | (required) | 1–60 chars | Board name shown in directory and menus |
| `tagline` | string | `""` | 0–120 chars | Subtitle shown in directory |
| `sysop` | string | (required) | 1–40 chars | SysOp display name (for directory — actual auth uses env vars) |
| `theme` | string | `""` | freeform | Tag shown in directory: "pirate", "sci-fi", "writers", etc. |
| `maxUsers` | integer | `10` | 5–20 | Concurrent connections |
| `maxSessionMinutes` | integer | `30` | 15–120 | Session time limit |
| `sessionCooldownMinutes` | integer | `60` | 0–1440 | Cooldown between sessions (0=disabled) |

**`screens`** — Optional (engine uses plain-text defaults if missing). Paths relative to the module directory.

| Field | Description |
|-------|-------------|
| `splash` | First screen on connect. The board's personality. |
| `goodbye` | Shown on logout or session timeout. |
| `newuser` | Shown during registration. |
| `menu` | Header above the main menu options. |

**`forums`** — Optional (engine creates a "General" forum if omitted). Array of forum definitions.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `name` | string | (required) | Forum name |
| `description` | string | `""` | One-line description |
| `accessLevel` | integer | `0` | Minimum access level to read/post (0=all, 2=validated, 9=SysOp) |

**`games`** — Optional.

| Field | Type | Description |
|-------|------|-------------|
| `builtin` | string[] | IDs of built-in games to enable: `"trivia"`, `"hangman"` |
| `custom` | string[] | Relative paths to custom GameHandler JS files |
| `data` | object | Override data files for built-in games (e.g., custom trivia questions) |

**`gopher`** — Optional (disabled if omitted).

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable [B]rowse feature |
| `maxDepth` | integer | `5` | Max links deep before forcing back (1–10) |
| `rateLimit` | integer | `10` | Fetches per minute per user (1–30) |
| `fetchTimeout` | integer | `10000` | Timeout per fetch in ms |
| `maxPageSize` | integer | `1048576` | Max response size in bytes (1MB) |
| `homeLinks` | array | `[]` | Starting menu links (see below) |
| `allowedDomains` | string[] | `[]` | URL whitelist (empty = allow all) |
| `blockedDomains` | string[] | `["localhost","127.0.0.1"]` | URL blacklist (always applied) |

**`gopher.homeLinks[]`** — Gopher home menu entries.

| Field | Type | Description |
|-------|------|-------------|
| `label` | string | Display text in the menu |
| `url` | string | Target URL (omit for `submenu` type) |
| `type` | string | `"search"` (prompt + results), `"menu"` (link list), `"article"` (text extraction), `"submenu"` (static sub-menu) |
| `links` | array | For `submenu` type only: nested homeLinks entries |

**`foss`** — Optional.

| Field | Type | Description |
|-------|------|-------------|
| `categories` | array | Each with `name`, `description`, and `links[]` |
| `categories[].links[]` | array | Each with `name`, `description`, `url`, `language` (optional) |

---

## ASCII Screen Files

Plain text files with optional ANSI escape codes. Max 80 columns wide. The engine loads these at startup and sends them as `server.welcome`, `server.goodbye`, or `screen.display` messages.

**Allowed ANSI sequences:** SGR (colors, bold, underline), cursor movement (CUP/CUU/CUD/CUF/CUB), erase (ED/EL), box-drawing characters. All other escape sequences are stripped by the engine.

If a screen file is missing, the engine renders a plain-text fallback (e.g., `\r\n  Welcome to Golf Sucks\r\n`).

---

## Custom Game Scripts

A custom game is a JavaScript file that exports an object implementing the `GameHandler` interface:

```javascript
// games/pirates-dice.js
export default {
  id: 'pirates-dice',
  name: "Pirate's Dice",
  description: 'A game of bluffing and luck on the high seas',

  async onJoin(ctx) {
    ctx.send("Welcome to Pirate's Dice!");
    ctx.send("Type ROLL to begin, QUIT to leave.");
  },

  async onCommand(ctx, input) {
    const cmd = input.trim().toUpperCase();
    if (cmd === 'QUIT') return ctx.exitGame();
    if (cmd === 'ROLL') {
      const dice = Array.from({length: 5}, () => Math.floor(Math.random() * 6) + 1);
      ctx.send(`Your roll: [${dice.join('] [')}]`);
      // ... game logic using ctx.getState()/setState()/getPlayerData()/setPlayerData()
    }
  },

  async onLeave(ctx) {
    ctx.send("Fair winds, sailor!");
  }
};
```

**Rules:**
- Must export an object with `id`, `name`, `description`, `onJoin`, `onCommand`, `onLeave`
- Use `ctx.send()` for output, `ctx.getState()`/`ctx.setState()` for game state (scoped to this game in SQLite), `ctx.getPlayerData()`/`ctx.setPlayerData()` for per-player saves
- `ctx.exitGame()` returns the player to the main menu
- No `require()`, no `import` (except from the data/ directory), no `fs`, no `fetch`, no `process`, no `eval`. The engine wraps execution in a restricted context.
- Every `onCommand` call is wrapped in try/catch by the engine. A crash → error message to player → return to main menu. Never crashes the server.
- **Admin reviews all custom game code before board approval.** This is enforced by the approval gate — no board with custom games goes live without admin review.

---

## Golf Sucks: The Reference Module

Golf Sucks is the first RBBS and the template for all future boards. It's pirate-themed (the name has nothing to do with golf — "Abandon all bogeys"). It ships in the monorepo as the reference implementation.

### `boards/golfsucks/board.json`

```json
{
  "$schema": "https://athena-rbbs.net/schemas/board.v1.json",
  "version": "1.0.0",

  "board": {
    "name": "Golf Sucks",
    "tagline": "Abandon all bogeys",
    "sysop": "ChrisR",
    "theme": "pirate",
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
    { "name": "Treasure Hunts", "description": "Adventures, riddles, and loot", "accessLevel": 0 },
    { "name": "Tall Tales", "description": "Stories from the high seas", "accessLevel": 0 },
    { "name": "The Brig", "description": "Complaints and grievances", "accessLevel": 0 },
    { "name": "Crew Only", "description": "For validated members", "accessLevel": 2 }
  ],

  "games": {
    "builtin": ["trivia", "hangman"],
    "custom": [],
    "data": {
      "trivia": "data/trivia-pirate.json"
    }
  },

  "gopher": {
    "enabled": true,
    "maxDepth": 5,
    "rateLimit": 10,
    "fetchTimeout": 10000,
    "maxPageSize": 1048576,
    "homeLinks": [
      { "label": "🔍 Search the Web", "url": "https://www.google.com/search", "type": "search" },
      { "label": "📰 Hacker News", "url": "https://news.ycombinator.com", "type": "menu" },
      { "label": "🏴‍☠️ Pirate History", "url": "https://en.wikipedia.org/wiki/Golden_Age_of_Piracy", "type": "article" },
      { "label": "📖 Treasure Island (Full Text)", "url": "https://www.gutenberg.org/files/120/120-h/120-h.htm", "type": "article" },
      { "label": "⚓ SysOp's Picks", "type": "submenu", "links": [
        { "label": "Classic Pirate Ships", "url": "https://en.wikipedia.org/wiki/List_of_historical_ships", "type": "article" },
        { "label": "GitHub Trending", "url": "https://github.com/trending", "type": "menu" }
      ]}
    ],
    "blockedDomains": ["localhost", "127.0.0.1"]
  },

  "foss": {
    "categories": [
      {
        "name": "Pirate Tools",
        "description": "Plundering the open source seas",
        "links": []
      },
      {
        "name": "Retro Computing",
        "description": "Old machines, new tricks",
        "links": []
      }
    ]
  }
}
```

### `boards/golfsucks/screens/splash.ans`

```
    ⚓ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ⚓
    ┃                                    ┃
    ┃     ☠  G O L F   S U C K S  ☠     ┃
    ┃        "Abandon all bogeys"        ┃
    ┃                                    ┃
    ┃   ~~~/\___/\~~~~/\___/\~~~~        ┃
    ┃        \__|__/      \__|__/        ┃
    ┃   Sailing the digital seas since   ┃
    ┃            March 2026              ┃
    ┃                                    ┃
    ┃   Running Athena RBBS v1.0         ┃
    ┃   SysOp: ChrisR | Lines: 10       ┃
    ⚓ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ⚓
```

### `boards/golfsucks/screens/goodbye.ans`

```
    ⚓ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ⚓
    ┃                                    ┃
    ┃   Fair winds and following seas,   ┃
    ┃           sailor.                  ┃
    ┃                                    ┃
    ┃   Thanks for visiting Golf Sucks.  ┃
    ┃   Come back soon!                  ┃
    ┃                                    ┃
    ⚓ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ⚓
```

### `boards/golfsucks/data/trivia-pirate.json`

```json
{
  "questions": [
    {
      "question": "What was Blackbeard's real name?",
      "choices": ["Edward Teach", "Henry Morgan", "Jack Rackham", "Bartholomew Roberts"],
      "answer": 0
    },
    {
      "question": "What year did the Golden Age of Piracy begin?",
      "choices": ["1620", "1650", "1700", "1720"],
      "answer": 1
    }
  ]
}
```

---

## Example: A Different Board

A science fiction board built from the same module structure:

### `boards/starport/board.json` (abbreviated)

```json
{
  "$schema": "https://athena-rbbs.net/schemas/board.v1.json",
  "version": "1.0.0",
  "board": {
    "name": "Starport Alpha",
    "tagline": "Docking bay open — all species welcome",
    "sysop": "Commander Zyx",
    "theme": "sci-fi",
    "maxUsers": 15,
    "maxSessionMinutes": 45,
    "sessionCooldownMinutes": 30
  },
  "forums": [
    { "name": "Bridge Comms", "description": "General discussion" },
    { "name": "Engineering", "description": "Tech talk and troubleshooting" },
    { "name": "Holodeck", "description": "Creative writing and RP" }
  ],
  "games": {
    "builtin": ["trivia", "hangman"],
    "custom": ["games/space-trader.js"],
    "data": { "trivia": "data/trivia-scifi.json" }
  },
  "gopher": {
    "enabled": true,
    "homeLinks": [
      { "label": "NASA News", "url": "https://www.nasa.gov/news", "type": "menu" },
      { "label": "ArXiv Astrophysics", "url": "https://arxiv.org/list/astro-ph/new", "type": "menu" }
    ]
  }
}
```

Different name, different forums, different games, different Gopher links, different ASCII art. Same engine.

---

## How to Create a New Board

### Manual Method (Current)

1. **Copy the template:** `cp -r boards/golfsucks boards/myboard` (or use `boards/_template` for a blank start)
2. **Edit `board.json`:** Change name, tagline, theme, SysOp, forums, games, Gopher links, session limits
3. **Replace screens:** Create custom ASCII art in `screens/` (or keep the defaults to start)
4. **Optionally** add custom trivia questions in `data/` or custom game scripts in `games/`
5. **Submit to Athena admin** for provisioning — admin reviews `board.json` and any custom JS
6. **Receive** API key + deployment instructions
7. **Deploy:** Copy module to engine droplet, set env vars (SYSOP_HANDLE, SYSOP_PASSWORD, REGISTRY_API_KEY, REGISTRY_URL, ALLOWED_ORIGINS), start engine
8. **Admin approves** → board goes live in directory

### BBS Editor (Future Phase)

A **web-based editor** in the Athena admin dashboard that generates BBS Modules through a guided UI:

**Config Wizard:** Step through board identity (name, tagline, theme) → session settings → forum setup → game selection → Gopher home menu → FOSS categories. Each step has validation and preview.

**ASCII Art Editor:** In-browser editor with:
- 80×24 grid with monospace font
- Box-drawing character palette (─ │ ┌ ┐ └ ┘ ├ ┤ ┬ ┴ ┼ ═ ║ ╔ ╗ ╚ ╝ etc.)
- ANSI color picker (16 colors)
- Text tool, line tool, rectangle tool
- Import: paste or upload existing .ans files
- Preview: see exactly what users will see
- Export: save as .ans file

**Game Selector:** Browse available built-in games (with descriptions and screenshots). Enable/disable per board. Upload custom game JS with inline code viewer for admin review.

**Preview Mode:** Renders a simulated terminal showing the splash screen, main menu, and sample forum listing — so the SysOp can see what their board will look like before deploying.

**Export:** Downloads the complete `boards/myboard/` directory as a zip file, ready to deploy. Or, in a future iteration, one-click deploy to a DO droplet via API.

**Approval:** The editor submits the module to the Athena admin queue. Admin reviews the `board.json` (rendered as a summary page), previews the ASCII art, and reviews any custom game code. No custom JS → can be auto-approved. Custom JS → manual review required.

The editor doesn't bypass the approval gate. It just makes creation easier for non-technical SysOps.

---

## Environment Variables (Not in board.json)

Secrets are never stored in the module. They're set as environment variables on the engine host:

| Variable | Description |
|----------|-------------|
| `SYSOP_HANDLE` | First SysOp username (used for bootstrap on first boot) |
| `SYSOP_PASSWORD` | First SysOp password |
| `REGISTRY_URL` | Athena Server URL for registration/heartbeat |
| `REGISTRY_API_KEY` | API key from provisioning (shown once) |
| `ALLOWED_ORIGINS` | Comma-separated origin allowlist for WS connections |
| `MODULE_PATH` | Path to the BBS Module directory (default: `./board`) |

---

## Module Versioning

`board.json` includes a `version` field (semver). When the engine schema changes, the `$schema` URL updates. The engine checks compatibility at startup:

- **Minor schema change** (new optional field): engine loads, uses default for missing field, logs notice
- **Major schema change** (breaking): engine refuses to boot with clear error identifying what changed

This means old modules continue to work when the engine upgrades, with graceful handling of new features.

---

## What a Board Identity Really Is

The module system exists to answer one question: **what makes this board different from every other board?**

Golf Sucks is pirate-themed. Not because the code is different — the code is identical. It's pirate-themed because its `board.json` says the name is "Golf Sucks" and the tagline is "Abandon all bogeys." Because `screens/splash.ans` has anchors and skull-and-crossbones. Because the forums are "Treasure Hunts" and "Tall Tales." Because the trivia questions are about Blackbeard and the Golden Age of Piracy. Because the Gopher home menu links to pirate history.

A future MUD (multi-user dungeon) would be the ultimate identity-shaping feature. A pirate board running a naval adventure MUD is a fundamentally different community than a cyberpunk board running a hacker-themed MUD. The MUD would be a custom game script (`games/pirate-mud.js`) plus data files (`data/pirate-world.json`) — all within the module, all loaded by the same engine.

The module is the board's personality. The engine is just the stage.
