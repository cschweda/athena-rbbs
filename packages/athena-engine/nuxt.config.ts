export default defineNuxtConfig({
  compatibilityDate: '2025-03-01',

  nitro: {
    experimental: {
      websocket: true,
    },
    routeRules: {
      '/api/**': {
        cors: true,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      },
    },
  },

  typescript: {
    strict: true,
  },

  // Engine has no frontend pages — it's a pure API/WS server
  ssr: false,
  pages: false,
});
