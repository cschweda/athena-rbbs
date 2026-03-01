import { z } from 'zod';

// ─── Gopher Home Link Schema ───────────────────────────────────────────────

const gopherHomeLinkBase = z.object({
  label: z.string().min(1),
  url: z.string().url().optional(),
  type: z.enum(['search', 'menu', 'article', 'submenu']),
});

type GopherHomeLink = z.infer<typeof gopherHomeLinkBase> & {
  links?: GopherHomeLink[];
};

const gopherHomeLinkSchema: z.ZodType<GopherHomeLink> = gopherHomeLinkBase.extend({
  links: z.lazy(() => gopherHomeLinkSchema.array()).optional(),
});

// ─── FOSS Link Schema ──────────────────────────────────────────────────────

const fossLinkSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(''),
  url: z.string().url(),
  language: z.string().optional(),
});

const fossCategorySchema = z.object({
  name: z.string().min(1),
  description: z.string().default(''),
  links: z.array(fossLinkSchema).default([]),
});

// ─── Forum Schema ──────────────────────────────────────────────────────────

const forumSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(''),
  accessLevel: z.number().int().min(0).max(9).default(0),
});

// ─── Board.json Root Schema ────────────────────────────────────────────────

export const boardConfigSchema = z.object({
  $schema: z.string().optional(),
  version: z.string().default('1.0.0'),

  board: z.object({
    name: z.string().min(1).max(60),
    tagline: z.string().max(120).default(''),
    sysop: z.string().min(1).max(40),
    theme: z.string().default(''),
    maxUsers: z.number().int().min(5).max(20).default(10),
    maxSessionMinutes: z.number().int().min(15).max(120).default(30),
    sessionCooldownMinutes: z.number().int().min(0).max(1440).default(60),
    debug: z.boolean().default(true),
  }),

  screens: z.object({
    splash: z.string().default('screens/splash.ans'),
    goodbye: z.string().default('screens/goodbye.ans'),
    newuser: z.string().default('screens/newuser.ans'),
    menu: z.string().default('screens/menu.ans'),
  }).default({}),

  forums: z.array(forumSchema).default([
    { name: 'General', description: 'General discussion', accessLevel: 0 },
  ]),

  games: z.object({
    builtin: z.array(z.string()).default([]),
    custom: z.array(z.string()).default([]),
    data: z.record(z.string(), z.string()).default({}),
  }).default({}),

  gopher: z.object({
    enabled: z.boolean().default(false),
    maxDepth: z.number().int().min(1).max(10).default(5),
    rateLimit: z.number().int().min(1).max(30).default(10),
    fetchTimeout: z.number().int().min(1000).max(30000).default(10000),
    maxPageSize: z.number().int().min(1024).max(10485760).default(1048576),
    homeLinks: z.array(gopherHomeLinkSchema).default([]),
    allowedDomains: z.array(z.string()).default([]),
    blockedDomains: z.array(z.string()).default(['localhost', '127.0.0.1']),
  }).default({}),

  foss: z.object({
    categories: z.array(fossCategorySchema).default([]),
  }).default({}),
});

export type BoardConfig = z.infer<typeof boardConfigSchema>;
