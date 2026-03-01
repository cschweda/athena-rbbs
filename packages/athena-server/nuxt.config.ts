export default defineNuxtConfig({
  compatibilityDate: '2025-03-01',

  typescript: {
    strict: true,
  },

  nitro: {
    routeRules: {
      '/api/**': {
        cors: true,
        headers: {
          'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGINS?.split(',')[0] || 'http://localhost:3002',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      },
    },
  },

  // Server is API-only for Phase 1
  ssr: false,
  pages: false,
});
