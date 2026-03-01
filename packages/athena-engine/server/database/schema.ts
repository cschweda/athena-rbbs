import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ─── Users ──────────────────────────────────────────────────────────────────

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  handle: text('handle').unique().notNull(),
  password_hash: text('password_hash').notNull(),
  real_name: text('real_name'),
  location: text('location'),
  bio: text('bio'),
  access_level: integer('access_level').default(0).notNull(),
  call_count: integer('call_count').default(0).notNull(),
  total_time_minutes: integer('total_time_minutes').default(0).notNull(),
  last_login: text('last_login'),
  last_session_end: text('last_session_end'),
  max_session_override: integer('max_session_override'),
  banned_until: text('banned_until'),
  ban_reason: text('ban_reason'),
  banned_by: text('banned_by'),
  created_at: text('created_at').default(sql`(datetime('now'))`).notNull(),
});

// ─── Caller Log ─────────────────────────────────────────────────────────────

export const callerLog = sqliteTable('caller_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').references(() => users.id),
  connected_at: text('connected_at'),
  disconnected_at: text('disconnected_at'),
  ip_address: text('ip_address'),
});

// ─── Message Boards (Forums) ────────────────────────────────────────────────

export const messageBoards = sqliteTable('message_boards', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description'),
  access_level: integer('access_level').default(0).notNull(),
  sort_order: integer('sort_order').default(0).notNull(),
  is_active: integer('is_active').default(1).notNull(),
});

// ─── Messages (Forum Posts) ─────────────────────────────────────────────────

export const messages = sqliteTable('messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  board_id: integer('board_id').references(() => messageBoards.id).notNull(),
  parent_id: integer('parent_id'),
  author_id: integer('author_id').references(() => users.id).notNull(),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  is_deleted: integer('is_deleted').default(0).notNull(),
  created_at: text('created_at').default(sql`(datetime('now'))`).notNull(),
});

// ─── Message Read Status ────────────────────────────────────────────────────

export const messageReadStatus = sqliteTable('message_read_status', {
  user_id: integer('user_id').references(() => users.id).notNull(),
  board_id: integer('board_id').references(() => messageBoards.id).notNull(),
  last_read_message_id: integer('last_read_message_id').default(0).notNull(),
});

// ─── Mail ───────────────────────────────────────────────────────────────────

export const mail = sqliteTable('mail', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  from_user_id: integer('from_user_id').references(() => users.id).notNull(),
  to_user_id: integer('to_user_id').references(() => users.id).notNull(),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  is_read: integer('is_read').default(0).notNull(),
  created_at: text('created_at').default(sql`(datetime('now'))`).notNull(),
});

// ─── SysOp Pages ────────────────────────────────────────────────────────────

export const sysopPages = sqliteTable('sysop_pages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  from_user_id: integer('from_user_id').references(() => users.id).notNull(),
  message: text('message').notNull(),
  is_read: integer('is_read').default(0).notNull(),
  created_at: text('created_at').default(sql`(datetime('now'))`).notNull(),
});

// ─── FOSS Categories ────────────────────────────────────────────────────────

export const fossCategories = sqliteTable('foss_categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description'),
  sort_order: integer('sort_order').default(0).notNull(),
});

// ─── FOSS Links ─────────────────────────────────────────────────────────────

export const fossLinks = sqliteTable('foss_links', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  category_id: integer('category_id').references(() => fossCategories.id).notNull(),
  name: text('name').notNull(),
  description: text('description'),
  url: text('url').notNull(),
  language: text('language'),
  stars: integer('stars'),
  added_by: integer('added_by').references(() => users.id),
  created_at: text('created_at').default(sql`(datetime('now'))`).notNull(),
});

// ─── Game States ────────────────────────────────────────────────────────────

export const gameStates = sqliteTable('game_states', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  game_id: text('game_id').notNull(),
  state_json: text('state_json'),
  updated_at: text('updated_at').default(sql`(datetime('now'))`).notNull(),
});

// ─── Player Game Data ───────────────────────────────────────────────────────

export const playerGameData = sqliteTable('player_game_data', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').references(() => users.id).notNull(),
  game_id: text('game_id').notNull(),
  data_json: text('data_json'),
  updated_at: text('updated_at').default(sql`(datetime('now'))`).notNull(),
});

// ─── Polls ──────────────────────────────────────────────────────────────────

export const polls = sqliteTable('polls', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  question: text('question').notNull(),
  is_active: integer('is_active').default(1).notNull(),
  created_at: text('created_at').default(sql`(datetime('now'))`).notNull(),
});

export const pollOptions = sqliteTable('poll_options', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  poll_id: integer('poll_id').references(() => polls.id).notNull(),
  text: text('text').notNull(),
  sort_order: integer('sort_order').default(0).notNull(),
});

export const pollVotes = sqliteTable('poll_votes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  poll_id: integer('poll_id').references(() => polls.id).notNull(),
  option_id: integer('option_id').references(() => pollOptions.id).notNull(),
  user_id: integer('user_id').references(() => users.id).notNull(),
});
