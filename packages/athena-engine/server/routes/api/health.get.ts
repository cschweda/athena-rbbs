export default defineEventHandler(() => {
  return {
    service: 'athena-engine',
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    board: process.env.MODULE_PATH || 'not configured',
  };
});
