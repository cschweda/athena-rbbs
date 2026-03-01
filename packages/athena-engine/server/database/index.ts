import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import * as schema from './schema';
import type { BoardConfig } from '../../config/schema';

let db: ReturnType<typeof drizzle>;
let sqlite: InstanceType<typeof Database>;

export function initDatabase(dbPath: string, config: BoardConfig): typeof db {
  sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  db = drizzle(sqlite, { schema });

  // Create tables
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      handle TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      real_name TEXT,
      location TEXT,
      bio TEXT,
      access_level INTEGER NOT NULL DEFAULT 0,
      call_count INTEGER NOT NULL DEFAULT 0,
      total_time_minutes INTEGER NOT NULL DEFAULT 0,
      last_login TEXT,
      last_session_end TEXT,
      max_session_override INTEGER,
      banned_until TEXT,
      ban_reason TEXT,
      banned_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS caller_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      connected_at TEXT,
      disconnected_at TEXT,
      ip_address TEXT
    );

    CREATE TABLE IF NOT EXISTS message_boards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      access_level INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      board_id INTEGER NOT NULL REFERENCES message_boards(id),
      parent_id INTEGER,
      author_id INTEGER NOT NULL REFERENCES users(id),
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS message_read_status (
      user_id INTEGER NOT NULL REFERENCES users(id),
      board_id INTEGER NOT NULL REFERENCES message_boards(id),
      last_read_message_id INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, board_id)
    );

    CREATE TABLE IF NOT EXISTS mail (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_user_id INTEGER NOT NULL REFERENCES users(id),
      to_user_id INTEGER NOT NULL REFERENCES users(id),
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sysop_pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_user_id INTEGER NOT NULL REFERENCES users(id),
      message TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS foss_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS foss_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL REFERENCES foss_categories(id),
      name TEXT NOT NULL,
      description TEXT,
      url TEXT NOT NULL,
      language TEXT,
      stars INTEGER,
      added_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS game_states (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id TEXT NOT NULL,
      state_json TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS player_game_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      game_id TEXT NOT NULL,
      data_json TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS polls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS poll_options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      poll_id INTEGER NOT NULL REFERENCES polls(id),
      text TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS poll_votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      poll_id INTEGER NOT NULL REFERENCES polls(id),
      option_id INTEGER NOT NULL REFERENCES poll_options(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      UNIQUE(poll_id, user_id)
    );
  `);

  // Seed forums from board.json (idempotent)
  seedForums(config);

  return db;
}

function seedForums(config: BoardConfig): void {
  const existingBoards = sqlite.prepare('SELECT name FROM message_boards').all() as { name: string }[];
  const existingNames = new Set(existingBoards.map((b) => b.name));

  for (let i = 0; i < config.forums.length; i++) {
    const forum = config.forums[i];
    if (!existingNames.has(forum.name)) {
      sqlite.prepare(
        'INSERT INTO message_boards (name, description, access_level, sort_order) VALUES (?, ?, ?, ?)'
      ).run(forum.name, forum.description, forum.accessLevel, i);
    }
  }
}

export function getDb() {
  if (!db) throw new Error('Database not initialized');
  return db;
}

export function getRawDb() {
  if (!sqlite) throw new Error('Database not initialized');
  return sqlite;
}

export { schema };
