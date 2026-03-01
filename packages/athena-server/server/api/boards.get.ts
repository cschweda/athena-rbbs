import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import type { BoardListResponse, BoardPublicInfo } from '@athena/types';

export default defineEventHandler(async (): Promise<BoardListResponse> => {
  // Phase 1: read board.json from the configured module path
  // In production, this will be replaced by database-backed board registry
  const boards: BoardPublicInfo[] = [];

  const modulePath = process.env.MODULE_PATH || './board';
  const enginePort = process.env.ENGINE_PORT || '3001';

  // Fetch live user count from engine
  let currentUsers = 0;
  try {
    const health = await $fetch<{ currentUsers?: number }>(`http://localhost:${enginePort}/api/health`);
    currentUsers = health.currentUsers ?? 0;
  } catch { /* engine unreachable */ }

  try {
    const resolvedPath = resolve(modulePath);
    const raw = readFileSync(join(resolvedPath, 'board.json'), 'utf-8');
    const config = JSON.parse(raw);

    boards.push({
      id: 'gs-001',
      name: config.board.name,
      tagline: config.board.tagline,
      sysop: config.board.sysop,
      theme: config.board.theme,
      host: `localhost:${enginePort}`,
      websocketPath: '/_ws',
      maxUsers: config.board.maxUsers,
      currentUsers,
      status: 'online',
      established: '2026-03-01',
      debug: config.board.debug ?? true,
    });
  } catch {
    // Fallback if board.json can't be read
    boards.push({
      id: 'gs-001',
      name: 'Golf Sucks',
      tagline: 'Board configuration unavailable',
      sysop: 'Unknown',
      theme: 'pirate',
      host: `localhost:${enginePort}`,
      websocketPath: '/_ws',
      maxUsers: 10,
      currentUsers: 0,
      status: 'offline',
      established: '2026-03-01',
    });
  }

  return { boards };
});
