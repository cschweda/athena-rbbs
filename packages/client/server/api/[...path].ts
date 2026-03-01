// Proxy /api/* requests to the Athena Server.
// In Docker, SERVER_INTERNAL_URL points to the server container (http://athena-server:3000).
// In dev, it defaults to http://localhost:3000.
export default defineEventHandler((event) => {
  const path = getRouterParam(event, 'path') || '';
  const target = process.env.SERVER_INTERNAL_URL || 'http://localhost:3000';
  return proxyRequest(event, `${target}/api/${path}`);
});
