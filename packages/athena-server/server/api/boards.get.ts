import type { BoardListResponse, BoardPublicInfo } from '@athena/types';

export default defineEventHandler((): BoardListResponse => {
  // Phase 1 stub: hardcoded Golf Sucks entry
  const boards: BoardPublicInfo[] = [
    {
      id: 'gs-001',
      name: 'Golf Sucks',
      tagline: 'Abandon all bogeys',
      sysop: 'ChrisR',
      theme: 'pirate',
      host: 'localhost:3001',
      websocketPath: '/_ws',
      maxUsers: 10,
      currentUsers: 0,
      status: 'online',
      established: '2026-03-01',
    },
  ];

  return { boards };
});
