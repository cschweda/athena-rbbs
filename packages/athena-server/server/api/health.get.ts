export default defineEventHandler(() => {
  return {
    service: 'athena-server',
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  };
});
